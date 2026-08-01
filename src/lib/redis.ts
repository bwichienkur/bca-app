import { Redis } from "@upstash/redis";

let redisClient: Redis | null | undefined;

function redisUrl(): string | undefined {
  return (
    process.env.UPSTASH_REDIS_REST_URL ||
    process.env.KV_REST_API_URL ||
    undefined
  );
}

function redisToken(): string | undefined {
  return (
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    process.env.KV_REST_API_TOKEN ||
    undefined
  );
}

/** True when Upstash / Vercel KV REST credentials are present. */
export function isRedisConfigured(): boolean {
  return Boolean(redisUrl() && redisToken());
}

/** Shared Upstash Redis client (null when env is unset). */
export function getRedis(): Redis | null {
  if (redisClient !== undefined) return redisClient;
  const url = redisUrl();
  const token = redisToken();
  if (!url || !token) {
    redisClient = null;
    return null;
  }
  redisClient = new Redis({ url, token });
  return redisClient;
}
