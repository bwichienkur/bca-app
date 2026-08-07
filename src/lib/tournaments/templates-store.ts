import { getRedis, isRedisConfigured } from "@/lib/redis";
import { normalizePayMethod } from "@/lib/tournaments/options";
import type {
  TournamentTemplate,
  TournamentTemplateForm,
} from "@/lib/tournaments/types";

const KEY_PREFIX = "tableside:tournaments:templates:v1:";
const TTL_SECONDS = 60 * 60 * 24 * 365 * 2; // 2 years
const MAX_TEMPLATES = 40;

type TemplatesRecord = {
  userId: string;
  templates: TournamentTemplate[];
  updatedAt: string;
};

const globalForTemplates = globalThis as typeof globalThis & {
  __tablesideTournamentTemplatesMemory?: Map<string, TemplatesRecord>;
};

function memory(): Map<string, TemplatesRecord> {
  if (!globalForTemplates.__tablesideTournamentTemplatesMemory) {
    globalForTemplates.__tablesideTournamentTemplatesMemory = new Map();
  }
  return globalForTemplates.__tablesideTournamentTemplatesMemory;
}

function templatesKey(userId: string): string {
  return KEY_PREFIX + userId;
}

function newId(): string {
  return `tmpl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
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

function asNumber(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function asNullableNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeForm(raw: unknown): TournamentTemplateForm | null {
  if (!isRecord(raw)) return null;
  const gameType = asString(raw.gameType);
  const eventType = asString(raw.eventType);
  const bracketFormat = asString(raw.bracketFormat);
  const handicapSystem = asString(raw.handicapSystem);
  if (!gameType || !eventType || !bracketFormat || !handicapSystem) return null;

  const status =
    raw.status === "draft" || raw.status === "open" ? raw.status : "open";

  return {
    title: asString(raw.title),
    description: asString(raw.description),
    gameType: gameType as TournamentTemplateForm["gameType"],
    eventType: eventType as TournamentTemplateForm["eventType"],
    bracketFormat: bracketFormat as TournamentTemplateForm["bracketFormat"],
    breakFormat:
      raw.breakFormat === "loser-break" || raw.breakFormat === "alternate-break"
        ? raw.breakFormat
        : "winner-break",
    drawType:
      raw.drawType === "random" || raw.drawType === "custom"
        ? raw.drawType
        : "seeded",
    handicapSystem: handicapSystem as TournamentTemplateForm["handicapSystem"],
    handicapNotes: asString(raw.handicapNotes),
    rulesetPreset:
      raw.rulesetPreset === "wpa" || raw.rulesetPreset === "house"
        ? raw.rulesetPreset
        : "bca",
    winnersRaceTo: asNullableNumber(raw.winnersRaceTo),
    losersRaceTo: asNullableNumber(raw.losersRaceTo),
    maxFargo: asNullableNumber(raw.maxFargo),
    minRobustnessStatus:
      raw.minRobustnessStatus === "starter" ||
      raw.minRobustnessStatus === "preliminary" ||
      raw.minRobustnessStatus === "established"
        ? raw.minRobustnessStatus
        : null,
    unratedPolicy:
      raw.unratedPolicy === "cap-at-max" ||
      raw.unratedPolicy === "provisional" ||
      raw.unratedPolicy === "message-organizer"
        ? raw.unratedPolicy
        : "message-organizer",
    maxPlayers: Math.max(2, Math.floor(asNumber(raw.maxPlayers, 32))),
    teamSize: Math.max(1, Math.floor(asNumber(raw.teamSize, 1))),
    entryFeeCents: Math.max(0, Math.round(asNumber(raw.entryFeeCents, 0))),
    addedMoneyCents: Math.max(0, Math.round(asNumber(raw.addedMoneyCents, 0))),
    payMethod: normalizePayMethod(raw.payMethod),
    venmoHandle: asNullableString(raw.venmoHandle),
    zelleHandle: asNullableString(raw.zelleHandle),
    cashAppHandle: asNullableString(raw.cashAppHandle),
    payoutNotes: asString(raw.payoutNotes),
    registrationMode:
      raw.registrationMode === "open" || raw.registrationMode === "invite-only"
        ? raw.registrationMode
        : "approval",
    reportedToFargo: Boolean(raw.reportedToFargo),
    tableSize:
      raw.tableSize === "7ft" ||
      raw.tableSize === "8ft" ||
      raw.tableSize === "mixed"
        ? raw.tableSize
        : "9ft",
    venueName: asString(raw.venueName),
    venueAddress: asString(raw.venueAddress),
    city: asString(raw.city),
    region: asString(raw.region, "Palm Beach"),
    organizerPhone: asNullableString(raw.organizerPhone),
    status,
  };
}

function normalizeTemplate(raw: unknown): TournamentTemplate | null {
  if (!isRecord(raw)) return null;
  const id = asString(raw.id);
  const name = asString(raw.name).trim();
  const form = normalizeForm(raw.form);
  if (!id || !name || !form) return null;
  const createdAt = asString(raw.createdAt, new Date().toISOString());
  const updatedAt = asString(raw.updatedAt, createdAt);
  return { id, name, form, createdAt, updatedAt };
}

function normalizeRecord(
  userId: string,
  value: unknown,
): TemplatesRecord {
  if (!isRecord(value) || !Array.isArray(value.templates)) {
    return {
      userId,
      templates: [],
      updatedAt: new Date().toISOString(),
    };
  }
  const templates = value.templates
    .map((item) => normalizeTemplate(item))
    .filter((item): item is TournamentTemplate => item != null);
  return {
    userId,
    templates,
    updatedAt: asString(value.updatedAt, new Date().toISOString()),
  };
}

async function readRecord(userId: string): Promise<TemplatesRecord> {
  const redis = getRedis();
  if (redis) {
    try {
      const value = await redis.get<unknown>(templatesKey(userId));
      return normalizeRecord(userId, value);
    } catch {
      /* fall through to memory */
    }
  }
  return (
    memory().get(userId) ?? {
      userId,
      templates: [],
      updatedAt: new Date().toISOString(),
    }
  );
}

async function writeRecord(record: TemplatesRecord): Promise<void> {
  memory().set(record.userId, record);
  const redis = getRedis();
  if (!redis) return;
  await redis.set(templatesKey(record.userId), record, { ex: TTL_SECONDS });
}

export function tournamentTemplatesStoreMode(): "redis" | "memory" {
  return isRedisConfigured() ? "redis" : "memory";
}

export async function listTournamentTemplates(
  userId: string,
): Promise<TournamentTemplate[]> {
  const record = await readRecord(userId.trim());
  return record.templates;
}

export async function upsertTournamentTemplate(input: {
  userId: string;
  name: string;
  form: TournamentTemplateForm;
  id?: string;
}): Promise<TournamentTemplate[]> {
  const userId = input.userId.trim();
  if (!userId) throw new Error("User id is required.");
  const name = input.name.trim();
  if (!name) throw new Error("Template name is required.");
  const form = normalizeForm(input.form);
  if (!form) throw new Error("Template form is invalid.");

  const record = await readRecord(userId);
  const now = new Date().toISOString();
  const nameKey = name.toLowerCase();
  const byId = input.id
    ? record.templates.findIndex((item) => item.id === input.id)
    : -1;
  const byName = record.templates.findIndex(
    (item) => item.name.trim().toLowerCase() === nameKey,
  );
  const matchIndex = byId >= 0 ? byId : byName;

  const next: TournamentTemplate =
    matchIndex >= 0
      ? {
          ...record.templates[matchIndex]!,
          name,
          form,
          updatedAt: now,
        }
      : {
          id: newId(),
          name,
          form,
          createdAt: now,
          updatedAt: now,
        };

  const without =
    matchIndex >= 0
      ? record.templates.filter((_, index) => index !== matchIndex)
      : record.templates.filter((item) => item.id !== next.id);

  const templates = [next, ...without].slice(0, MAX_TEMPLATES);
  await writeRecord({
    userId,
    templates,
    updatedAt: now,
  });
  return templates;
}

export async function deleteTournamentTemplate(
  userId: string,
  templateId: string,
): Promise<TournamentTemplate[]> {
  const uid = userId.trim();
  const id = templateId.trim();
  if (!uid || !id) throw new Error("User id and template id are required.");
  const record = await readRecord(uid);
  const templates = record.templates.filter((item) => item.id !== id);
  await writeRecord({
    userId: uid,
    templates,
    updatedAt: new Date().toISOString(),
  });
  return templates;
}
