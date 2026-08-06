import { NextRequest, NextResponse } from "next/server";
import { requireScoringSession } from "@/lib/scoring-auth";
import {
  createTournament,
  listTournaments,
  tournamentStoreMode,
} from "@/lib/tournaments/store";
import type {
  CreateTournamentInput,
  RobustnessStatus,
} from "@/lib/tournaments/types";

export const dynamic = "force-dynamic";

function parseOptionalNumber(value: string | null): number | null {
  if (value == null || value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseDateKey(value: string | null): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : undefined;
}

function parseHandicap(
  value: string | null,
): "handicapped" | "scratch" | undefined {
  if (value === "handicapped" || value === "scratch") return value;
  return undefined;
}

function parseRobustness(value: string | null): RobustnessStatus | undefined {
  if (
    value === "starter" ||
    value === "preliminary" ||
    value === "established"
  ) {
    return value;
  }
  return undefined;
}

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const tournaments = await listTournaments({
      q: sp.get("q") ?? undefined,
      region: sp.get("region") ?? undefined,
      city: sp.get("city") ?? undefined,
      gameType: sp.get("gameType") ?? undefined,
      eventType: sp.get("eventType") ?? undefined,
      handicap: parseHandicap(sp.get("handicap")),
      status: sp.get("status") ?? undefined,
      eligibleForFargo: parseOptionalNumber(sp.get("eligibleForFargo")),
      eligibleForRobustness: parseRobustness(sp.get("eligibleForRobustness")),
      startsFrom: parseDateKey(sp.get("startsFrom")),
      startsTo: parseDateKey(sp.get("startsTo")),
    });
    return NextResponse.json({
      tournaments,
      store: tournamentStoreMode(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load events.";
    return NextResponse.json({ error: message, tournaments: [] }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireScoringSession();
    const body = (await request.json()) as CreateTournamentInput;
    if (!body?.title?.trim() || !body?.venueName?.trim() || !body?.city?.trim()) {
      return NextResponse.json(
        { error: "Title, venue, and city are required." },
        { status: 400 },
      );
    }
    if (!body.startsAt) {
      return NextResponse.json(
        { error: "Start time is required." },
        { status: 400 },
      );
    }
    if (!body.gameType || !body.eventType || !body.bracketFormat || !body.handicapSystem) {
      return NextResponse.json(
        { error: "Game type, event type, bracket, and handicap are required." },
        { status: 400 },
      );
    }
    if (!body.maxPlayers || body.maxPlayers < 2) {
      return NextResponse.json(
        { error: "Max players must be at least 2." },
        { status: 400 },
      );
    }

    const tournament = await createTournament(body, {
      userId: session.lmsId,
      name: session.name?.trim() || session.email || "Organizer",
      email: session.email,
    });

    return NextResponse.json({ tournament, store: tournamentStoreMode() }, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create event.";
    const status = message.includes("Sign in") ? 401 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
