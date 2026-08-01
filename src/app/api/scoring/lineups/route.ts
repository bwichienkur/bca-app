import { NextRequest, NextResponse } from "next/server";
import {
  deleteTeamLineupPreset,
  isLineupStoreConfigured,
  listTeamLineupPresets,
  upsertTeamLineupPreset,
} from "@/lib/lineup-store";
import { requireScoringSession } from "@/lib/scoring-auth";
import type { LineupPreset } from "@/lib/types";

export const dynamic = "force-dynamic";

function isPreset(value: unknown): value is LineupPreset {
  if (!value || typeof value !== "object") return false;
  const preset = value as Partial<LineupPreset>;
  return (
    typeof preset.id === "string" &&
    typeof preset.name === "string" &&
    typeof preset.teamId === "string" &&
    typeof preset.divisionId === "string" &&
    Array.isArray(preset.playerIds)
  );
}

export async function GET(request: NextRequest) {
  try {
    await requireScoringSession();
    const teamId = request.nextUrl.searchParams.get("teamId")?.trim();
    const divisionId = request.nextUrl.searchParams.get("divisionId")?.trim();
    if (!teamId) {
      return NextResponse.json(
        { error: "teamId is required.", presets: [] },
        { status: 400 },
      );
    }
    if (!isLineupStoreConfigured()) {
      return NextResponse.json({ shared: false, presets: [] });
    }
    const presets = await listTeamLineupPresets(teamId, divisionId || null);
    return NextResponse.json({ shared: true, presets });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load lineups.";
    const status = message.includes("Sign in") ? 401 : 502;
    return NextResponse.json({ error: message, presets: [] }, { status });
  }
}

export async function PUT(request: NextRequest) {
  try {
    await requireScoringSession();
    const body = (await request.json()) as { preset?: unknown };
    if (!isPreset(body.preset)) {
      return NextResponse.json(
        { error: "preset object is required.", presets: [] },
        { status: 400 },
      );
    }
    if (!isLineupStoreConfigured()) {
      return NextResponse.json({
        shared: false,
        presets: [],
        error: "Shared lineup store is not configured.",
      });
    }
    const presets = await upsertTeamLineupPreset({
      ...body.preset,
      updatedAt: new Date().toISOString(),
    });
    return NextResponse.json({ shared: true, presets });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save lineup.";
    const status = message.includes("Sign in") ? 401 : 502;
    return NextResponse.json({ error: message, presets: [] }, { status });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireScoringSession();
    const teamId = request.nextUrl.searchParams.get("teamId")?.trim();
    const presetId = request.nextUrl.searchParams.get("presetId")?.trim();
    if (!teamId || !presetId) {
      return NextResponse.json(
        { error: "teamId and presetId are required.", presets: [] },
        { status: 400 },
      );
    }
    if (!isLineupStoreConfigured()) {
      return NextResponse.json({
        shared: false,
        presets: [],
        error: "Shared lineup store is not configured.",
      });
    }
    const presets = await deleteTeamLineupPreset(teamId, presetId);
    return NextResponse.json({ shared: true, presets });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to delete lineup.";
    const status = message.includes("Sign in") ? 401 : 502;
    return NextResponse.json({ error: message, presets: [] }, { status });
  }
}
