import { NextRequest, NextResponse } from "next/server";
import { requireScoringSession } from "@/lib/scoring-auth";
import {
  deleteTournamentEntryTeam,
  listTournamentEntryTeams,
  tournamentEntryTeamsStoreMode,
  upsertTournamentEntryTeam,
} from "@/lib/tournaments/entry-teams-store";
import type { TournamentEntryTeamMember } from "@/lib/tournaments/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await requireScoringSession();
    const teams = await listTournamentEntryTeams(session.lmsId);
    return NextResponse.json({
      teams,
      store: tournamentEntryTeamsStoreMode(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load teams.";
    const status = message.includes("Sign in") ? 401 : 502;
    return NextResponse.json({ error: message, teams: [] }, { status });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await requireScoringSession();
    const body = (await request.json()) as {
      id?: string;
      name?: string;
      members?: TournamentEntryTeamMember[];
    };
    if (!body?.name?.trim()) {
      return NextResponse.json(
        { error: "Team name is required.", teams: [] },
        { status: 400 },
      );
    }
    if (!Array.isArray(body.members)) {
      return NextResponse.json(
        { error: "Team members are required.", teams: [] },
        { status: 400 },
      );
    }
    const teams = await upsertTournamentEntryTeam({
      userId: session.lmsId,
      id: typeof body.id === "string" ? body.id : undefined,
      name: body.name,
      members: body.members,
    });
    return NextResponse.json({
      teams,
      store: tournamentEntryTeamsStoreMode(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save team.";
    const status =
      message.includes("Sign in")
        ? 401
        : message.includes("required") ||
            message.includes("teammate") ||
            message.includes("name")
          ? 400
          : 502;
    return NextResponse.json({ error: message, teams: [] }, { status });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await requireScoringSession();
    const teamId = request.nextUrl.searchParams.get("id")?.trim();
    if (!teamId) {
      return NextResponse.json(
        { error: "Team id is required.", teams: [] },
        { status: 400 },
      );
    }
    const teams = await deleteTournamentEntryTeam(session.lmsId, teamId);
    return NextResponse.json({
      teams,
      store: tournamentEntryTeamsStoreMode(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to delete team.";
    const status = message.includes("Sign in") ? 401 : 502;
    return NextResponse.json({ error: message, teams: [] }, { status });
  }
}
