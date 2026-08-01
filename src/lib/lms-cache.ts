import { getRedis, isRedisConfigured } from "./redis";

const KEY_PREFIX = "tableside:lms:v1:";

/** TTLs tuned for data that changes slowly outside match nights. */
export const LMS_CACHE_TTL = {
  divisions: 24 * 60 * 60,
  format: 24 * 60 * 60,
  schedule: 24 * 60 * 60,
  playerList: 24 * 60 * 60,
  teamStandings: 24 * 60 * 60,
  playerStandings: 24 * 60 * 60,
  playersByTeam: 24 * 60 * 60,
  calculator: 24 * 60 * 60,
  match: 24 * 60 * 60,
  team: 8 * 60 * 60,
  teamPlayers: 8 * 60 * 60,
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

/**
 * Delete LMS cache keys from Redis.
 * Clears the whole `tableside:lms:v1:` namespace so matches/rosters refresh too.
 */
export async function invalidateLmsCaches(): Promise<{
  shared: boolean;
  deleted: number;
}> {
  const redis = getRedis();
  if (!redis) {
    return { shared: false, deleted: 0 };
  }

  let deleted = 0;
  let cursor = "0";

  do {
    const result = await redis.scan(cursor, {
      match: `${KEY_PREFIX}*`,
      count: 100,
    });
    const nextCursor = String(result[0]);
    const keys = result[1] as string[];
    cursor = nextCursor;
    if (keys.length > 0) {
      await redis.del(...keys);
      deleted += keys.length;
    }
  } while (cursor !== "0");

  return { shared: true, deleted };
}

export { isRedisConfigured as isLmsCacheConfigured };
