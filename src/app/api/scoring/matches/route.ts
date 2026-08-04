import { NextRequest, NextResponse } from "next/server";
import { fetchSchedule } from "@/lib/lms";
import { parseScheduleDate } from "@/lib/schedule";
import {
  lmsAuthFetch,
  requireScoringSession,
} from "@/lib/scoring-auth";
import {
  normalizeScoringPlayer,
  type ScoringMatchSummary,
} from "@/lib/scoring";

export const dynamic = "force-dynamic";

type RawMatch = {
  id: string;
  divisionId: string;
  divisionName: string;
  datePlayed: string;
  location: string;
  hasBeenPlayed: boolean;
  teamOneId: string;
  teamTwoId: string;
  teamOneName: string;
  teamTwoName: string;
  numberOfSets: number;
  minScore: number;
  maxScore: number;
  maxLosingScore: number;
  pointsForWin: number;
  isHandicapped: boolean;
  handicapPercentage?: number;
  maximumAllowedHandicap?: number;
  matchWinCountsAsRound?: boolean;
};

/** How far past/future to backfill completed matches from the schedule. */
const BOARD_WINDOW_DAYS = 28;

function localDayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function dayKeyFromValue(value: string): string | null {
  const parsed = parseScheduleDate(value);
  if (parsed) return localDayKey(parsed);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    const slice = value.slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(slice) ? slice : null;
  }
  return localDayKey(date);
}

function addDaysKey(base: Date, offset: number): string {
  const date = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  date.setDate(date.getDate() + offset);
  return localDayKey(date);
}

function toSummary(
  match: RawMatch,
  mySide: 1 | 2 | null,
): ScoringMatchSummary {
  return {
    id: match.id,
    divisionId: match.divisionId,
    divisionName: match.divisionName,
    datePlayed: match.datePlayed,
    location: match.location,
    hasBeenPlayed: match.hasBeenPlayed,
    teamOneId: match.teamOneId,
    teamOneName: match.teamOneName.trim(),
    teamTwoId: match.teamTwoId,
    teamTwoName: match.teamTwoName.trim(),
    numberOfSets: match.numberOfSets,
    minScore: match.minScore,
    maxScore: match.maxScore,
    maxLosingScore: match.maxLosingScore,
    pointsForWin: match.pointsForWin,
    isHandicapped: match.isHandicapped,
    handicapPercentage: match.handicapPercentage ?? 1,
    maximumAllowedHandicap: match.maximumAllowedHandicap ?? 50,
    matchWinCountsAsRound: match.matchWinCountsAsRound !== false,
    mySide,
  };
}

function sideForTeam(
  match: Pick<RawMatch, "teamOneId" | "teamTwoId">,
  teamId: string | null,
): 1 | 2 | null {
  if (!teamId) return null;
  if (match.teamOneId === teamId) return 1;
  if (match.teamTwoId === teamId) return 2;
  return null;
}

async function teamIncludesPlayer(
  teamId: string,
  playerId: string,
  cache: Map<string, boolean>,
): Promise<boolean> {
  if (cache.has(teamId)) return cache.get(teamId)!;
  const response = await lmsAuthFetch(`/api/teams/${teamId}/players`);
  if (!response.ok) {
    cache.set(teamId, false);
    return false;
  }
  const players = (await response.json()) as Record<string, unknown>[];
  const hit = players.some(
    (player) => normalizeScoringPlayer(player).id === playerId,
  );
  cache.set(teamId, hit);
  return hit;
}

async function hydrateMatch(matchId: string): Promise<RawMatch | null> {
  const response = await lmsAuthFetch(`/api/matches/${matchId}`);
  if (!response.ok) return null;
  const match = (await response.json()) as Record<string, unknown>;
  const id = String(match.id ?? matchId);
  if (!id) return null;
  return {
    id,
    divisionId: String(match.divisionId ?? ""),
    divisionName: String(match.divisionName ?? ""),
    datePlayed: String(match.datePlayed ?? ""),
    location: String(match.location ?? ""),
    hasBeenPlayed: Boolean(match.hasBeenPlayed),
    teamOneId: String(match.teamOneId ?? ""),
    teamTwoId: String(match.teamTwoId ?? ""),
    teamOneName: String(match.teamOneName ?? ""),
    teamTwoName: String(match.teamTwoName ?? ""),
    numberOfSets: Number(match.numberOfSets ?? 5),
    minScore: Number(match.minScore ?? 0),
    maxScore: Number(match.maxScore ?? 10),
    maxLosingScore: Number(match.maxLosingScore ?? 7),
    pointsForWin: Number(match.pointsForWin ?? 10),
    isHandicapped: Boolean(match.isHandicapped),
    handicapPercentage: Number(match.handicapPercentage ?? 1),
    maximumAllowedHandicap: Number(match.maximumAllowedHandicap ?? 50),
    matchWinCountsAsRound: match.matchWinCountsAsRound !== false,
  };
}

/**
 * LMS ScheduledMatchesForPlayerBCAPL drops matches once they are scored.
 * For the division night board, backfill those from the public schedule.
 */
async function backfillFromSchedule(args: {
  divisionId: string;
  existing: ScoringMatchSummary[];
  teamId: string | null;
}): Promise<ScoringMatchSummary[]> {
  const schedule = await fetchSchedule(args.divisionId);
  const existingIds = new Set(args.existing.map((match) => match.id));
  const tonight = localDayKey(new Date());
  const nights = new Set<string>();
  for (let offset = -BOARD_WINDOW_DAYS; offset <= BOARD_WINDOW_DAYS; offset += 1) {
    nights.add(addDaysKey(new Date(), offset));
  }
  for (const match of args.existing) {
    const key = dayKeyFromValue(match.datePlayed);
    if (key) nights.add(key);
  }
  nights.add(tonight);

  const missingIds: string[] = [];
  for (const day of schedule) {
    const dayKey = dayKeyFromValue(day.date);
    if (!dayKey || !nights.has(dayKey)) continue;
    for (const item of day.matches) {
      if (!item.matchId || existingIds.has(item.matchId)) continue;
      missingIds.push(item.matchId);
      existingIds.add(item.matchId);
    }
  }

  if (missingIds.length === 0) return [];

  const hydrated = await Promise.all(
    missingIds.map(async (matchId) => {
      try {
        return await hydrateMatch(matchId);
      } catch {
        return null;
      }
    }),
  );

  const extras: ScoringMatchSummary[] = [];
  for (const match of hydrated) {
    if (!match) continue;
    if (match.divisionId && match.divisionId !== args.divisionId) continue;
    extras.push(toSummary(match, sideForTeam(match, args.teamId)));
  }
  return extras;
}

export async function GET(request: NextRequest) {
  try {
    const session = await requireScoringSession();
    const divisionId = request.nextUrl.searchParams.get("divisionId");
    if (!divisionId) {
      return NextResponse.json(
        { error: "divisionId is required.", matches: [] },
        { status: 400 },
      );
    }

    const response = await lmsAuthFetch(
      `/api/divisions/${divisionId}/ScheduledMatchesForPlayerBCAPL?playerId=${encodeURIComponent(session.lmsId)}`,
    );
    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json(
        {
          error: text || "Failed to load matches from LMS.",
          matches: [],
        },
        { status: response.status },
      );
    }

    const raw = (await response.json()) as RawMatch[];
    const mineOnly = request.nextUrl.searchParams.get("mine") !== "0";
    const teamId = request.nextUrl.searchParams.get("teamId");
    const cache = new Map<string, boolean>();
    const matches: ScoringMatchSummary[] = [];

    // LMS ignores the division path segment and returns every active-session
    // match for the player (same as the official BCAPL app). Filter here.
    for (const match of raw) {
      if (match.divisionId && match.divisionId !== divisionId) continue;

      // mine=1 (default): only matches involving the signed-in player.
      // Optional teamId further narrows to that team's matches.
      // mine=0: full division night board; teamId only marks mySide.
      if (mineOnly) {
        if (
          teamId &&
          match.teamOneId !== teamId &&
          match.teamTwoId !== teamId
        ) {
          continue;
        }
      }

      let mySide: 1 | 2 | null = null;
      if (mineOnly) {
        const onOne = await teamIncludesPlayer(
          match.teamOneId,
          session.lmsId,
          cache,
        );
        const onTwo = onOne
          ? false
          : await teamIncludesPlayer(
              match.teamTwoId,
              session.lmsId,
              cache,
            );
        if (!onOne && !onTwo) continue;
        mySide = onOne ? 1 : 2;
      } else {
        mySide = sideForTeam(match, teamId);
      }

      matches.push(toSummary(match, mySide));
    }

    if (!mineOnly) {
      try {
        const extras = await backfillFromSchedule({
          divisionId,
          existing: matches,
          teamId,
        });
        matches.push(...extras);
      } catch {
        // Night board still works with whatever LMS returned.
      }
    }

    matches.sort((a, b) => {
      if (a.hasBeenPlayed !== b.hasBeenPlayed) {
        return a.hasBeenPlayed ? 1 : -1;
      }
      return a.datePlayed.localeCompare(b.datePlayed);
    });

    return NextResponse.json({ matches });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load matches.";
    const status = message.includes("Sign in") ? 401 : 502;
    return NextResponse.json({ error: message, matches: [] }, { status });
  }
}
