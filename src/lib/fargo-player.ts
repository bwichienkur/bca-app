/**
 * FargoRate Player API (api.fargorate.com).
 * Subscription key is embedded in the official FargoRate Player app.
 */

import { FAIRMATCH_DASHBOARD_BASE } from "./fairmatch";
import { getRedis } from "./redis";

export const FARGO_PLAYER_API_BASE = "https://api.fargorate.com";

const APIM_KEY_FALLBACK = "316319d95c6740cf97cacb37ab504012";
const RATING_CACHE_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
const RATING_LOOKUP_CONCURRENCY = 16;

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
  /** Current Fargo effective rating (from FairMatch index), not rating-at-time. */
  opponentRating: number | null;
  opponentRatingBucket: number | null;
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

export type FargoUpcomingMatch = {
  matchType: string | null;
  homeTeamName: string | null;
  homeTeamId: string | null;
  awayTeamName: string | null;
  awayTeamId: string | null;
  date: string | null;
  location: string | null;
  leagueName: string | null;
  leagueId: string | null;
  divisionName: string | null;
  divisionId: string | null;
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

type RawUpcomingMatch = {
  matchType?: string | null;
  homeTeamName?: string | null;
  homeTeamId?: string | null;
  awayTeamName?: string | null;
  awayTeamId?: string | null;
  date?: string | null;
  location?: string | null;
  locationId?: string | null;
  leagueName?: string | null;
  leagueId?: string | null;
  divisionName?: string | null;
  divisionId?: string | null;
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

/** Floor rating into a 100-point Fargo bucket (300, 400, …). */
export function ratingBucket(rating: number | null | undefined): number | null {
  if (rating == null || !Number.isFinite(rating) || rating <= 0) return null;
  return Math.floor(rating / 100) * 100;
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

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  async function run() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index]!);
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, Math.max(items.length, 1)) },
      () => run(),
    ),
  );
  return results;
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
    opponentRating: null,
    opponentRatingBucket: null,
    playerScore,
    opponentScore,
    result,
  };
}

function ratingCacheKey(readableId: string | number): string {
  return `fargo:rating:rid:${readableId}`;
}

async function lookupRatingByReadableId(
  readableId: string,
): Promise<number | null> {
  const url = `${FAIRMATCH_DASHBOARD_BASE}/api/indexsearch?q=${encodeURIComponent(readableId)}`;
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Tableside/1.0",
    },
    cache: "no-store",
  });
  if (!response.ok) return null;

  const data = (await response.json()) as {
    value?: Array<{
      readableId?: string | number | null;
      effectiveRating?: string | number | null;
      rating?: string | number | null;
    }>;
  };

  const hit = (data.value ?? []).find(
    (player) => String(player.readableId ?? "") === readableId,
  );
  return toNumber(hit?.effectiveRating) ?? toNumber(hit?.rating);
}

/**
 * Resolve current Fargo ratings for readable IDs via FairMatch indexsearch.
 * Match payloads leave opponent ratings at 0; the Player app fills them from
 * a separate ratings source. Indexsearch-by-id is the public equivalent, and
 * we cache results in Redis to avoid re-polling.
 */
export async function lookupRatingsByReadableIds(
  readableIds: Array<string | number | null | undefined>,
): Promise<Map<string, number>> {
  const unique = [
    ...new Set(
      readableIds
        .map((id) => (id == null ? "" : String(id).trim()))
        .filter(Boolean),
    ),
  ];
  const ratings = new Map<string, number>();
  if (!unique.length) return ratings;

  const redis = getRedis();
  const missing: string[] = [];

  if (redis) {
    const cached = await Promise.all(
      unique.map(async (id) => {
        try {
          const value = await redis.get<number | string>(ratingCacheKey(id));
          return [id, value] as const;
        } catch {
          return [id, null] as const;
        }
      }),
    );
    for (const [id, value] of cached) {
      const n = toNumber(value);
      if (n != null) ratings.set(id, n);
      else missing.push(id);
    }
  } else {
    missing.push(...unique);
  }

  if (missing.length) {
    const fetched = await mapPool(
      missing,
      RATING_LOOKUP_CONCURRENCY,
      async (id) => [id, await lookupRatingByReadableId(id)] as const,
    );

    await Promise.all(
      fetched.map(async ([id, rating]) => {
        if (rating == null) return;
        ratings.set(id, rating);
        if (!redis) return;
        try {
          await redis.set(ratingCacheKey(id), rating, {
            ex: RATING_CACHE_TTL_SECONDS,
          });
        } catch {
          // Cache write failures are non-fatal.
        }
      }),
    );
  }

  return ratings;
}

function applyRatings(
  matches: FargoPlayerMatch[],
  ratings: Map<string, number>,
): FargoPlayerMatch[] {
  return matches.map((match) => {
    const key =
      match.opponentReadableId != null
        ? String(match.opponentReadableId)
        : "";
    const opponentRating = key ? (ratings.get(key) ?? null) : null;
    return {
      ...match,
      opponentRating,
      opponentRatingBucket: ratingBucket(opponentRating),
    };
  });
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

export async function fetchFargoUpcomingMatches(
  lmsId: string,
): Promise<FargoUpcomingMatch[]> {
  const id = lmsId.trim();
  if (!id) return [];

  const response = await playerApiFetch(
    `/api/league/upcomingmatches?playerId=${encodeURIComponent(id)}`,
  );
  if (!response.ok) return [];

  const data = (await response.json()) as RawUpcomingMatch[];
  if (!Array.isArray(data)) return [];

  return data.map((match) => ({
    matchType: match.matchType ?? null,
    homeTeamName: match.homeTeamName ?? null,
    homeTeamId: match.homeTeamId ?? null,
    awayTeamName: match.awayTeamName ?? null,
    awayTeamId: match.awayTeamId ?? null,
    date: match.date ?? null,
    location: match.location ?? null,
    leagueName: match.leagueName ?? null,
    leagueId: match.leagueId ?? null,
    divisionName: match.divisionName ?? null,
    divisionId: match.divisionId ?? null,
  }));
}

/** Teams in divisions that still have upcoming matches. */
export async function fetchActiveLeagueTeams(
  lmsId: string,
): Promise<FargoLeagueTeam[]> {
  const [teams, upcoming] = await Promise.all([
    fetchFargoPlayerTeams(lmsId),
    fetchFargoUpcomingMatches(lmsId),
  ]);

  if (!teams.length) return [];
  if (!upcoming.length) return [];

  const activeDivisionIds = new Set(
    upcoming
      .map((match) => (match.divisionId ?? "").trim())
      .filter(Boolean),
  );

  const seen = new Set<string>();
  return teams.filter((team) => {
    if (!activeDivisionIds.has(team.divisionId)) return false;
    const key = `${team.leagueId}:${team.divisionId}:${team.teamId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function loadAllMatches(playerId: string): Promise<FargoPlayerMatch[]> {
  const response = await fetch(
    `${FARGO_PLAYER_API_BASE}/api/matches/all/${encodeURIComponent(playerId)}`,
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
  return (Array.isArray(raw) ? raw : [])
    .map((match) => mapMatch(match, playerId))
    .filter((match): match is FargoPlayerMatch => Boolean(match))
    .sort((a, b) => {
      const da = a.datePlayed ?? "";
      const db = b.datePlayed ?? "";
      return db.localeCompare(da);
    });
}

export type FargoMatchQuery = {
  page?: number;
  limit?: number;
  q?: string;
  /** Fargo bucket floor, e.g. 500 for 500–599. */
  bucket?: number | null;
};

const DEFAULT_BUCKETS = [200, 300, 400, 500, 600, 700, 800, 900];

function countBuckets(
  matches: FargoPlayerMatch[],
): Array<{ bucket: number; count: number }> {
  const counts = new Map<number, number>();
  for (const match of matches) {
    if (match.opponentRatingBucket == null) continue;
    counts.set(
      match.opponentRatingBucket,
      (counts.get(match.opponentRatingBucket) ?? 0) + 1,
    );
  }
  // Keep common empty buckets visible in the dropdown so ranges stay predictable.
  for (const value of DEFAULT_BUCKETS) {
    if (!counts.has(value)) counts.set(value, 0);
  }
  return [...counts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([bucket, count]) => ({ bucket, count }));
}

/** Warm Redis with current ratings for every opponent in a player's history. */
export async function prefetchOpponentRatings(
  playerId: string,
): Promise<{ opponents: number; rated: number }> {
  const all = await loadAllMatches(playerId.trim());
  const ratings = await lookupRatingsByReadableIds(
    all.map((match) => match.opponentReadableId),
  );
  return {
    opponents: new Set(
      all
        .map((match) =>
          match.opponentReadableId != null
            ? String(match.opponentReadableId)
            : "",
        )
        .filter(Boolean),
    ).size,
    rated: ratings.size,
  };
}

export async function fetchFargoPlayerMatches(
  playerId: string,
  options?: FargoMatchQuery,
): Promise<{
  matches: FargoPlayerMatch[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  buckets: Array<{ bucket: number; count: number }>;
  query: string;
  bucket: number | null;
  ratingsComplete: boolean;
}> {
  const id = playerId.trim();
  if (!id) throw new Error("Player id is required.");

  const limit = Math.min(Math.max(options?.limit ?? 20, 1), 100);
  const page = Math.max(options?.page ?? 1, 1);
  const query = (options?.q ?? "").trim().toLowerCase();
  const bucket =
    options?.bucket != null && Number.isFinite(options.bucket)
      ? Number(options.bucket)
      : null;

  const all = await loadAllMatches(id);

  let working = all;
  if (query) {
    working = working.filter((match) => {
      const haystack = [
        match.opponentName,
        match.event,
        match.opponentReadableId != null
          ? String(match.opponentReadableId)
          : "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }

  // Bucket filters need ratings for every remaining match. Otherwise enrich
  // only the visible page so list browsing stays quick.
  const needsFullRatings = bucket != null;
  let ratingsComplete = needsFullRatings || working.length <= 80;
  let buckets = DEFAULT_BUCKETS.map((value) => ({ bucket: value, count: -1 }));

  if (needsFullRatings || working.length <= 80) {
    const ratings = await lookupRatingsByReadableIds(
      working.map((match) => match.opponentReadableId),
    );
    working = applyRatings(working, ratings);
    buckets = countBuckets(working);
    ratingsComplete = true;

    if (bucket != null) {
      working = working.filter((match) => match.opponentRatingBucket === bucket);
    }
  }

  const total = working.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * limit;
  let pageMatches = working.slice(start, start + limit);

  if (!needsFullRatings && working.length > 80) {
    const ratings = await lookupRatingsByReadableIds(
      pageMatches.map((match) => match.opponentReadableId),
    );
    pageMatches = applyRatings(pageMatches, ratings);
  }

  return {
    matches: pageMatches,
    total,
    page: safePage,
    limit,
    totalPages,
    buckets,
    query: (options?.q ?? "").trim(),
    bucket,
    ratingsComplete,
  };
}
