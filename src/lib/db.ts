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

export interface UserRecord {
  id: string;
  subscription: SubscriptionData;
  location: {
    lat: number;
    lng: number;
  };
  grid: Grid;
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
// 범용 TTL 캐시 (역지오코딩 결과 등)
// ---------------------------------------------------------------------------
export async function cacheGet<T>(key: string): Promise<T | null> {
  if (!redis) {
    const entry = g.__wfmCache!.get(key);
    if (!entry || entry.expiresAt < Date.now()) return null;
    return entry.value as T;
  }
  return await redis.get<T>(key);
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number) {
  if (!redis) {
    g.__wfmCache!.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
    return;
  }
  await redis.set(key, value, { ex: ttlSeconds });
}

// ---------------------------------------------------------------------------
// 알림 중복 방지 — 알림 발송 후 쿨다운 동안 같은 사용자에게 재발송하지 않음
// ---------------------------------------------------------------------------
const cooldownSeconds = () =>
  (Number(process.env.NOTIFY_COOLDOWN_HOURS) || 3) * 3600;

export const wasNotifiedRecently = async (userId: string): Promise<boolean> => {
  if (!redis) {
    const expiry = g.__wfmNotified!.get(userId);
    return expiry !== undefined && expiry > Date.now();
  }
  return (await redis.exists(NOTIFIED_PREFIX + userId)) > 0;
};

export const markNotified = async (userId: string) => {
  if (!redis) {
    g.__wfmNotified!.set(userId, Date.now() + cooldownSeconds() * 1000);
    return;
  }
  await redis.set(NOTIFIED_PREFIX + userId, "1", { ex: cooldownSeconds() });
};
