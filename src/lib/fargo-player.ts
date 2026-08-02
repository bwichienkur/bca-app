/**
 * FargoRate Player API (api.fargorate.com).
 * Subscription key is embedded in the official FargoRate Player app.
 */

export const FARGO_PLAYER_API_BASE = "https://api.fargorate.com";

const APIM_KEY_FALLBACK = "316319d95c6740cf97cacb37ab504012";

function apimKey(): string {
  return (
    process.env.FARGORATE_APIM_SUBSCRIPTION_KEY?.trim() || APIM_KEY_FALLBACK
  );
}

export type FargoWinLoss = {
  wins: number;
  loses: number;
};

export type FargoStatsOverall = {
  recordType: number;
  temporalType: number;
  winLoss: FargoWinLoss;
};

export type FargoStatsBucket = {
  bucket: string;
  winLoss: FargoWinLoss;
};

export type FargoStatsByRating = {
  recordType: number;
  temporalType: number;
  buckets: FargoStatsBucket[];
};

export type FargoRatingHistoryEntry = {
  id: string;
  playerId: string;
  rating: number;
  robustness: number;
  timestamp: string;
  month: number;
  dayOfMonth: number;
  dayOfYear: number;
  year: number;
};

export type FargoPlayerProfile = {
  id: string;
  readableId: string | null;
  membershipId: string | null;
  membershipNumber: string | null;
  firstName: string;
  lastName: string;
  name: string;
  location: string | null;
  rating: number | null;
  effectiveRating: number | null;
  provisionalRating: number | null;
  robustness: number | null;
  robustnessStatus: "starter" | "preliminary" | "established";
  lmsId: string | null;
  imageUrl: string | null;
  shareMatches: boolean;
  statsOverall: FargoStatsOverall[];
  statsByRating: FargoStatsByRating[];
  ratingHistory: FargoRatingHistoryEntry[];
};

export type FargoPlayerMatch = {
  id: string;
  datePlayed: string | null;
  event: string | null;
  gameType: string | null;
  tableSize: string | null;
  isLeague: boolean;
  isTournament: boolean;
  isThirdParty: boolean;
  opponentId: string | null;
  opponentName: string;
  opponentReadableId: number | null;
  playerScore: number;
  opponentScore: number;
  result: "win" | "loss" | "draw";
};

export type FargoLeagueTeam = {
  leagueId: string;
  leagueName: string;
  divisionId: string;
  divisionName: string;
  teamId: string;
  teamName: string;
};

type RawPlayer = {
  id?: string;
  readableId?: string | number | null;
  membershipId?: string | null;
  membershipNumber?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  location?: string | null;
  rating?: string | number | null;
  robustness?: string | number | null;
  provisionalRating?: string | number | null;
  effectiveRating?: string | number | null;
  lmsId?: string | null;
  imageUrl?: string | null;
  shareMatches?: string | number | boolean | null;
  statsOverall?: FargoStatsOverall[] | null;
  statsByRating?: FargoStatsByRating[] | null;
  ratingHistory?: FargoRatingHistoryEntry[] | null;
};

type RawMatch = {
  Id?: string;
  PlayerOneId?: string;
  PlayerTwoId?: string;
  PlayerOneReadableId?: number | null;
  PlayerTwoReadableId?: number | null;
  PlayerOneName?: string | null;
  PlayerTwoName?: string | null;
  PlayerOneScore?: number | null;
  PlayerTwoScore?: number | null;
  DatePlayed?: string | null;
  Event?: string | null;
  GameType?: string | null;
  TableSize?: string | null;
  IsThirdParty?: boolean;
  IsTournament?: boolean;
  IsLeague?: boolean;
};

function toNumber(value: string | number | null | undefined): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).trim());
  return Number.isFinite(n) ? n : null;
}

function robustnessStatus(
  robustness: number | null,
): FargoPlayerProfile["robustnessStatus"] {
  if (robustness == null || robustness <= 0) return "starter";
  if (robustness < 200) return "preliminary";
  return "established";
}

async function playerApiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${FARGO_PLAYER_API_BASE}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "User-Agent": "Tableside/1.0",
      "Ocp-Apim-Subscription-Key": apimKey(),
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
}

function mapProfile(raw: RawPlayer): FargoPlayerProfile | null {
  const id = raw.id?.trim();
  if (!id) return null;

  const firstName = (raw.firstName ?? "").trim();
  const lastName = (raw.lastName ?? "").trim();
  const name = [firstName, lastName].filter(Boolean).join(" ") || "Unknown";
  const robustness = toNumber(raw.robustness);
  const shareRaw = raw.shareMatches;
  const shareMatches =
    shareRaw === true ||
    shareRaw === 1 ||
    shareRaw === "1" ||
    String(shareRaw).toLowerCase() === "true";

  const history = [...(raw.ratingHistory ?? [])].sort((a, b) => {
    return String(a.timestamp).localeCompare(String(b.timestamp));
  });

  return {
    id,
    readableId: String(raw.readableId ?? "").trim() || null,
    membershipId: (raw.membershipId ?? "").trim() || null,
    membershipNumber: (raw.membershipNumber ?? "").trim() || null,
    firstName,
    lastName,
    name,
    location: (raw.location ?? "").trim() || null,
    rating: toNumber(raw.rating),
    effectiveRating:
      toNumber(raw.effectiveRating) ?? toNumber(raw.rating),
    provisionalRating: toNumber(raw.provisionalRating),
    robustness,
    robustnessStatus: robustnessStatus(robustness),
    lmsId: (raw.lmsId ?? "").trim() || null,
    imageUrl: (raw.imageUrl ?? "").trim() || null,
    shareMatches,
    statsOverall: raw.statsOverall ?? [],
    statsByRating: raw.statsByRating ?? [],
    ratingHistory: history,
  };
}

function mapMatch(raw: RawMatch, playerId: string): FargoPlayerMatch | null {
  const id = raw.Id?.trim();
  if (!id) return null;

  const pid = playerId.toLowerCase();
  const isPlayerOne = (raw.PlayerOneId ?? "").toLowerCase() === pid;
  const isPlayerTwo = (raw.PlayerTwoId ?? "").toLowerCase() === pid;
  if (!isPlayerOne && !isPlayerTwo) return null;

  const playerScore = isPlayerOne
    ? Number(raw.PlayerOneScore ?? 0)
    : Number(raw.PlayerTwoScore ?? 0);
  const opponentScore = isPlayerOne
    ? Number(raw.PlayerTwoScore ?? 0)
    : Number(raw.PlayerOneScore ?? 0);

  let result: FargoPlayerMatch["result"] = "draw";
  if (playerScore > opponentScore) result = "win";
  else if (playerScore < opponentScore) result = "loss";

  return {
    id,
    datePlayed: raw.DatePlayed ?? null,
    event: (raw.Event ?? "").trim() || null,
    gameType: (raw.GameType ?? "").trim() || null,
    tableSize: (raw.TableSize ?? "").trim() || null,
    isLeague: Boolean(raw.IsLeague),
    isTournament: Boolean(raw.IsTournament),
    isThirdParty: Boolean(raw.IsThirdParty),
    opponentId: (isPlayerOne ? raw.PlayerTwoId : raw.PlayerOneId) ?? null,
    opponentName:
      ((isPlayerOne ? raw.PlayerTwoName : raw.PlayerOneName) ?? "").trim() ||
      "Unknown",
    opponentReadableId: isPlayerOne
      ? (raw.PlayerTwoReadableId ?? null)
      : (raw.PlayerOneReadableId ?? null),
    playerScore,
    opponentScore,
    result,
  };
}

export async function fetchFargoPlayerProfile(
  playerId: string,
): Promise<FargoPlayerProfile> {
  const id = playerId.trim();
  if (!id) throw new Error("Player id is required.");

  const response = await playerApiFetch(`/api/players/${encodeURIComponent(id)}`);
  if (response.status === 404) {
    throw new Error("Player not found.");
  }
  if (!response.ok) {
    throw new Error(`Player lookup failed (${response.status}).`);
  }

  const profile = mapProfile((await response.json()) as RawPlayer);
  if (!profile) throw new Error("Player not found.");
  return profile;
}

export async function fetchFargoPlayerTeams(
  lmsId: string,
): Promise<FargoLeagueTeam[]> {
  const id = lmsId.trim();
  if (!id) return [];

  const response = await playerApiFetch(
    `/api/league/teamsforplayer/${encodeURIComponent(id)}`,
  );
  if (!response.ok) return [];

  const data = (await response.json()) as FargoLeagueTeam[];
  return Array.isArray(data) ? data : [];
}

export async function fetchFargoPlayerMatches(
  playerId: string,
  options?: { page?: number; limit?: number },
): Promise<{
  matches: FargoPlayerMatch[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}> {
  const id = playerId.trim();
  if (!id) throw new Error("Player id is required.");

  const limit = Math.min(Math.max(options?.limit ?? 25, 1), 100);
  const page = Math.max(options?.page ?? 1, 1);

  const response = await fetch(
    `${FARGO_PLAYER_API_BASE}/api/matches/all/${encodeURIComponent(id)}`,
    {
      headers: {
        Accept: "application/json",
        "User-Agent": "Tableside/1.0",
      },
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error(`Match history failed (${response.status}).`);
  }

  const raw = (await response.json()) as RawMatch[];
  const mapped = (Array.isArray(raw) ? raw : [])
    .map((match) => mapMatch(match, id))
    .filter((match): match is FargoPlayerMatch => Boolean(match))
    .sort((a, b) => {
      const da = a.datePlayed ?? "";
      const db = b.datePlayed ?? "";
      return db.localeCompare(da);
    });

  const total = mapped.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * limit;

  return {
    matches: mapped.slice(start, start + limit),
    total,
    page: safePage,
    limit,
    totalPages,
  };
}
