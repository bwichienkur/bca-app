import { NextResponse } from "next/server";
import {
  draftFromLmsMatchResult,
  fetchMatchResultDetail,
  summarizeLmsGamesForBoard,
} from "@/lib/match-results";
import {
  lmsAuthFetch,
  requireScoringSession,
} from "@/lib/scoring-auth";
import { type ScoringMatchDetail } from "@/lib/scoring";

export const dynamic = "force-dynamic";

/**
 * GET /api/scoring/matches/:matchId/result
 * Hydrate a scoresheet draft from the public LMS MatchResultBCAPL page.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ matchId: string }> },
) {
  try {
    await requireScoringSession();
    const { matchId } = await context.params;

    const [result, matchResponse] = await Promise.all([
      fetchMatchResultDetail(matchId),
      lmsAuthFetch(`/api/matches/${matchId}`),
    ]);

    if (!result) {
      return NextResponse.json(
        { error: "No LMS result found for this match.", draft: null },
        { status: 404 },
      );
    }

    let matchStub: Pick<
      ScoringMatchDetail,
      "id" | "matchFormat" | "numberOfSets"
    > = {
      id: matchId,
      matchFormat: null,
      numberOfSets: 5,
    };

    if (matchResponse.ok) {
      const match = (await matchResponse.json()) as Record<string, unknown>;
      matchStub = {
        id: String(match.id ?? matchId),
        matchFormat:
          (match.matchFormat as ScoringMatchDetail["matchFormat"]) ?? null,
        numberOfSets: Number(match.numberOfSets ?? 5),
      };
    }

    const draft = draftFromLmsMatchResult(matchStub, result);
    const summary = summarizeLmsGamesForBoard(matchId, result.games);

    return NextResponse.json({
      draft,
      summary,
      source: "lms-match-result",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load LMS result.";
    const status = message.includes("Sign in") ? 401 : 502;
    return NextResponse.json({ error: message, draft: null }, { status });
  }
}
