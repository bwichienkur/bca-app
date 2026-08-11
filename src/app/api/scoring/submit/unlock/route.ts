import { NextRequest, NextResponse } from "next/server";
import {
  clearSharedDraftSubmitted,
  isDraftStoreConfigured,
} from "@/lib/draft-store";
import {
  lmsAuthFetch,
  requireScoringSession,
} from "@/lib/scoring-auth";

export const dynamic = "force-dynamic";

/**
 * Clear a Tableside-only submit lock when LMS still has hasBeenPlayed=false.
 * Used after a false-positive "submitted" state (HTTP 200 without LMS scoring).
 */
export async function POST(request: NextRequest) {
  try {
    const { assertNotImpersonating } = await import("@/lib/impersonation");
    await assertNotImpersonating();
    await requireScoringSession();
    const body = (await request.json()) as { matchId?: string };
    const matchId = typeof body.matchId === "string" ? body.matchId.trim() : "";
    if (!matchId) {
      return NextResponse.json({ error: "matchId is required." }, { status: 400 });
    }

    const check = await lmsAuthFetch(`/api/matches/${matchId}`);
    if (!check.ok) {
      return NextResponse.json(
        { error: "Match not found in LMS." },
        { status: check.status },
      );
    }
    const match = (await check.json()) as { hasBeenPlayed?: boolean };
    if (match.hasBeenPlayed) {
      return NextResponse.json({
        ok: true,
        unlocked: false,
        reason: "LMS already has this match scored.",
      });
    }

    if (isDraftStoreConfigured()) {
      await clearSharedDraftSubmitted(matchId);
    }

    return NextResponse.json({ ok: true, unlocked: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unlock failed.";
    const status = message.includes("Sign in") ? 401 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
