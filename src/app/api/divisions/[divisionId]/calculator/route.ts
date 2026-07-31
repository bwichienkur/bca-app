import { NextRequest, NextResponse } from "next/server";
import {
  buildDefaultFivePlayerFormat,
  parseDivisionTemplate,
} from "@/lib/handicap";
import { DEFAULT_PLAYERS_PER_TEAM } from "@/lib/constants";
import { fetchDivisionCalculatorContext } from "@/lib/lms";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ divisionId: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { divisionId } = await params;
    const context = await fetchDivisionCalculatorContext(divisionId);
    const parsed = context.format.template
      ? parseDivisionTemplate(context.format.template)
      : buildDefaultFivePlayerFormat(DEFAULT_PLAYERS_PER_TEAM);

    return NextResponse.json({
      divisionId,
      format: context.format,
      parsedFormat: parsed,
      playersPerTeam: parsed.numOfPlayers || DEFAULT_PLAYERS_PER_TEAM,
      teams: context.teams,
      schedule: context.schedule,
      matchups: context.matchups,
      players: context.teams.flatMap((team) => team.players),
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to load handicap calculator data." },
      { status: 502 },
    );
  }
}
