import { getRedis, isRedisConfigured } from "@/lib/redis";
import type {
  CreateTablesideLeagueInput,
  LeagueSystem,
  TablesideLeague,
} from "@/lib/leagues/types";

const INDEX_KEY = "tableside:leagues:index:v1";
const OWNER_KEY = (userId: string) => `tableside:leagues:owner:v1:${userId}`;
const leagueKey = (id: string) => `tableside:leagues:item:v1:${id}`;
const TTL_SECONDS = 60 * 60 * 24 * 365 * 5;

type MemoryStore = {
  leagues: Map<string, TablesideLeague>;
  byOwner: Map<string, Set<string>>;
};

const globalForLeagues = globalThis as typeof globalThis & {
  __tablesideLeagueMemory?: MemoryStore;
};

function memory(): MemoryStore {
  if (!globalForLeagues.__tablesideLeagueMemory) {
    globalForLeagues.__tablesideLeagueMemory = {
      leagues: new Map(),
      byOwner: new Map(),
    };
  }
  return globalForLeagues.__tablesideLeagueMemory;
}

function newId(): string {
  return `lg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function parseSystem(value: unknown): LeagueSystem {
  if (value === "bca" || value === "apa" || value === "tap" || value === "custom") {
    return value;
  }
  return "custom";
}

export function leagueStoreMode(): "redis" | "memory" {
  return isRedisConfigured() ? "redis" : "memory";
}

export async function getLeague(id: string): Promise<TablesideLeague | null> {
  const redis = getRedis();
  if (redis) {
    try {
      return (await redis.get<TablesideLeague>(leagueKey(id))) ?? null;
    } catch {
      // fall through
    }
  }
  return memory().leagues.get(id) ?? null;
}

export async function listLeaguesForOwner(
  ownerUserId: string,
): Promise<TablesideLeague[]> {
  const redis = getRedis();
  if (redis) {
    try {
      const ids = (await redis.smembers(OWNER_KEY(ownerUserId))) as string[];
      const rows = await Promise.all(
        ids.map((id) => redis.get<TablesideLeague>(leagueKey(id))),
      );
      return rows
        .filter((row): row is TablesideLeague => Boolean(row))
        .filter((row) => row.status !== "archived")
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    } catch {
      // fall through
    }
  }
  const ids = memory().byOwner.get(ownerUserId) ?? new Set();
  return [...ids]
    .map((id) => memory().leagues.get(id))
    .filter((row): row is TablesideLeague => Boolean(row))
    .filter((row) => row.status !== "archived")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function createLeague(input: {
  ownerUserId: string;
  ownerName?: string | null;
  ownerEmail?: string | null;
  body: CreateTablesideLeagueInput;
}): Promise<TablesideLeague> {
  const name = input.body.name?.trim() ?? "";
  if (name.length < 3) {
    throw new Error("League name must be at least 3 characters.");
  }
  const now = new Date().toISOString();
  const league: TablesideLeague = {
    id: newId(),
    name,
    system: parseSystem(input.body.system),
    region: (input.body.region ?? "").trim(),
    city: (input.body.city ?? "").trim(),
    description: (input.body.description ?? "").trim(),
    ownerUserId: input.ownerUserId,
    ownerName: input.ownerName ?? null,
    ownerEmail: input.ownerEmail ?? null,
    createdAt: now,
    updatedAt: now,
    status: "active",
  };

  const redis = getRedis();
  if (redis) {
    try {
      await redis.set(leagueKey(league.id), league, { ex: TTL_SECONDS });
      await redis.sadd(INDEX_KEY, league.id);
      await redis.sadd(OWNER_KEY(input.ownerUserId), league.id);
      return league;
    } catch {
      // fall through to memory
    }
  }

  memory().leagues.set(league.id, league);
  const owned = memory().byOwner.get(input.ownerUserId) ?? new Set();
  owned.add(league.id);
  memory().byOwner.set(input.ownerUserId, owned);
  return league;
}

export async function archiveLeague(
  id: string,
  ownerUserId: string,
): Promise<TablesideLeague | null> {
  const existing = await getLeague(id);
  if (!existing || existing.ownerUserId !== ownerUserId) return null;
  const next: TablesideLeague = {
    ...existing,
    status: "archived",
    updatedAt: new Date().toISOString(),
  };
  const redis = getRedis();
  if (redis) {
    try {
      await redis.set(leagueKey(id), next, { ex: TTL_SECONDS });
      return next;
    } catch {
      // fall through
    }
  }
  memory().leagues.set(id, next);
  return next;
}
