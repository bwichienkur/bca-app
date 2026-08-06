import { NextResponse } from "next/server";
import { requireScoringSession } from "@/lib/scoring-auth";
import { buildSessionIdentity } from "@/lib/tournaments/entry-match";
import { resolveSessionPlayer } from "@/lib/tournaments/resolve-fargo";
import {
  listMyTournamentEntries,
  tournamentStoreMode,
} from "@/lib/tournaments/store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await requireScoringSession();
    const snapshot = await resolveSessionPlayer(session);
    const identity = buildSessionIdentity(session, snapshot.fargoPlayerId);
    const entries = await listMyTournamentEntries(identity);
    return NextResponse.json({
      entries,
      store: tournamentStoreMode(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load entries.";
    const status = message.includes("Sign in") ? 401 : 502;
    return NextResponse.json({ error: message, entries: [] }, { status });
  }
}
