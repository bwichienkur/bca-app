import { NextRequest, NextResponse } from "next/server";
import {
  getSharedPreferences,
  isPrefsStoreConfigured,
  putSharedPreferences,
} from "@/lib/prefs-store";
import { requireScoringSession } from "@/lib/scoring-auth";
import type { UserPreferences } from "@/lib/types";

export const dynamic = "force-dynamic";

function isPreferences(value: unknown): value is UserPreferences {
  if (!value || typeof value !== "object") return false;
  const prefs = value as Partial<UserPreferences>;
  return typeof prefs.leagueId === "string" && typeof prefs.leagueName === "string";
}

export async function GET() {
  try {
    const session = await requireScoringSession();
    if (!isPrefsStoreConfigured()) {
      return NextResponse.json({ shared: false, prefs: null });
    }
    const record = await getSharedPreferences(session.lmsId);
    return NextResponse.json({
      shared: true,
      prefs: record?.prefs ?? null,
      updatedAt: record?.updatedAt ?? null,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load preferences.";
    const status = message.includes("Sign in") ? 401 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await requireScoringSession();
    const body = (await request.json()) as { prefs?: unknown };
    if (!isPreferences(body.prefs)) {
      return NextResponse.json(
        { error: "prefs object is required." },
        { status: 400 },
      );
    }
    if (!isPrefsStoreConfigured()) {
      return NextResponse.json({
        shared: false,
        prefs: body.prefs,
        error: "Shared preferences store is not configured.",
      });
    }
    const record = await putSharedPreferences({
      lmsId: session.lmsId,
      prefs: {
        ...body.prefs,
        playerId: session.lmsId,
        playerName: session.name ?? body.prefs.playerName,
      },
    });
    return NextResponse.json({
      shared: Boolean(record),
      prefs: record?.prefs ?? body.prefs,
      updatedAt: record?.updatedAt ?? null,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save preferences.";
    const status = message.includes("Sign in") ? 401 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
