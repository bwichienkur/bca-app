import { NextRequest, NextResponse } from "next/server";
import {
  clearSharedDraftSubmitted,
  isDraftStoreConfigured,
  markSharedDraftSubmitted,
} from "@/lib/draft-store";
import {
  isOperatorConfigured,
  loginLeagueOperator,
  operatorRecordScoresVertical,
  verifyMatchPlayedWithPlayerToken,
  verticalPayloadToOperatorScores,
} from "@/lib/lms-operator";
import {
  requireScoringSession,
} from "@/lib/scoring-auth";

export const dynamic = "force-dynamic";

/**
 * Submit a stuck scoresheet through LMS League Operator score entry.
 * Bypasses player `verticalmatch` ghost locks ("already scored" while unscored).
 */
export async function GET() {
  return NextResponse.json({
    configured: isOperatorConfigured(),
  });
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireScoringSession();
    if (!isOperatorConfigured()) {
      return NextResponse.json(
        {
          error:
            "League operator submit is not configured. Set LMS_OPERATOR_EMAIL and LMS_OPERATOR_PASSWORD.",
        },
        { status: 503 },
      );
    }

    const body = (await request.json()) as {
      payload?: Record<string, unknown>;
    };
    if (!body.payload || typeof body.payload !== "object") {
      return NextResponse.json(
        { error: "Missing score payload." },
        { status: 400 },
      );
    }

    const matchId = String(
      body.payload.matchId ?? body.payload.MatchId ?? "",
    ).trim();
    if (!matchId) {
      return NextResponse.json(
        { error: "matchId is required." },
        { status: 400 },
      );
    }

    // Skip work if LMS already has the match played.
    const alreadyPlayed = await verifyMatchPlayedWithPlayerToken(
      session.accessToken,
      matchId,
      { attempts: 1 },
    );
    if (alreadyPlayed) {
      if (isDraftStoreConfigured()) {
        await markSharedDraftSubmitted(matchId, session.lmsId);
      }
      return NextResponse.json({
        ok: true,
        verifiedPlayed: true,
        via: "already-played",
      });
    }

    const scores = verticalPayloadToOperatorScores(body.payload);
    const operator = await loginLeagueOperator();
    const result = await operatorRecordScoresVertical(operator, scores);
    if (!result.ok) {
      return NextResponse.json(
        {
          error:
            result.body ||
            `League operator submit failed (${result.status}).`,
          details: result.body,
        },
        { status: result.status >= 400 ? result.status : 502 },
      );
    }

    const verifiedPlayed = await verifyMatchPlayedWithPlayerToken(
      session.accessToken,
      matchId,
    );

    if (isDraftStoreConfigured()) {
      if (verifiedPlayed) {
        await markSharedDraftSubmitted(matchId, session.lmsId);
      } else {
        await clearSharedDraftSubmitted(matchId);
      }
    }

    if (!verifiedPlayed) {
      return NextResponse.json(
        {
          ok: false,
          verifiedPlayed: false,
          via: "operator",
          error:
            "League operator API accepted the scores, but LMS still shows the match as unscored.",
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ok: true,
      verifiedPlayed: true,
      via: "operator",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Operator submit failed.";
    const status = message.includes("Sign in")
      ? 401
      : message.includes("not configured")
        ? 503
        : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
