import { NextRequest, NextResponse } from "next/server";
import {
  clearSharedDraftSubmitted,
  isDraftStoreConfigured,
  markSharedDraftSubmitted,
} from "@/lib/draft-store";
import {
  isAlreadyScoredMessage,
  isOperatorConfigured,
  loginLeagueOperator,
  operatorRecordScoresVertical,
  verifyMatchPlayedWithPlayerToken,
  verticalPayloadToOperatorScores,
} from "@/lib/lms-operator";
import {
  lmsAuthFetch,
  requireScoringSession,
} from "@/lib/scoring-auth";

export const dynamic = "force-dynamic";

async function tryOperatorFallback(args: {
  accessToken: string;
  lmsId: string;
  matchId: string;
  payload: Record<string, unknown>;
}): Promise<{ verifiedPlayed: boolean; used: boolean; error?: string }> {
  if (!isOperatorConfigured()) {
    return { verifiedPlayed: false, used: false };
  }
  try {
    const scores = verticalPayloadToOperatorScores(args.payload);
    const operator = await loginLeagueOperator();
    const result = await operatorRecordScoresVertical(operator, scores);
    if (!result.ok) {
      return {
        verifiedPlayed: false,
        used: true,
        error:
          result.body ||
          `League operator submit failed (${result.status}).`,
      };
    }
    const verifiedPlayed = Boolean(
      await verifyMatchPlayedWithPlayerToken(
        args.accessToken,
        args.matchId,
      ),
    );
    if (verifiedPlayed && isDraftStoreConfigured()) {
      await markSharedDraftSubmitted(args.matchId, args.lmsId);
    }
    return { verifiedPlayed, used: true };
  } catch (error) {
    return {
      verifiedPlayed: false,
      used: true,
      error:
        error instanceof Error
          ? error.message
          : "League operator submit failed.",
    };
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireScoringSession();
    const body = (await request.json()) as {
      payload?: Record<string, unknown>;
      /** When true, skip player verticalmatch and go straight to LO entry. */
      preferOperator?: boolean;
    };

    if (!body.payload || typeof body.payload !== "object") {
      return NextResponse.json(
        { error: "Missing score payload." },
        { status: 400 },
      );
    }

    // Prefer scoreKeeper = LMS player id (official app uses identity).
    const payload: Record<string, unknown> = {
      ...body.payload,
      scoreKeeper:
        body.payload.scoreKeeper ??
        body.payload.ScoreKeeper ??
        session.lmsId,
      ScoreKeeper:
        body.payload.ScoreKeeper ??
        body.payload.scoreKeeper ??
        session.lmsId,
    };

    const matchId = String(payload.matchId ?? payload.MatchId ?? "");
    const operatorConfigured = isOperatorConfigured();

    if (body.preferOperator) {
      if (!matchId) {
        return NextResponse.json(
          { error: "matchId is required." },
          { status: 400 },
        );
      }
      const fallback = await tryOperatorFallback({
        accessToken: session.accessToken,
        lmsId: session.lmsId,
        matchId,
        payload,
      });
      if (fallback.verifiedPlayed) {
        return NextResponse.json({
          ok: true,
          verifiedPlayed: true,
          via: "operator",
          operatorConfigured,
        });
      }
      return NextResponse.json(
        {
          ok: false,
          verifiedPlayed: false,
          stuck: true,
          operatorConfigured,
          via: "operator",
          error:
            fallback.error ||
            "League operator submit did not mark the match played.",
        },
        { status: 502 },
      );
    }

    const response = await lmsAuthFetch("/api/verticalmatch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const text = await response.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text || null;
    }

    if (!response.ok) {
      const message =
        typeof parsed === "object" &&
        parsed &&
        "message" in parsed &&
        typeof (parsed as { message: unknown }).message === "string"
          ? (parsed as { message: string }).message
          : text || `Submit failed (${response.status}).`;

      // Never keep a Tableside-only submit lock when LMS rejected the post.
      if (matchId && isDraftStoreConfigured()) {
        await clearSharedDraftSubmitted(matchId);
      }

      const stuck = isAlreadyScoredMessage(message);
      if (stuck && matchId && operatorConfigured) {
        const fallback = await tryOperatorFallback({
          accessToken: session.accessToken,
          lmsId: session.lmsId,
          matchId,
          payload,
        });
        if (fallback.verifiedPlayed) {
          return NextResponse.json({
            ok: true,
            verifiedPlayed: true,
            via: "operator",
            operatorConfigured,
            playerError: message,
          });
        }
      }

      return NextResponse.json(
        {
          error: message,
          details: parsed,
          stuck,
          operatorConfigured,
        },
        { status: response.status },
      );
    }

    let verifiedPlayed: boolean | null = null;
    if (matchId) {
      verifiedPlayed = await verifyMatchPlayedWithPlayerToken(
        session.accessToken,
        matchId,
      );
    }

    // Player POST can return 200/201 without flipping hasBeenPlayed (ghost lock).
    if (matchId && verifiedPlayed === false && operatorConfigured) {
      const fallback = await tryOperatorFallback({
        accessToken: session.accessToken,
        lmsId: session.lmsId,
        matchId,
        payload,
      });
      if (fallback.verifiedPlayed) {
        return NextResponse.json({
          ok: true,
          verifiedPlayed: true,
          via: "operator",
          operatorConfigured,
          result: parsed,
        });
      }
    }

    // Only lock the sheet when LMS actually shows the match as played.
    if (matchId && isDraftStoreConfigured()) {
      if (verifiedPlayed) {
        await markSharedDraftSubmitted(matchId, session.lmsId);
      } else {
        await clearSharedDraftSubmitted(matchId);
      }
    }

    return NextResponse.json({
      ok: true,
      verifiedPlayed,
      via: "player",
      stuck: verifiedPlayed === false,
      operatorConfigured,
      result: parsed,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Submit failed.";
    const status = message.includes("Sign in") ? 401 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
