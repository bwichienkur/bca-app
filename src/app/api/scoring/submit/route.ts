import { NextRequest, NextResponse } from "next/server";
import {
  clearSharedDraftSubmitted,
  isDraftStoreConfigured,
  markSharedDraftSubmitted,
} from "@/lib/draft-store";
import {
  lmsAuthFetch,
  requireScoringSession,
} from "@/lib/scoring-auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const session = await requireScoringSession();
    const body = (await request.json()) as {
      payload?: Record<string, unknown>;
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

      return NextResponse.json(
        { error: message, details: parsed },
        { status: response.status },
      );
    }

    let verifiedPlayed: boolean | null = null;
    if (matchId) {
      // LMS can acknowledge the POST before hasBeenPlayed flips — retry briefly.
      for (let attempt = 0; attempt < 4; attempt += 1) {
        if (attempt > 0) {
          await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
        }
        const check = await lmsAuthFetch(`/api/matches/${matchId}`);
        if (!check.ok) continue;
        const match = (await check.json()) as { hasBeenPlayed?: boolean };
        verifiedPlayed = Boolean(match.hasBeenPlayed);
        if (verifiedPlayed) break;
      }
    }

    // Only lock the sheet when LMS actually shows the match as played.
    // Locking on HTTP 200 alone caused "Complete" in Tableside while Fargo
    // still had empty scores (Europa vs Hold my Beer, 2026-08-06).
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
      result: parsed,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Submit failed.";
    const status = message.includes("Sign in") ? 401 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
