import { Redis } from "@upstash/redis";

// Vercel KV (Upstash Redis) 연결 설정
// Vercel 프로젝트 설정의 Storage 탭에서 Redis를 연결하면 자동으로 환경 변수가 세팅됩니다.
const redis = process.env.KV_REST_API_URL 
  ? new Redis({
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
    })
  : null;

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
}

const REDIS_USERS_KEY = "weatherforme_users";

// 로컬 환경을 위한 인메모리 폴백 (Redis 미설정시 임시 동작)
let localUsers: UserRecord[] = [];

export const getUsers = async (): Promise<UserRecord[]> => {
  if (!redis) {
    console.warn("Redis가 설정되지 않았습니다. 인메모리 데이터를 반환합니다.");
    return localUsers;
  }
  const data = await redis.get<UserRecord[]>(REDIS_USERS_KEY);
  return data || [];
};

export const saveUser = async (user: UserRecord) => {
  if (!redis) {
    const existingIndex = localUsers.findIndex((u) => u.id === user.id);
    if (existingIndex >= 0) {
      localUsers[existingIndex] = user;
    } else {
      localUsers.push(user);
    }
    return;
  }

  const users = await getUsers();
  const existingIndex = users.findIndex((u) => u.id === user.id);
  
  if (existingIndex >= 0) {
    users[existingIndex] = user;
  } else {
    users.push(user);
  }
  
  await redis.set(REDIS_USERS_KEY, users);
};

export const removeUser = async (id: string) => {
  if (!redis) {
    localUsers = localUsers.filter((u) => u.id !== id);
    return;
  }

  let users = await getUsers();
  users = users.filter((u) => u.id !== id);
  await redis.set(REDIS_USERS_KEY, users);
};
