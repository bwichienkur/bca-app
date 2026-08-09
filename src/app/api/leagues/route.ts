import { NextRequest, NextResponse } from "next/server";
import { requireAppUserOrBridge } from "@/lib/app-auth";
import {
  createLeague,
  leagueStoreMode,
  listLeaguesForOwner,
} from "@/lib/leagues/store";
import type { CreateTablesideLeagueInput } from "@/lib/leagues/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireAppUserOrBridge();
    const leagues = await listLeaguesForOwner(user.id);
    return NextResponse.json({
      leagues,
      store: leagueStoreMode(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load leagues.";
    const status = /sign in|session|auth/i.test(message) ? 401 : 502;
    return NextResponse.json({ error: message, leagues: [] }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAppUserOrBridge();
    const body = (await request.json()) as CreateTablesideLeagueInput;
    const league = await createLeague({
      ownerUserId: user.id,
      ownerName: user.name,
      ownerEmail: user.email,
      body,
    });
    return NextResponse.json({ league, store: leagueStoreMode() });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create league.";
    const status = /sign in|session|auth/i.test(message)
      ? 401
      : /at least 3/i.test(message)
        ? 400
        : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
