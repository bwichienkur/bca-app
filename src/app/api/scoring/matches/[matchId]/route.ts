import { NextRequest, NextResponse } from "next/server";
import {
  lmsAuthFetch,
  requireScoringSession,
} from "@/lib/scoring-auth";
import {
  normalizeScoringPlayer,
  type ScoringMatchDetail,
} from "@/lib/scoring";
import { isSuperadminIdentity } from "@/lib/impersonation";
import { canAccessLms } from "@/lib/lms-access-server";

export const dynamic = "force-dynamic";

function canonicalizeTeamKey(name: string): string {
  return name
    .replace(/^\((H|A)\)\s*/i, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

async function loadTeamPlayers(teamId: string) {
  const response = await lmsAuthFetch(`/api/teams/${teamId}/players`);
  if (!response.ok) return [];
  const players = (await response.json()) as Record<string, unknown>[];
  return players.map(normalizeScoringPlayer).filter((p) => p.id);
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ matchId: string }> },
) {
  try {
    const session = await requireScoringSession();
    const { matchId } = await context.params;

    const response = await lmsAuthFetch(`/api/matches/${matchId}`);
    if (!response.ok) {
      return NextResponse.json(
        { error: "Match not found." },
        { status: response.status },
      );
    }

    const match = (await response.json()) as Record<string, unknown>;
    const teamOneId = String(match.teamOneId ?? "");
    const teamTwoId = String(match.teamTwoId ?? "");
    const [teamOnePlayers, teamTwoPlayers] = await Promise.all([
      loadTeamPlayers(teamOneId),
      loadTeamPlayers(teamTwoId),
    ]);

    let mySide: 1 | 2 | null = null;
    if (teamOnePlayers.some((p) => p.id === session.lmsId)) mySide = 1;
    else if (teamTwoPlayers.some((p) => p.id === session.lmsId)) mySide = 2;

    // Bright / LO following another team: treat that team as "my side" so the
    // scoresheet opens editable for checkout without being on the roster.
    if (mySide == null) {
      const canManage =
        canAccessLms({
          email: session.email,
          lmsId: session.lmsId,
        }) ||
        isSuperadminIdentity({
          email: session.email,
          lmsId: session.lmsId,
        });
      if (canManage) {
        const followTeamId = request.nextUrl.searchParams.get("teamId")?.trim();
        const followTeamName =
          request.nextUrl.searchParams.get("teamName")?.trim() ?? "";
        if (followTeamId) {
          if (teamOneId === followTeamId) mySide = 1;
          else if (teamTwoId === followTeamId) mySide = 2;
        }
        if (mySide == null && followTeamName) {
          const key = canonicalizeTeamKey(followTeamName);
          if (key) {
            if (canonicalizeTeamKey(String(match.teamOneName ?? "")) === key) {
              mySide = 1;
            } else if (
              canonicalizeTeamKey(String(match.teamTwoName ?? "")) === key
            ) {
              mySide = 2;
            }
          }
        }
      }
    }

    const detail: ScoringMatchDetail = {
      id: String(match.id ?? matchId),
      divisionId: String(match.divisionId ?? ""),
      divisionName: String(match.divisionName ?? ""),
      datePlayed: String(match.datePlayed ?? ""),
      location: String(match.location ?? ""),
      hasBeenPlayed: Boolean(match.hasBeenPlayed),
      teamOneId,
      teamOneName: String(match.teamOneName ?? "").trim(),
      teamTwoId,
      teamTwoName: String(match.teamTwoName ?? "").trim(),
      numberOfSets: Number(match.numberOfSets ?? 5),
      minScore: Number(match.minScore ?? 0),
      maxScore: Number(match.maxScore ?? 10),
      maxLosingScore: Number(match.maxLosingScore ?? 7),
      pointsForWin: Number(match.pointsForWin ?? 10),
      isHandicapped: Boolean(match.isHandicapped),
      handicapPercentage: Number(match.handicapPercentage ?? 1),
      maximumAllowedHandicap: Number(match.maximumAllowedHandicap ?? 50),
      matchWinCountsAsRound: match.matchWinCountsAsRound !== false,
      mySide,
      matchFormat:
        (match.matchFormat as ScoringMatchDetail["matchFormat"]) ?? null,
      teamOnePlayers,
      teamTwoPlayers,
    };

    return NextResponse.json({ match: detail });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load match.";
    const status = message.includes("Sign in") ? 401 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
