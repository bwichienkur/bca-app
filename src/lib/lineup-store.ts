import type { LineupPreset } from "./types";
import { getRedis, isRedisConfigured } from "./redis";

const KEY_PREFIX = "tableside:scoring:lineups:v1:";
const LINEUP_TTL_SECONDS = 60 * 60 * 24 * 365; // 1 year

export type TeamLineupsRecord = {
  teamId: string;
  divisionId: string;
  presets: LineupPreset[];
  updatedAt: string;
};

function lineupsKey(teamId: string): string {
  return KEY_PREFIX + teamId;
}

export function isLineupStoreConfigured(): boolean {
  return isRedisConfigured();
}

function normalizePresets(value: unknown): LineupPreset[] {
  if (!value || typeof value !== "object") return [];
  const raw = value as Partial<TeamLineupsRecord>;
  if (!Array.isArray(raw.presets)) return [];
  return raw.presets.filter(
    (preset) =>
      preset &&
      typeof preset.id === "string" &&
      typeof preset.name === "string" &&
      typeof preset.teamId === "string" &&
      typeof preset.divisionId === "string" &&
      Array.isArray(preset.playerIds),
  );
}

export async function getTeamLineups(
  teamId: string,
): Promise<TeamLineupsRecord | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const value = await redis.get<unknown>(lineupsKey(teamId));
    if (!value || typeof value !== "object") return null;
    const raw = value as Partial<TeamLineupsRecord>;
    const presets = normalizePresets(value);
    return {
      teamId,
      divisionId: typeof raw.divisionId === "string" ? raw.divisionId : "",
      presets,
      updatedAt:
        typeof raw.updatedAt === "string"
          ? raw.updatedAt
          : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export async function listTeamLineupPresets(
  teamId: string,
  divisionId?: string | null,
): Promise<LineupPreset[]> {
  const record = await getTeamLineups(teamId);
  if (!record) return [];
  if (!divisionId) return record.presets;
  return record.presets.filter((preset) => preset.divisionId === divisionId);
}

export async function upsertTeamLineupPreset(
  preset: LineupPreset,
): Promise<LineupPreset[]> {
  const redis = getRedis();
  if (!redis) {
    throw new Error("Shared lineup store is not configured.");
  }

  const existing = (await getTeamLineups(preset.teamId))?.presets ?? [];
  const nameKey = preset.name.trim().toLowerCase();
  const matchIndex = existing.findIndex(
    (item) =>
      item.divisionId === preset.divisionId &&
      item.teamId === preset.teamId &&
      item.name.trim().toLowerCase() === nameKey,
  );

  const nextPreset: LineupPreset =
    matchIndex >= 0 ? { ...preset, id: existing[matchIndex]!.id } : preset;

  const withoutMatch =
    matchIndex >= 0
      ? existing.filter((_, index) => index !== matchIndex)
      : existing.filter((item) => item.id !== nextPreset.id);

  const presets = [nextPreset, ...withoutMatch].slice(0, 40);
  const record: TeamLineupsRecord = {
    teamId: preset.teamId,
    divisionId: preset.divisionId,
    presets,
    updatedAt: new Date().toISOString(),
  };
  await redis.set(lineupsKey(preset.teamId), record, {
    ex: LINEUP_TTL_SECONDS,
  });
  return presets;
}

export async function deleteTeamLineupPreset(
  teamId: string,
  presetId: string,
): Promise<LineupPreset[]> {
  const redis = getRedis();
  if (!redis) {
    throw new Error("Shared lineup store is not configured.");
  }

  const existing = (await getTeamLineups(teamId))?.presets ?? [];
  const presets = existing.filter((item) => item.id !== presetId);
  const divisionId = existing.find((item) => item.id === presetId)?.divisionId
    ?? existing[0]?.divisionId
    ?? "";
  const record: TeamLineupsRecord = {
    teamId,
    divisionId,
    presets,
    updatedAt: new Date().toISOString(),
  };
  await redis.set(lineupsKey(teamId), record, { ex: LINEUP_TTL_SECONDS });
  return presets;
}
