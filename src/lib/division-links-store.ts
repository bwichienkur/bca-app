import { getRedis, isRedisConfigured } from "@/lib/redis";
import type { DivisionLink } from "./division-links";

const linksKey = (leagueId: string) =>
  `tableside:division-links:v1:${leagueId}`;
const TTL_SECONDS = 60 * 60 * 24 * 365 * 5;

type MemoryStore = {
  byLeague: Map<string, DivisionLink[]>;
};

const globalForLinks = globalThis as typeof globalThis & {
  __tablesideDivisionLinksMemory?: MemoryStore;
};

function memory(): MemoryStore {
  if (!globalForLinks.__tablesideDivisionLinksMemory) {
    globalForLinks.__tablesideDivisionLinksMemory = {
      byLeague: new Map(),
    };
  }
  return globalForLinks.__tablesideDivisionLinksMemory;
}

function newId(): string {
  return `dl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function divisionLinksStoreMode(): "redis" | "memory" {
  return isRedisConfigured() ? "redis" : "memory";
}

export async function listDivisionLinks(
  leagueId: string,
): Promise<DivisionLink[]> {
  const id = leagueId.trim();
  if (!id) return [];
  const redis = getRedis();
  if (redis) {
    try {
      const rows = (await redis.get<DivisionLink[]>(linksKey(id))) ?? [];
      return Array.isArray(rows) ? rows : [];
    } catch {
      // fall through
    }
  }
  return memory().byLeague.get(id) ?? [];
}

async function writeDivisionLinks(
  leagueId: string,
  links: DivisionLink[],
): Promise<DivisionLink[]> {
  const id = leagueId.trim();
  const redis = getRedis();
  if (redis) {
    try {
      await redis.set(linksKey(id), links, { ex: TTL_SECONDS });
      memory().byLeague.set(id, links);
      return links;
    } catch {
      // fall through
    }
  }
  memory().byLeague.set(id, links);
  return links;
}

export async function upsertDivisionLink(args: {
  leagueId: string;
  link: Omit<DivisionLink, "id" | "createdAt" | "updatedAt"> & {
    id?: string;
  };
}): Promise<DivisionLink> {
  const existing = await listDivisionLinks(args.leagueId);
  const now = new Date().toISOString();
  const incomingIds = new Set([
    args.link.primaryDivisionId,
    args.link.linkedDivisionId,
  ]);

  // A division may belong to at most one link in the league.
  const filtered = existing.filter((link) => {
    if (args.link.id && link.id === args.link.id) return false;
    if (incomingIds.has(link.primaryDivisionId)) return false;
    if (incomingIds.has(link.linkedDivisionId)) return false;
    return true;
  });

  const prior = args.link.id
    ? existing.find((link) => link.id === args.link.id)
    : null;

  const next: DivisionLink = {
    id: args.link.id ?? prior?.id ?? newId(),
    name: args.link.name.trim(),
    leagueId: args.leagueId,
    primaryDivisionId: args.link.primaryDivisionId,
    primaryDivisionName: args.link.primaryDivisionName,
    linkedDivisionId: args.link.linkedDivisionId,
    linkedDivisionName: args.link.linkedDivisionName,
    mode: args.link.mode,
    createdAt: prior?.createdAt ?? now,
    updatedAt: now,
    updatedBy: args.link.updatedBy ?? prior?.updatedBy ?? null,
  };

  await writeDivisionLinks(args.leagueId, [...filtered, next]);
  return next;
}

export async function deleteDivisionLink(args: {
  leagueId: string;
  linkId: string;
}): Promise<boolean> {
  const existing = await listDivisionLinks(args.leagueId);
  const next = existing.filter((link) => link.id !== args.linkId);
  if (next.length === existing.length) return false;
  await writeDivisionLinks(args.leagueId, next);
  return true;
}

export async function findDivisionLinkInLeague(
  leagueId: string,
  divisionId: string,
): Promise<DivisionLink | null> {
  const links = await listDivisionLinks(leagueId);
  return (
    links.find(
      (link) =>
        link.primaryDivisionId === divisionId ||
        link.linkedDivisionId === divisionId,
    ) ?? null
  );
}
