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
import { assertNotImpersonating } from "@/lib/impersonation";
import {
  lmsAuthFetch,
  requireScoringSession,
} from "@/lib/scoring-auth";

export const dynamic = "force-dynamic";

async function tryOperatorFallback(args: {
  accessToken: string;
  lmsId: string;
  lmsName?: string | null;
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
      await markSharedDraftSubmitted(
        args.matchId,
        args.lmsId,
        args.lmsName,
      );
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
    await assertNotImpersonating();
    const session = await requireScoringSession();
    const body = (await request.json()) as {
      payload?: Record<string, unknown>;
      /**
       * When true, skip player verticalmatch and use LO entry.
       * Only for the explicit "Submit via league operator" action —
       * operator writes do not attribute a player scorer in LMS.
       */
      preferOperator?: boolean;
      /** Informational: sheet is overwriting scores already in LMS. */
      resubmit?: boolean;
    };

    if (!body.payload || typeof body.payload !== "object") {
      return NextResponse.json(
        { error: "Missing score payload." },
        { status: 400 },
      );
    }

    // scoreKeeper = LMS player id so verticalmatch attributes "Scored by".
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
    // Never auto-route to operator — that path cannot set ScoredMatches /
    // HasBeenScoredByPlayer. Only the explicit UI action may use it.
    const forceOperator = Boolean(body.preferOperator);

    if (forceOperator) {
      if (!matchId) {
        return NextResponse.json(
          { error: "matchId is required." },
          { status: 400 },
        );
      }
      const fallback = await tryOperatorFallback({
        accessToken: session.accessToken,
        lmsId: session.lmsId,
        lmsName: session.name,
        matchId,
        payload,
      });
      if (fallback.verifiedPlayed) {
        return NextResponse.json({
          ok: true,
          verifiedPlayed: true,
          via: "operator",
          operatorConfigured,
          resubmit: Boolean(body.resubmit),
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

      // Do not auto-fallback to operator — that loses player scorer attribution.
      // Client can offer an explicit "Submit via league operator" retry.
      return NextResponse.json(
        {
          error: message,
          details: parsed,
          stuck: isAlreadyScoredMessage(message),
          operatorConfigured,
          via: "player",
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

    // Only lock the sheet when LMS actually shows the match as played.
    // Ghost locks (200/201 but unscored) stay unlocked so the player can retry
    // or explicitly choose operator submit.
    if (matchId && isDraftStoreConfigured()) {
      if (verifiedPlayed) {
        await markSharedDraftSubmitted(
          matchId,
          session.lmsId,
          session.name,
        );
      } else {
        await clearSharedDraftSubmitted(matchId);
      }
    }

    return NextResponse.json({
      ok: Boolean(verifiedPlayed),
      verifiedPlayed,
      via: "player",
      stuck: verifiedPlayed === false,
      operatorConfigured,
      result: parsed,
      ...(verifiedPlayed === false
        ? {
            error:
              "LMS accepted the player submit, but the match still shows as unscored.",
          }
        : {}),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Submit failed.";
    const status = message.includes("Sign in") ? 401 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
