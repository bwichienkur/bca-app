import { getRedis, isRedisConfigured } from "./redis";

const KEY_PREFIX = "tableside:lms:v1:";

/** TTLs tuned for data that changes slowly outside match nights. */
export const LMS_CACHE_TTL = {
  divisions: 60 * 60, // 1 hour
  format: 60 * 60,
  schedule: 30 * 60,
  playerList: 30 * 60,
  teamStandings: 10 * 60,
  playerStandings: 10 * 60,
  playersByTeam: 10 * 60,
  calculator: 10 * 60,
  match: 30 * 60,
  team: 15 * 60,
  teamPlayers: 15 * 60,
} as const;

export function lmsCacheKey(
  kind: string,
  id?: string,
): string {
  return id ? `${KEY_PREFIX}${kind}:${id}` : `${KEY_PREFIX}${kind}`;
}

/**
 * Read-through cache for parsed LMS JSON.
 * Misses call `loader`, then store the result with TTL.
 * When Redis is unset, behaves as a passthrough.
 */
export async function withLmsCache<T>(
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>,
): Promise<T> {
  const redis = getRedis();
  if (!redis) return loader();

  try {
    const cached = await redis.get<T>(key);
    if (cached != null) return cached;
  } catch {
    // Fall through to loader if Redis is unreachable.
  }

  const value = await loader();

  try {
    await redis.set(key, value, { ex: ttlSeconds });
  } catch {
    // Ignore write failures; still return fresh data.
  }

  return value;
}

export { isRedisConfigured as isLmsCacheConfigured };
