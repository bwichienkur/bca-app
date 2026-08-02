import { NextRequest, NextResponse } from "next/server";
import {
  fetchFargoPlayerProfile,
  fetchFargoPlayerTeams,
} from "@/lib/fargo-player";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ playerId: string }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  const { playerId: rawId } = await context.params;
  const playerId = decodeURIComponent(rawId ?? "").trim();
  if (!playerId) {
    return NextResponse.json({ error: "Player id is required." }, { status: 400 });
  }

  try {
    const player = await fetchFargoPlayerProfile(playerId);
    const teams = player.lmsId
      ? await fetchFargoPlayerTeams(player.lmsId)
      : [];
    return NextResponse.json({ player, teams });
  } catch (error) {
    console.error(error);
    const message =
      error instanceof Error ? error.message : "Failed to load player.";
    const status = message.includes("not found") ? 404 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
