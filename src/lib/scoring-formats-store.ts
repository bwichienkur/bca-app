import { getRedis, isRedisConfigured } from "@/lib/redis";
import {
  BUILT_IN_SCORING_FORMAT_IDS,
  FORMAT_PALM_BEACH_5,
  LEAGUE_SCORING_FORMATS,
  mergeScoringFormatCatalog,
  normalizeScoringFormat,
  type LeagueScoringFormat,
  type ScoringFormatListItem,
  type ScoringFormatSource,
} from "@/lib/scoring-formats";

export type { ScoringFormatListItem, ScoringFormatSource };

const formatsKey = (leagueId: string) =>
  `tableside:scoring-formats:v1:${leagueId}`;
const TTL_SECONDS = 60 * 60 * 24 * 365 * 5;

type MemoryStore = {
  byLeague: Map<string, LeagueScoringFormat[]>;
};

const globalForFormats = globalThis as typeof globalThis & {
  __tablesideScoringFormatsMemory?: MemoryStore;
};

function memory(): MemoryStore {
  if (!globalForFormats.__tablesideScoringFormatsMemory) {
    globalForFormats.__tablesideScoringFormatsMemory = {
      byLeague: new Map(),
    };
  }
  return globalForFormats.__tablesideScoringFormatsMemory;
}

function newId(): string {
  return `sf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function scoringFormatsStoreMode(): "redis" | "memory" {
  return isRedisConfigured() ? "redis" : "memory";
}

/** Raw league-scoped rows only (overrides + custom). Built-ins are not stored. */
export async function listStoredScoringFormats(
  leagueId: string,
): Promise<LeagueScoringFormat[]> {
  const id = leagueId.trim();
  if (!id) return [];
  const redis = getRedis();
  if (redis) {
    try {
      const rows = (await redis.get<LeagueScoringFormat[]>(formatsKey(id))) ?? [];
      if (!Array.isArray(rows)) return [];
      return rows
        .map((row) => normalizeScoringFormat(row))
        .filter((row): row is LeagueScoringFormat => Boolean(row));
    } catch {
      // fall through
    }
  }
  return (memory().byLeague.get(id) ?? [])
    .map((row) => normalizeScoringFormat(row))
    .filter((row): row is LeagueScoringFormat => Boolean(row));
}

async function writeStoredScoringFormats(
  leagueId: string,
  formats: LeagueScoringFormat[],
): Promise<LeagueScoringFormat[]> {
  const id = leagueId.trim();
  const redis = getRedis();
  if (redis) {
    try {
      await redis.set(formatsKey(id), formats, { ex: TTL_SECONDS });
      memory().byLeague.set(id, formats);
      return formats;
    } catch {
      // fall through
    }
  }
  memory().byLeague.set(id, formats);
  return formats;
}

/** Built-ins + league overrides/customs for dropdowns and Score resolve. */
export async function listScoringFormatsForLeague(
  leagueId: string,
): Promise<LeagueScoringFormat[]> {
  const stored = await listStoredScoringFormats(leagueId);
  return mergeScoringFormatCatalog(stored);
}

export async function listScoringFormatItemsForLeague(
  leagueId: string,
): Promise<ScoringFormatListItem[]> {
  const stored = await listStoredScoringFormats(leagueId);
  const storedIds = new Set(stored.map((row) => row.id));
  const formats = mergeScoringFormatCatalog(stored);
  return formats.map((format) => {
    const isBuiltIn = BUILT_IN_SCORING_FORMAT_IDS.has(format.id);
    const isStored = storedIds.has(format.id);
    const source: ScoringFormatSource = isBuiltIn
      ? isStored
        ? "override"
        : "built-in"
      : "custom";
    return { ...format, source };
  });
}

export async function upsertScoringFormat(args: {
  leagueId: string;
  format: Partial<LeagueScoringFormat> & { id?: string | null };
}): Promise<LeagueScoringFormat> {
  const leagueId = args.leagueId.trim();
  if (!leagueId) throw new Error("leagueId is required.");

  const existing = await listStoredScoringFormats(leagueId);
  const requestedId = args.format.id?.trim() || "";
  const id = requestedId || newId();

  const builtIn = LEAGUE_SCORING_FORMATS.find((row) => row.id === id) ?? null;
  const priorStored = existing.find((row) => row.id === id) ?? null;
  const base = priorStored ?? builtIn ?? FORMAT_FALLBACK_FOR_NEW;

  const normalized = normalizeScoringFormat(
    { ...args.format, id },
    base,
  );
  if (!normalized) {
    throw Object.assign(new Error("Invalid scoring format."), { status: 400 });
  }

  const next = [
    ...existing.filter((row) => row.id !== normalized.id),
    normalized,
  ].sort((a, b) => a.label.localeCompare(b.label));

  await writeStoredScoringFormats(leagueId, next);
  return normalized;
}

const FORMAT_FALLBACK_FOR_NEW: LeagueScoringFormat = {
  ...FORMAT_PALM_BEACH_5,
  id: "draft",
  label: "Custom format",
  description: "",
};

/**
 * Remove a stored row. For built-in ids this resets the override.
 * Deleting a pure built-in (nothing stored) is a no-op error.
 */
export async function deleteScoringFormat(args: {
  leagueId: string;
  formatId: string;
}): Promise<{ removed: boolean; resetBuiltIn: boolean }> {
  const leagueId = args.leagueId.trim();
  const formatId = args.formatId.trim();
  if (!leagueId || !formatId) {
    throw Object.assign(new Error("leagueId and formatId are required."), {
      status: 400,
    });
  }

  const existing = await listStoredScoringFormats(leagueId);
  const had = existing.some((row) => row.id === formatId);
  if (!had) {
    if (BUILT_IN_SCORING_FORMAT_IDS.has(formatId)) {
      throw Object.assign(
        new Error("Built-in format has no league override to reset."),
        { status: 400 },
      );
    }
    throw Object.assign(new Error("Scoring format not found."), { status: 404 });
  }

  await writeStoredScoringFormats(
    leagueId,
    existing.filter((row) => row.id !== formatId),
  );
  return {
    removed: true,
    resetBuiltIn: BUILT_IN_SCORING_FORMAT_IDS.has(formatId),
  };
}
