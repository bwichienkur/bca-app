import { NextRequest, NextResponse } from "next/server";
import {
  operatorErrorResponse,
  requireOperatorApi,
} from "@/lib/lms-operator-api";
import {
  operatorCreateTeam,
  operatorDeleteTeam,
  operatorListTeams,
  operatorUpdateTeam,
  withOperatorSession,
  type TeamInput,
} from "@/lib/lms-operator-manage";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireOperatorApi();
    const divisionId = request.nextUrl.searchParams.get("divisionId")?.trim();
    if (!divisionId) {
      return NextResponse.json(
        { error: "divisionId is required." },
        { status: 400 },
      );
    }
    const teams = await withOperatorSession((session) =>
      operatorListTeams(session, divisionId),
    );
    return NextResponse.json({ teams });
  } catch (error) {
    return operatorErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireOperatorApi();
    const body = (await request.json()) as {
      divisionId?: string;
      team?: TeamInput;
    };
    if (
      !body.divisionId?.trim() ||
      !body.team?.name?.trim() ||
      !body.team.locationId
    ) {
      return NextResponse.json(
        { error: "divisionId, team.name, and team.locationId are required." },
        { status: 400 },
      );
    }
    await withOperatorSession((session) =>
      operatorCreateTeam(session, body.divisionId!.trim(), body.team!),
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return operatorErrorResponse(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    await requireOperatorApi();
    const body = (await request.json()) as {
      divisionId?: string;
      teamId?: string;
      team?: TeamInput;
    };
    if (
      !body.divisionId?.trim() ||
      !body.teamId?.trim() ||
      !body.team?.name?.trim() ||
      !body.team.locationId
    ) {
      return NextResponse.json(
        {
          error:
            "divisionId, teamId, team.name, and team.locationId are required.",
        },
        { status: 400 },
      );
    }
    await withOperatorSession((session) =>
      operatorUpdateTeam(
        session,
        body.teamId!.trim(),
        body.divisionId!.trim(),
        body.team!,
      ),
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return operatorErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireOperatorApi();
    const teamId =
      request.nextUrl.searchParams.get("teamId")?.trim() ||
      ((await request.json().catch(() => null)) as { teamId?: string } | null)
        ?.teamId;
    if (!teamId) {
      return NextResponse.json(
        { error: "teamId is required." },
        { status: 400 },
      );
    }
    await withOperatorSession((session) => operatorDeleteTeam(session, teamId));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return operatorErrorResponse(error);
  }
}
