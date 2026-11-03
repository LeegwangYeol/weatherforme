import { Redis } from "@upstash/redis";
import { createHash } from "crypto";
import type { Grid } from "./kma";

// Upstash Redis 연결 — Vercel Storage 연동시 KV_*, Upstash 직접 연동시 UPSTASH_* 가 주입됨
const redisUrl =
  process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const redisToken =
  process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;

const redis =
  redisUrl && redisToken ? new Redis({ url: redisUrl, token: redisToken }) : null;

export interface SubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface SavedLocation {
  id: string;
  name: string;
  lat: number;
  lng: number;
  grid: Grid;
  // 출퇴근 브리핑용 역할 — 🏠 집 / 🏢 직장 (각각 최대 1개)
  role?: "home" | "work";
}

// 출퇴근 브리핑 설정
export interface CommuteConfig {
  enabled: boolean;
  morning: [number, number]; // 출근 시간대 (KST 시각, 기본 [7, 9])
  evening: [number, number]; // 퇴근 시간대 (기본 [18, 20])
  days: number[]; // 통근 요일 0=일 ~ 6=토 (기본 [1..5])
  briefingHour: number; // 아침 브리핑 발송 시각 (기본 7)
  briefingAlways: boolean; // true면 비 없어도 매일 발송
}

export interface UserRecord {
  id: string;
  subscription: SubscriptionData;
  location: {
    lat: number;
    lng: number;
  };
  grid: Grid;
  savedLocations?: SavedLocation[];
  commute?: CommuteConfig;
  createdAt: number;
}

const USERS_KEY = "wfm:users";
const NOTIFIED_PREFIX = "wfm:notified:";

// 구독 endpoint → 결정적 사용자 ID
export function subscriptionId(endpoint: string): string {
  return createHash("sha256").update(endpoint).digest("hex").slice(0, 16);
}

// ---------------------------------------------------------------------------
// 로컬 개발용 인메모리 폴백 (Redis 미설정시) — 서버리스 환경에선 유지되지 않으므로
// 배포시엔 반드시 Redis를 연결해야 함
// ---------------------------------------------------------------------------
const g = globalThis as unknown as {
  __wfmUsers?: UserRecord[];
  __wfmNotified?: Map<string, number>;
  __wfmCache?: Map<string, { value: unknown; expiresAt: number }>;
  __wfmCacheGet?: <T>(key: string) => Promise<T | null>;
  __wfmCacheSet?: (key: string, value: unknown, ttlSeconds: number) => Promise<void>;
};
g.__wfmUsers ??= [];
g.__wfmNotified ??= new Map();
g.__wfmCache ??= new Map();

export const isPersistent = Boolean(redis);

export const getUsers = async (): Promise<UserRecord[]> => {
  if (!redis) return g.__wfmUsers!;
  const data = await redis.get<UserRecord[]>(USERS_KEY);
  return data || [];
};

export const saveUser = async (user: UserRecord) => {
  if (!redis) {
    const idx = g.__wfmUsers!.findIndex((u) => u.id === user.id);
    if (idx >= 0) g.__wfmUsers![idx] = user;
    else g.__wfmUsers!.push(user);
    return;
  }

  const users = await getUsers();
  const idx = users.findIndex((u) => u.id === user.id);
  if (idx >= 0) users[idx] = user;
  else users.push(user);
  await redis.set(USERS_KEY, users);
};

export const removeUser = async (id: string) => {
  if (!redis) {
    g.__wfmUsers = g.__wfmUsers!.filter((u) => u.id !== id);
    return;
  }

  const users = (await getUsers()).filter((u) => u.id !== id);
  await redis.set(USERS_KEY, users);
};

// ---------------------------------------------------------------------------
// 범용 TTL 캐시 (역지오코딩, 기상청 예보/실황, 비구름 격자 등)
// L1(서버리스 인스턴스 메모리) + L2(Upstash Redis) 2계층 캐시로 CPU 및 네트워크 호출 최소화
// ---------------------------------------------------------------------------
const L1_MAX_ENTRIES = 250;
const L1_MAX_TTL_MS = 10 * 60 * 1000; // L1 메모리는 최대 10분 유지 (데이터 신선도 보장)

function l1Get<T>(key: string): T | null {
  const entry = g.__wfmCache!.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    g.__wfmCache!.delete(key);
    return null;
  }
  return entry.value as T;
}

function l1Set(key: string, value: unknown, ttlSeconds: number) {
  if (g.__wfmCache!.size >= L1_MAX_ENTRIES) {
    const firstKey = g.__wfmCache!.keys().next().value;
    if (firstKey !== undefined) g.__wfmCache!.delete(firstKey);
  }
  const ttlMs = Math.min(ttlSeconds * 1000, L1_MAX_TTL_MS);
  g.__wfmCache!.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const mem = l1Get<T>(key);
  if (mem !== null) return mem;
  if (!redis) return null;
  const val = await redis.get<T>(key);
  if (val !== null && val !== undefined) {
    l1Set(key, val, 300);
  }
  return val;
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number) {
  l1Set(key, value, ttlSeconds);
  if (!redis) return;
  await redis.set(key, value, { ex: ttlSeconds });
}

g.__wfmCacheGet = cacheGet;
g.__wfmCacheSet = cacheSet;

// ---------------------------------------------------------------------------
// 알림 중복 방지 — 알림 발송 후 쿨다운 동안 같은 사용자에게 재발송하지 않음
// ---------------------------------------------------------------------------
const cooldownSeconds = () =>
  (Number(process.env.NOTIFY_COOLDOWN_HOURS) || 3) * 3600;

export const wasNotifiedRecently = async (userId: string, gridKey: string): Promise<boolean> => {
  const cacheKey = `${userId}:${gridKey}`;
  if (!redis) {
    const expiry = g.__wfmNotified!.get(cacheKey);
    return expiry !== undefined && expiry > Date.now();
  }
  return (await redis.exists(NOTIFIED_PREFIX + cacheKey)) > 0;
};

export const markNotified = async (userId: string, gridKey: string) => {
  const cacheKey = `${userId}:${gridKey}`;
  if (!redis) {
    g.__wfmNotified!.set(cacheKey, Date.now() + cooldownSeconds() * 1000);
    return;
  }
  await redis.set(NOTIFIED_PREFIX + cacheKey, "1", { ex: cooldownSeconds() });
};
