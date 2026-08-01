import type { UserPreferences } from "./types";
import { getRedis, isRedisConfigured } from "./redis";

const KEY_PREFIX = "tableside:prefs:v1:";
const PREFS_TTL_SECONDS = 60 * 60 * 24 * 180; // 180 days

export type SharedPreferencesRecord = {
  prefs: UserPreferences;
  updatedAt: string;
};

function prefsKey(lmsId: string): string {
  return KEY_PREFIX + lmsId;
}

export function isPrefsStoreConfigured(): boolean {
  return isRedisConfigured();
}

export async function getSharedPreferences(
  lmsId: string,
): Promise<SharedPreferencesRecord | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const value = await redis.get<SharedPreferencesRecord>(prefsKey(lmsId));
    if (!value?.prefs || typeof value.prefs !== "object") return null;
    return value;
  } catch {
    return null;
  }
}

export async function putSharedPreferences(args: {
  lmsId: string;
  prefs: UserPreferences;
}): Promise<SharedPreferencesRecord | null> {
  const redis = getRedis();
  if (!redis) return null;
  const record: SharedPreferencesRecord = {
    prefs: {
      ...args.prefs,
      playerId: args.lmsId,
    },
    updatedAt: new Date().toISOString(),
  };
  try {
    await redis.set(prefsKey(args.lmsId), record, { ex: PREFS_TTL_SECONDS });
    return record;
  } catch {
    return null;
  }
}
