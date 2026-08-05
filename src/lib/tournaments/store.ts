import { getRedis, isRedisConfigured } from "@/lib/redis";
import {
  defaultCalcutta,
  normalizeCalcutta,
  syncCalcuttaLots,
} from "@/lib/tournaments/calcutta";
import {
  defaultTeamSize,
  meetsMinRobustness,
  minRobustnessLabel,
} from "@/lib/tournaments/options";
import type {
  CreateTournamentInput,
  RegistrationStatus,
  RegistrationTeammate,
  RobustnessStatus,
  Tournament,
  TournamentCalcutta,
  TournamentListItem,
  TournamentMessage,
  TournamentRegistration,
} from "@/lib/tournaments/types";

const INDEX_KEY = "tableside:tournaments:index:v1";
const tournamentKey = (id: string) => `tableside:tournaments:event:v1:${id}`;
const regsKey = (id: string) => `tableside:tournaments:regs:v1:${id}`;
const messagesKey = (id: string) => `tableside:tournaments:msgs:v1:${id}`;
const calcuttaKey = (id: string) => `tableside:tournaments:calcutta:v1:${id}`;
const TTL_SECONDS = 60 * 60 * 24 * 365 * 2;

type MemoryStore = {
  tournaments: Map<string, Tournament>;
  registrations: Map<string, TournamentRegistration[]>;
  messages: Map<string, TournamentMessage[]>;
  calcuttas: Map<string, TournamentCalcutta>;
};

const globalForTournaments = globalThis as typeof globalThis & {
  __tablesideTournamentMemory?: MemoryStore;
};

function memory(): MemoryStore {
  if (!globalForTournaments.__tablesideTournamentMemory) {
    globalForTournaments.__tablesideTournamentMemory = {
      tournaments: new Map(),
      registrations: new Map(),
      messages: new Map(),
      calcuttas: new Map(),
    };
  }
  const store = globalForTournaments.__tablesideTournamentMemory;
  if (!store.calcuttas) store.calcuttas = new Map();
  return store;
}

export type TournamentFilters = {
  q?: string;
  region?: string;
  city?: string;
  gameType?: string;
  status?: string;
  eligibleForFargo?: number | null;
};

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function matchesFilters(t: Tournament, filters: TournamentFilters): boolean {
  if (filters.region && t.region !== filters.region) return false;
  if (filters.city) {
    const q = filters.city.trim().toLowerCase();
    if (
      !t.city.toLowerCase().includes(q) &&
      !t.venueName.toLowerCase().includes(q)
    ) {
      return false;
    }
  }
  if (filters.gameType && t.gameType !== filters.gameType) return false;
  if (filters.status && t.status !== filters.status) return false;
  if (filters.eligibleForFargo != null) {
    const f = filters.eligibleForFargo;
    if (t.maxFargo != null && f > t.maxFargo) return false;
  }
  if (filters.q) {
    const q = filters.q.trim().toLowerCase();
    const hay =
      `${t.title} ${t.venueName} ${t.city} ${t.region} ${t.gameType} ${t.description}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

function sortTournaments(list: Tournament[]): Tournament[] {
  return [...list].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

async function getAllTournaments(): Promise<Tournament[]> {
  const redis = getRedis();
  if (redis) {
    try {
      const ids = (await redis.smembers(INDEX_KEY)) as string[];
      if (!ids.length) return [];
      const rows = await Promise.all(
        ids.map((id) => redis.get<Tournament>(tournamentKey(id))),
      );
      return rows
        .filter((row): row is Tournament => Boolean(row?.id))
        .map(normalizeTournament);
    } catch {
      return [...memory().tournaments.values()].map(normalizeTournament);
    }
  }
  return [...memory().tournaments.values()].map(normalizeTournament);
}

export async function getTournament(id: string): Promise<Tournament | null> {
  const redis = getRedis();
  if (redis) {
    try {
      const row = await redis.get<Tournament>(tournamentKey(id));
      return row?.id ? normalizeTournament(row) : null;
    } catch {
      const mem = memory().tournaments.get(id);
      return mem ? normalizeTournament(mem) : null;
    }
  }
  const mem = memory().tournaments.get(id);
  return mem ? normalizeTournament(mem) : null;
}

export async function saveTournament(tournament: Tournament): Promise<Tournament> {
  const redis = getRedis();
  if (redis) {
    try {
      await redis.set(tournamentKey(tournament.id), tournament, {
        ex: TTL_SECONDS,
      });
      await redis.sadd(INDEX_KEY, tournament.id);
      return tournament;
    } catch {
      /* fall through to memory */
    }
  }
  memory().tournaments.set(tournament.id, tournament);
  return tournament;
}

export async function createTournament(
  input: CreateTournamentInput,
  organizer: {
    userId: string;
    name: string;
    email: string | null;
  },
): Promise<Tournament> {
  const now = new Date().toISOString();
  const tournament: Tournament = {
    id: newId("evt"),
    title: input.title.trim(),
    description: (input.description ?? "").trim(),
    thumbnailUrl: input.thumbnailUrl ?? null,
    gameType: input.gameType,
    eventType: input.eventType,
    bracketFormat: input.bracketFormat,
    breakFormat:
      input.breakFormat === "loser-break" ||
      input.breakFormat === "alternate-break"
        ? input.breakFormat
        : "winner-break",
    drawType:
      input.drawType === "random" || input.drawType === "custom"
        ? input.drawType
        : "seeded",
    handicapSystem: input.handicapSystem,
    handicapNotes: (input.handicapNotes ?? "").trim(),
    rulesetPreset: input.rulesetPreset ?? "bca",
    winnersRaceTo: input.winnersRaceTo ?? null,
    losersRaceTo: input.losersRaceTo ?? null,
    minFargo: null,
    maxFargo: input.maxFargo ?? null,
    minRobustnessStatus:
      input.minRobustnessStatus === "preliminary" ||
      input.minRobustnessStatus === "established"
        ? input.minRobustnessStatus
        : null,
    unratedPolicy: input.unratedPolicy ?? "message-organizer",
    maxPlayers: Math.max(2, Math.floor(input.maxPlayers)),
    teamSize: Math.max(
      1,
      Math.floor(input.teamSize ?? defaultTeamSize(input.eventType)),
    ),
    entryFeeCents: Math.max(0, Math.floor(input.entryFeeCents ?? 0)),
    addedMoneyCents: Math.max(0, Math.floor(input.addedMoneyCents ?? 0)),
    payMethod: input.payMethod ?? "door",
    venmoHandle: (input.venmoHandle ?? "").trim() || null,
    zelleHandle: (input.zelleHandle ?? "").trim() || null,
    cashAppHandle: (input.cashAppHandle ?? "").trim() || null,
    payoutNotes: (input.payoutNotes ?? "").trim(),
    registrationMode: input.registrationMode ?? "approval",
    reportedToFargo: Boolean(input.reportedToFargo),
    tableSize: input.tableSize ?? "9ft",
    venueName: input.venueName.trim(),
    venueAddress: (input.venueAddress ?? "").trim(),
    city: input.city.trim(),
    region: (input.region ?? "Palm Beach").trim() || "Palm Beach",
    startsAt: input.startsAt,
    checkInAt: input.checkInAt ?? null,
    organizerUserId: organizer.userId,
    organizerName: organizer.name,
    organizerEmail: organizer.email,
    organizerPhone: input.organizerPhone ?? null,
    status: input.status === "draft" ? "draft" : "open",
    createdAt: now,
    updatedAt: now,
  };
  return saveTournament(tournament);
}

export async function updateTournament(
  id: string,
  patch: Partial<Tournament>,
): Promise<Tournament | null> {
  const existing = await getTournament(id);
  if (!existing) return null;
  const next: Tournament = {
    ...existing,
    ...patch,
    id: existing.id,
    createdAt: existing.createdAt,
    organizerUserId: existing.organizerUserId,
    updatedAt: new Date().toISOString(),
  };
  return saveTournament(next);
}

/** Permanently remove an event and its registrations, messages, and calcutta. */
export async function deleteTournament(id: string): Promise<boolean> {
  const existing = await getTournament(id);
  if (!existing) return false;

  const redis = getRedis();
  if (redis) {
    try {
      await redis.del(
        tournamentKey(id),
        regsKey(id),
        messagesKey(id),
        calcuttaKey(id),
      );
      await redis.srem(INDEX_KEY, id);
    } catch {
      /* fall through to memory cleanup */
    }
  }

  memory().tournaments.delete(id);
  memory().registrations.delete(id);
  memory().messages.delete(id);
  memory().calcuttas.delete(id);
  return true;
}

function normalizeRegistration(
  raw: TournamentRegistration,
): TournamentRegistration {
  const validStatus =
    raw.status === "pending" ||
    raw.status === "approved" ||
    raw.status === "rejected" ||
    raw.status === "withdrawn" ||
    raw.status === "waitlisted";

  return {
    ...raw,
    // Recover rows wiped by older PATCH payloads that spread `status: undefined`.
    status: validStatus
      ? raw.status
      : raw.paid || raw.checkedIn
        ? "approved"
        : "pending",
    teamName: raw.teamName ?? null,
    teammates: Array.isArray(raw.teammates)
      ? raw.teammates
          .filter((t) => t && typeof t.displayName === "string")
          .map((t) => ({
            displayName: t.displayName.trim(),
            ratingAtSignup:
              typeof t.ratingAtSignup === "number" &&
              Number.isFinite(t.ratingAtSignup)
                ? t.ratingAtSignup
                : null,
          }))
          .filter((t) => t.displayName)
      : [],
    paid: Boolean(raw.paid),
    checkedIn: Boolean(raw.checkedIn),
    checkedInAt:
      typeof raw.checkedInAt === "string" && raw.checkedInAt
        ? raw.checkedInAt
        : null,
    robustnessAtSignup:
      typeof raw.robustnessAtSignup === "number" &&
      Number.isFinite(raw.robustnessAtSignup)
        ? raw.robustnessAtSignup
        : null,
    robustnessStatusAtSignup:
      raw.robustnessStatusAtSignup === "starter" ||
      raw.robustnessStatusAtSignup === "preliminary" ||
      raw.robustnessStatusAtSignup === "established"
        ? raw.robustnessStatusAtSignup
        : null,
  };
}

function normalizeTournament(raw: Tournament): Tournament {
  return {
    ...raw,
    teamSize:
      typeof raw.teamSize === "number" && raw.teamSize >= 1
        ? raw.teamSize
        : defaultTeamSize(raw.eventType),
    breakFormat:
      raw.breakFormat === "loser-break" ||
      raw.breakFormat === "alternate-break"
        ? raw.breakFormat
        : "winner-break",
    drawType:
      raw.drawType === "random" || raw.drawType === "custom"
        ? raw.drawType
        : "seeded",
    addedMoneyCents:
      typeof raw.addedMoneyCents === "number" && raw.addedMoneyCents >= 0
        ? Math.floor(raw.addedMoneyCents)
        : 0,
    minRobustnessStatus:
      raw.minRobustnessStatus === "preliminary" ||
      raw.minRobustnessStatus === "established"
        ? raw.minRobustnessStatus
        : null,
    venmoHandle:
      typeof raw.venmoHandle === "string" && raw.venmoHandle.trim()
        ? raw.venmoHandle.trim()
        : null,
    zelleHandle:
      typeof raw.zelleHandle === "string" && raw.zelleHandle.trim()
        ? raw.zelleHandle.trim()
        : null,
    cashAppHandle:
      typeof raw.cashAppHandle === "string" && raw.cashAppHandle.trim()
        ? raw.cashAppHandle.trim()
        : null,
  };
}

async function getRegistrationsRaw(
  tournamentId: string,
): Promise<TournamentRegistration[]> {
  const redis = getRedis();
  if (redis) {
    try {
      const row = await redis.get<TournamentRegistration[]>(regsKey(tournamentId));
      return Array.isArray(row) ? row.map(normalizeRegistration) : [];
    } catch {
      return (memory().registrations.get(tournamentId) ?? []).map(
        normalizeRegistration,
      );
    }
  }
  return (memory().registrations.get(tournamentId) ?? []).map(
    normalizeRegistration,
  );
}

async function saveRegistrations(
  tournamentId: string,
  regs: TournamentRegistration[],
): Promise<void> {
  const redis = getRedis();
  if (redis) {
    try {
      await redis.set(regsKey(tournamentId), regs, { ex: TTL_SECONDS });
      return;
    } catch {
      /* fall through */
    }
  }
  memory().registrations.set(tournamentId, regs);
}

function toListItem(
  tournament: Tournament,
  regs: TournamentRegistration[],
): TournamentListItem {
  const approvedCount = regs.filter((r) => r.status === "approved").length;
  const pendingCount = regs.filter((r) => r.status === "pending").length;
  return {
    ...tournament,
    approvedCount,
    pendingCount,
    spotsLeft: Math.max(0, tournament.maxPlayers - approvedCount),
  };
}

async function syncStatusFromRegs(
  tournamentId: string,
  regs: TournamentRegistration[],
): Promise<Tournament | null> {
  const tournament = await getTournament(tournamentId);
  if (!tournament) return null;
  const approvedCount = regs.filter((r) => r.status === "approved").length;
  let status = tournament.status;
  if (status === "open" || status === "full") {
    status = approvedCount >= tournament.maxPlayers ? "full" : "open";
  }
  if (status !== tournament.status) {
    return updateTournament(tournamentId, { status });
  }
  return tournament;
}

export async function listTournaments(
  filters: TournamentFilters = {},
): Promise<TournamentListItem[]> {
  const list = sortTournaments(
    (await getAllTournaments()).filter((t) => matchesFilters(t, filters)),
  );
  return Promise.all(
    list.map(async (t) => toListItem(t, await getRegistrationsRaw(t.id))),
  );
}

export async function getTournamentDetail(id: string): Promise<{
  tournament: TournamentListItem;
  registrations: TournamentRegistration[];
  messages: TournamentMessage[];
} | null> {
  const tournament = await getTournament(id);
  if (!tournament) return null;
  const registrations = await getRegistrationsRaw(id);
  const messages = await listMessages(id);
  return {
    tournament: toListItem(tournament, registrations),
    registrations,
    messages,
  };
}

export async function listRegistrations(
  tournamentId: string,
): Promise<TournamentRegistration[]> {
  return getRegistrationsRaw(tournamentId);
}

function assertFargoInBand(
  rating: number | null,
  tournament: Tournament,
  who: string,
): void {
  if (rating == null || Number.isNaN(rating)) return;
  if (tournament.maxFargo != null && rating > tournament.maxFargo) {
    throw new Error(
      `${who} needs a Fargo of at most ${tournament.maxFargo}.`,
    );
  }
}

function assertRobustnessRequirement(
  status: RobustnessStatus | null | undefined,
  tournament: Tournament,
): void {
  if (meetsMinRobustness(status, tournament.minRobustnessStatus)) return;
  if (tournament.minRobustnessStatus === "established") {
    throw new Error(
      "This event requires established Fargo robustness to sign up.",
    );
  }
  throw new Error(
    `This event requires ${minRobustnessLabel(tournament.minRobustnessStatus).toLowerCase()} Fargo robustness.`,
  );
}

function normalizeTeammates(
  raw: RegistrationTeammate[] | undefined,
): RegistrationTeammate[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((t) => ({
      displayName: (t.displayName ?? "").trim(),
      ratingAtSignup:
        typeof t.ratingAtSignup === "number" && Number.isFinite(t.ratingAtSignup)
          ? t.ratingAtSignup
          : null,
    }))
    .filter((t) => t.displayName);
}

export async function createRegistration(input: {
  tournamentId: string;
  userId: string | null;
  fargoPlayerId: string | null;
  displayName: string;
  email: string | null;
  phone: string | null;
  ratingAtSignup: number | null;
  robustnessAtSignup?: number | null;
  robustnessStatusAtSignup?: TournamentRegistration["robustnessStatusAtSignup"];
  isGuest: boolean;
  teamName?: string | null;
  teammates?: RegistrationTeammate[];
  noteToOrganizer?: string;
}): Promise<{
  registration: TournamentRegistration;
  tournament: TournamentListItem;
}> {
  const tournament = await getTournament(input.tournamentId);
  if (!tournament) throw new Error("Event not found.");
  if (tournament.status !== "open") {
    throw new Error(
      tournament.status === "draft"
        ? "Registration is not open yet for this event."
        : "Registration is closed for this event.",
    );
  }
  if (tournament.registrationMode === "invite-only") {
    throw new Error("This event is invite-only.");
  }

  const regs = await getRegistrationsRaw(input.tournamentId);
  const active = regs.filter(
    (r) => r.status !== "withdrawn" && r.status !== "rejected",
  );
  if (
    input.userId &&
    active.some((r) => r.userId === input.userId)
  ) {
    throw new Error("You are already registered for this event.");
  }

  const approved = regs.filter((r) => r.status === "approved").length;
  if (approved >= tournament.maxPlayers) {
    throw new Error("This event is full.");
  }

  const teammates = normalizeTeammates(input.teammates);
  const teamName = (input.teamName ?? "").trim() || null;
  const neededTeammates = Math.max(0, tournament.teamSize - 1);

  if (tournament.eventType === "scotch-doubles") {
    if (teammates.length < 1) {
      throw new Error("Scotch doubles requires a partner name.");
    }
  }
  if (tournament.eventType === "teams") {
    if (!teamName) {
      throw new Error("Team name is required.");
    }
    if (teammates.length < neededTeammates) {
      throw new Error(
        `This event needs ${tournament.teamSize} players per team (including you). Add ${neededTeammates} teammate${neededTeammates === 1 ? "" : "s"}.`,
      );
    }
  }
  if (teammates.length > neededTeammates && tournament.eventType !== "singles") {
    // Allow a few extras for flexible team nights, but cap hard.
    if (teammates.length > Math.max(neededTeammates, 12)) {
      throw new Error("Too many teammates listed.");
    }
  }
  if (tournament.eventType === "singles" && teammates.length > 0) {
    throw new Error("Singles events do not accept teammates.");
  }

  assertFargoInBand(input.ratingAtSignup, tournament, "You");
  assertRobustnessRequirement(input.robustnessStatusAtSignup, tournament);
  for (const mate of teammates) {
    assertFargoInBand(mate.ratingAtSignup, tournament, mate.displayName);
  }

  const now = new Date().toISOString();
  const status: RegistrationStatus =
    tournament.registrationMode === "open" ? "approved" : "pending";

  const registration: TournamentRegistration = {
    id: newId("reg"),
    tournamentId: input.tournamentId,
    userId: input.userId,
    fargoPlayerId: input.fargoPlayerId,
    displayName: input.displayName.trim(),
    email: input.email,
    phone: input.phone,
    ratingAtSignup: input.ratingAtSignup,
    robustnessAtSignup: input.robustnessAtSignup ?? null,
    robustnessStatusAtSignup: input.robustnessStatusAtSignup ?? null,
    isGuest: input.isGuest,
    teamName:
      tournament.eventType === "scotch-doubles"
        ? teamName ||
          `${input.displayName.trim()} / ${teammates[0]?.displayName ?? "Partner"}`
        : teamName,
    teammates,
    status,
    paid: false,
    checkedIn: false,
    checkedInAt: null,
    noteToOrganizer: (input.noteToOrganizer ?? "").trim(),
    createdAt: now,
    updatedAt: now,
  };

  const next = [...regs, registration];
  await saveRegistrations(input.tournamentId, next);
  const updated = await syncStatusFromRegs(input.tournamentId, next);
  if (!updated) throw new Error("Failed to update event.");
  return {
    registration,
    tournament: toListItem(updated, next),
  };
}

export async function updateRegistration(
  tournamentId: string,
  registrationId: string,
  patch: Partial<
    Pick<
      TournamentRegistration,
      "status" | "paid" | "checkedIn" | "noteToOrganizer" | "ratingAtSignup"
    >
  >,
): Promise<{
  registration: TournamentRegistration;
  tournament: TournamentListItem;
}> {
  const regs = await getRegistrationsRaw(tournamentId);
  const idx = regs.findIndex((r) => r.id === registrationId);
  if (idx < 0) throw new Error("Registration not found.");

  if (patch.status === "approved") {
    const tournament = await getTournament(tournamentId);
    if (!tournament) throw new Error("Event not found.");
    const approved = regs.filter(
      (r) => r.status === "approved" && r.id !== registrationId,
    ).length;
    if (approved >= tournament.maxPlayers) {
      throw new Error("Event is full; cannot approve more players.");
    }
  }

  if (
    patch.ratingAtSignup !== undefined &&
    patch.ratingAtSignup !== null &&
    (!Number.isFinite(patch.ratingAtSignup) ||
      patch.ratingAtSignup < 0 ||
      patch.ratingAtSignup > 900)
  ) {
    throw new Error("Estimated Fargo must be between 0 and 900.");
  }

  const existing = regs[idx]!;
  let checkedInAt = existing.checkedInAt;
  if (patch.checkedIn === true) {
    checkedInAt = existing.checkedInAt ?? new Date().toISOString();
  } else if (patch.checkedIn === false) {
    checkedInAt = null;
  }

  const definedPatch = Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  ) as Partial<
    Pick<
      TournamentRegistration,
      "status" | "paid" | "checkedIn" | "noteToOrganizer" | "ratingAtSignup"
    >
  >;

  const nextReg: TournamentRegistration = {
    ...existing,
    ...definedPatch,
    ratingAtSignup:
      definedPatch.ratingAtSignup !== undefined
        ? definedPatch.ratingAtSignup == null
          ? null
          : Math.round(definedPatch.ratingAtSignup)
        : existing.ratingAtSignup,
    checkedInAt,
    updatedAt: new Date().toISOString(),
  };
  const next = [...regs];
  next[idx] = nextReg;
  await saveRegistrations(tournamentId, next);
  const updated = await syncStatusFromRegs(tournamentId, next);
  if (!updated) throw new Error("Failed to update event.");
  return {
    registration: nextReg,
    tournament: toListItem(updated, next),
  };
}

export async function listMessages(
  tournamentId: string,
): Promise<TournamentMessage[]> {
  const redis = getRedis();
  if (redis) {
    try {
      const row = await redis.get<TournamentMessage[]>(messagesKey(tournamentId));
      return Array.isArray(row) ? row : [];
    } catch {
      return memory().messages.get(tournamentId) ?? [];
    }
  }
  return memory().messages.get(tournamentId) ?? [];
}

export async function createMessage(input: {
  tournamentId: string;
  registrationId?: string | null;
  fromName: string;
  fromEmail?: string | null;
  fromPhone?: string | null;
  body: string;
}): Promise<TournamentMessage> {
  const tournament = await getTournament(input.tournamentId);
  if (!tournament) throw new Error("Event not found.");
  const message: TournamentMessage = {
    id: newId("msg"),
    tournamentId: input.tournamentId,
    registrationId: input.registrationId ?? null,
    fromName: input.fromName.trim(),
    fromEmail: input.fromEmail ?? null,
    fromPhone: input.fromPhone ?? null,
    body: input.body.trim(),
    createdAt: new Date().toISOString(),
  };
  if (!message.body) throw new Error("Message cannot be empty.");

  const existing = await listMessages(input.tournamentId);
  const next = [...existing, message];
  const redis = getRedis();
  if (redis) {
    try {
      await redis.set(messagesKey(input.tournamentId), next, {
        ex: TTL_SECONDS,
      });
      return message;
    } catch {
      /* fall through */
    }
  }
  memory().messages.set(input.tournamentId, next);
  return message;
}

export async function getCalcutta(
  tournamentId: string,
): Promise<TournamentCalcutta> {
  const regs = await getRegistrationsRaw(tournamentId);
  const redis = getRedis();
  let raw: unknown = null;
  if (redis) {
    try {
      raw = await redis.get(calcuttaKey(tournamentId));
    } catch {
      raw = memory().calcuttas.get(tournamentId) ?? null;
    }
  } else {
    raw = memory().calcuttas.get(tournamentId) ?? null;
  }
  const normalized = normalizeCalcutta(tournamentId, raw ?? defaultCalcutta(tournamentId));
  return syncCalcuttaLots(normalized, regs);
}

export async function saveCalcutta(
  calcutta: TournamentCalcutta,
): Promise<TournamentCalcutta> {
  const regs = await getRegistrationsRaw(calcutta.tournamentId);
  const next = syncCalcuttaLots(
    {
      ...normalizeCalcutta(calcutta.tournamentId, calcutta),
      updatedAt: new Date().toISOString(),
    },
    regs,
  );
  const redis = getRedis();
  if (redis) {
    try {
      await redis.set(calcuttaKey(calcutta.tournamentId), next, {
        ex: TTL_SECONDS,
      });
      return next;
    } catch {
      /* fall through */
    }
  }
  memory().calcuttas.set(calcutta.tournamentId, next);
  return next;
}

export function tournamentStoreMode(): "redis" | "memory" {
  return isRedisConfigured() ? "redis" : "memory";
}
