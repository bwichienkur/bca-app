import { NextRequest, NextResponse } from "next/server";
import {
  lmsAuthFetch,
  requireScoringSession,
} from "@/lib/scoring-auth";
import { normalizeScoringPlayer, type ScoringMatchSummary } from "@/lib/scoring";

export const dynamic = "force-dynamic";

type RawMatch = {
  id: string;
  divisionId: string;
  divisionName: string;
  datePlayed: string;
  location: string;
  hasBeenPlayed: boolean;
  teamOneId: string;
  teamOneName: string;
  teamTwoId: string;
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
    const mineOnly =
      request.nextUrl.searchParams.get("mine") !== "0";
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
      } else if (teamId) {
        if (match.teamOneId === teamId) mySide = 1;
        else if (match.teamTwoId === teamId) mySide = 2;
      }

      matches.push({
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
      });
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
