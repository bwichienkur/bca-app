import { getRedis, isRedisConfigured } from "@/lib/redis";
import {
  normalizeDivisionLink,
  type DivisionLink,
  linkLegDivisionIds,
} from "./division-links";
import {
  configFromLegs,
  normalizeNightLegs,
  type NightLeg,
} from "./division-link-config";

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
      return Array.isArray(rows) ? rows.map(normalizeDivisionLink) : [];
    } catch {
      // fall through
    }
  }
  return (memory().byLeague.get(id) ?? []).map(normalizeDivisionLink);
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
  link: {
    id?: string;
    name: string;
    leagueId: string;
    mode: DivisionLink["mode"];
    legs?: NightLeg[] | null;
    config?: DivisionLink["config"] | null;
    primaryDivisionId?: string;
    primaryDivisionName?: string;
    linkedDivisionId?: string;
    linkedDivisionName?: string;
    updatedBy?: string | null;
  };
}): Promise<DivisionLink> {
  const existing = await listDivisionLinks(args.leagueId);
  const now = new Date().toISOString();

  const draft = normalizeDivisionLink({
    id: args.link.id ?? "draft",
    name: args.link.name.trim(),
    leagueId: args.leagueId,
    mode: args.link.mode,
    legs: args.link.legs,
    config: args.link.config,
    primaryDivisionId: args.link.primaryDivisionId ?? "",
    primaryDivisionName: args.link.primaryDivisionName ?? "",
    linkedDivisionId: args.link.linkedDivisionId ?? "",
    linkedDivisionName: args.link.linkedDivisionName ?? "",
    createdAt: now,
    updatedAt: now,
    updatedBy: args.link.updatedBy ?? null,
  });

  const incomingIds = new Set(linkLegDivisionIds(draft));

  // A division may belong to at most one night format in the league.
  const filtered = existing.filter((link) => {
    if (args.link.id && link.id === args.link.id) return false;
    return !linkLegDivisionIds(link).some((id) => incomingIds.has(id));
  });

  const prior = args.link.id
    ? existing.find((link) => link.id === args.link.id)
    : null;

  const legs =
    draft.legs.length > 0
      ? draft.legs
      : normalizeNightLegs(args.link.legs);

  const next: DivisionLink = normalizeDivisionLink({
    id: args.link.id ?? prior?.id ?? newId(),
    name: args.link.name.trim(),
    leagueId: args.leagueId,
    legs,
    primaryDivisionId: legs[0]?.divisionId ?? "",
    primaryDivisionName: legs[0]?.divisionName ?? "",
    linkedDivisionId: legs[1]?.divisionId ?? "",
    linkedDivisionName: legs[1]?.divisionName ?? "",
    mode: args.link.mode,
    config: configFromLegs(legs),
    createdAt: prior?.createdAt ?? now,
    updatedAt: now,
    updatedBy: args.link.updatedBy ?? prior?.updatedBy ?? null,
  });

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
    links.find((link) => linkLegDivisionIds(link).includes(divisionId)) ?? null
  );
}
