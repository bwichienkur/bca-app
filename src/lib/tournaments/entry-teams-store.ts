import { getRedis, isRedisConfigured } from "@/lib/redis";
import type {
  TournamentEntryTeam,
  TournamentEntryTeamMember,
} from "@/lib/tournaments/types";

const KEY_PREFIX = "tableside:tournaments:entry-teams:v1:";
const TTL_SECONDS = 60 * 60 * 24 * 365 * 2; // 2 years
const MAX_TEAMS = 40;

type EntryTeamsRecord = {
  userId: string;
  teams: TournamentEntryTeam[];
  updatedAt: string;
};

const globalForEntryTeams = globalThis as typeof globalThis & {
  __tablesideTournamentEntryTeamsMemory?: Map<string, EntryTeamsRecord>;
};

function memory(): Map<string, EntryTeamsRecord> {
  if (!globalForEntryTeams.__tablesideTournamentEntryTeamsMemory) {
    globalForEntryTeams.__tablesideTournamentEntryTeamsMemory = new Map();
  }
  return globalForEntryTeams.__tablesideTournamentEntryTeamsMemory;
}

function teamsKey(userId: string): string {
  return KEY_PREFIX + userId;
}

function newId(): string {
  return `ett_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  if (value == null) return null;
  return typeof value === "string" ? value : null;
}

function asNullableNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeMember(raw: unknown): TournamentEntryTeamMember | null {
  if (!isRecord(raw)) return null;
  const displayName = asString(raw.displayName).trim();
  if (!displayName) return null;
  return {
    displayName,
    ratingAtSignup: asNullableNumber(raw.ratingAtSignup),
    fargoPlayerId: asNullableString(raw.fargoPlayerId),
    readableId: asNullableString(raw.readableId),
  };
}

function normalizeTeam(raw: unknown): TournamentEntryTeam | null {
  if (!isRecord(raw)) return null;
  const id = asString(raw.id);
  const name = asString(raw.name).trim();
  const kind =
    raw.kind === "scotch-doubles" || raw.kind === "teams" ? raw.kind : null;
  if (!id || !name || !kind || !Array.isArray(raw.members)) return null;
  const members = raw.members
    .map((item) => normalizeMember(item))
    .filter((item): item is TournamentEntryTeamMember => item != null);
  if (kind === "scotch-doubles" && members.length < 1) return null;
  if (kind === "teams" && members.length < 1) return null;
  const createdAt = asString(raw.createdAt, new Date().toISOString());
  const updatedAt = asString(raw.updatedAt, createdAt);
  return { id, name, kind, members, createdAt, updatedAt };
}

function normalizeRecord(userId: string, value: unknown): EntryTeamsRecord {
  if (!isRecord(value) || !Array.isArray(value.teams)) {
    return {
      userId,
      teams: [],
      updatedAt: new Date().toISOString(),
    };
  }
  const teams = value.teams
    .map((item) => normalizeTeam(item))
    .filter((item): item is TournamentEntryTeam => item != null);
  return {
    userId,
    teams,
    updatedAt: asString(value.updatedAt, new Date().toISOString()),
  };
}

async function readRecord(userId: string): Promise<EntryTeamsRecord> {
  const redis = getRedis();
  if (redis) {
    try {
      const value = await redis.get<unknown>(teamsKey(userId));
      return normalizeRecord(userId, value);
    } catch {
      /* fall through */
    }
  }
  return (
    memory().get(userId) ?? {
      userId,
      teams: [],
      updatedAt: new Date().toISOString(),
    }
  );
}

async function writeRecord(record: EntryTeamsRecord): Promise<void> {
  memory().set(record.userId, record);
  const redis = getRedis();
  if (!redis) return;
  await redis.set(teamsKey(record.userId), record, { ex: TTL_SECONDS });
}

export function tournamentEntryTeamsStoreMode(): "redis" | "memory" {
  return isRedisConfigured() ? "redis" : "memory";
}

export async function listTournamentEntryTeams(
  userId: string,
  kind?: TournamentEntryTeam["kind"] | null,
): Promise<TournamentEntryTeam[]> {
  const record = await readRecord(userId.trim());
  if (!kind) return record.teams;
  return record.teams.filter((team) => team.kind === kind);
}

export async function upsertTournamentEntryTeam(input: {
  userId: string;
  name: string;
  kind: TournamentEntryTeam["kind"];
  members: TournamentEntryTeamMember[];
  id?: string;
}): Promise<TournamentEntryTeam[]> {
  const userId = input.userId.trim();
  if (!userId) throw new Error("User id is required.");
  const name = input.name.trim();
  if (!name) throw new Error("Team name is required.");
  if (input.kind !== "scotch-doubles" && input.kind !== "teams") {
    throw new Error("Team kind must be scotch-doubles or teams.");
  }
  const members = input.members
    .map((item) => normalizeMember(item))
    .filter((item): item is TournamentEntryTeamMember => item != null);
  if (members.length < 1) {
    throw new Error(
      input.kind === "scotch-doubles"
        ? "Add a partner to the pair."
        : "Add at least one teammate.",
    );
  }
  if (input.kind === "scotch-doubles" && members.length > 1) {
    throw new Error("Scotch doubles pairs have one partner.");
  }

  const record = await readRecord(userId);
  const now = new Date().toISOString();
  const nameKey = name.toLowerCase();
  const byId = input.id
    ? record.teams.findIndex((item) => item.id === input.id)
    : -1;
  const byName = record.teams.findIndex(
    (item) =>
      item.kind === input.kind && item.name.trim().toLowerCase() === nameKey,
  );
  const matchIndex = byId >= 0 ? byId : byName;

  const next: TournamentEntryTeam =
    matchIndex >= 0
      ? {
          ...record.teams[matchIndex]!,
          name,
          kind: input.kind,
          members,
          updatedAt: now,
        }
      : {
          id: newId(),
          name,
          kind: input.kind,
          members,
          createdAt: now,
          updatedAt: now,
        };

  const without =
    matchIndex >= 0
      ? record.teams.filter((_, index) => index !== matchIndex)
      : record.teams.filter((item) => item.id !== next.id);

  const teams = [next, ...without].slice(0, MAX_TEAMS);
  await writeRecord({
    userId,
    teams,
    updatedAt: now,
  });
  return teams;
}

export async function deleteTournamentEntryTeam(
  userId: string,
  teamId: string,
): Promise<TournamentEntryTeam[]> {
  const uid = userId.trim();
  const id = teamId.trim();
  if (!uid || !id) throw new Error("User id and team id are required.");
  const record = await readRecord(uid);
  const teams = record.teams.filter((item) => item.id !== id);
  await writeRecord({
    userId: uid,
    teams,
    updatedAt: new Date().toISOString(),
  });
  return teams;
}
