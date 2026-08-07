import { getRedis, isRedisConfigured } from "./redis";
import { withLmsCache } from "./lms-cache";

const OP_PREFIX = "tableside:lms-op:v1:";
export const OPERATOR_CACHE_TTL = 24 * 60 * 60;

export function operatorCacheKey(
  kind: string,
  ...parts: Array<string | null | undefined>
): string {
  const suffix = parts.filter(Boolean).join(":");
  return suffix ? `${OP_PREFIX}${kind}:${suffix}` : `${OP_PREFIX}${kind}`;
}

export async function withOperatorCache<T>(
  key: string,
  loader: () => Promise<T>,
  options?: { bypass?: boolean },
): Promise<T> {
  if (options?.bypass) {
    const value = await loader();
    const redis = getRedis();
    if (redis) {
      try {
        await redis.set(key, value, { ex: OPERATOR_CACHE_TTL });
      } catch {
        // ignore
      }
    }
    return value;
  }
  return withLmsCache(key, OPERATOR_CACHE_TTL, loader);
}

export async function invalidateOperatorCache(options?: {
  leagueId?: string | null;
  divisionId?: string | null;
}): Promise<number> {
  const redis = getRedis();
  if (!redis) return 0;

  const patterns = new Set<string>([`${OP_PREFIX}leagues`]);
  if (options?.leagueId) {
    patterns.add(`${OP_PREFIX}divisions:${options.leagueId}*`);
    patterns.add(`${OP_PREFIX}playoff:${options.leagueId}`);
  } else {
    patterns.add(`${OP_PREFIX}divisions:*`);
    patterns.add(`${OP_PREFIX}playoff:*`);
  }
  if (options?.divisionId) {
    const d = options.divisionId;
    patterns.add(`${OP_PREFIX}locations:${d}`);
    patterns.add(`${OP_PREFIX}teams:${d}`);
    patterns.add(`${OP_PREFIX}players:${d}`);
    patterns.add(`${OP_PREFIX}schedule:${d}`);
    patterns.add(`${OP_PREFIX}settings:${d}`);
    patterns.add(`${OP_PREFIX}matches:${d}:*`);
  } else {
    patterns.add(`${OP_PREFIX}locations:*`);
    patterns.add(`${OP_PREFIX}teams:*`);
    patterns.add(`${OP_PREFIX}players:*`);
    patterns.add(`${OP_PREFIX}schedule:*`);
    patterns.add(`${OP_PREFIX}settings:*`);
    patterns.add(`${OP_PREFIX}matches:*`);
  }

  let deleted = 0;
  for (const pattern of patterns) {
    let cursor = "0";
    do {
      const result = await redis.scan(cursor, {
        match: pattern,
        count: 100,
      });
      cursor = String(result[0]);
      const keys = result[1] as string[];
      if (keys.length > 0) {
        await redis.del(...keys);
        deleted += keys.length;
      }
    } while (cursor !== "0");
  }
  return deleted;
}

export { isRedisConfigured as isOperatorCacheConfigured };
