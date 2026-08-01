import { NextRequest, NextResponse } from "next/server";
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

      return NextResponse.json(
        { error: message, details: parsed },
        { status: response.status },
      );
    }

    const matchId = String(
      payload.matchId ?? payload.MatchId ?? "",
    );
    let verifiedPlayed: boolean | null = null;
    if (matchId) {
      const check = await lmsAuthFetch(`/api/matches/${matchId}`);
      if (check.ok) {
        const match = (await check.json()) as { hasBeenPlayed?: boolean };
        verifiedPlayed = Boolean(match.hasBeenPlayed);
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
