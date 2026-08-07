import { NextRequest, NextResponse } from "next/server";
import {
  isOperatorConfigured,
  loginLeagueOperator,
  operatorCreatePlayoff,
  operatorGetPlayoffInfo,
  type PlayoffTeam,
} from "@/lib/lms-operator";
import { requireScoringSession } from "@/lib/scoring-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireScoringSession();
    if (!isOperatorConfigured()) {
      return NextResponse.json(
        {
          error:
            "League operator is not configured. Set LMS_OPERATOR_EMAIL and LMS_OPERATOR_PASSWORD.",
        },
        { status: 503 },
      );
    }

    const leagueId = request.nextUrl.searchParams.get("leagueId")?.trim();
    if (!leagueId) {
      return NextResponse.json(
        { error: "leagueId is required." },
        { status: 400 },
      );
    }

    const operator = await loginLeagueOperator();
    const info = await operatorGetPlayoffInfo(operator, leagueId);
    return NextResponse.json(info);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load playoff info.";
    const status = message.includes("Sign in")
      ? 401
      : message.includes("not configured")
        ? 503
        : 502;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireScoringSession();
    if (!isOperatorConfigured()) {
      return NextResponse.json(
        {
          error:
            "League operator is not configured. Set LMS_OPERATOR_EMAIL and LMS_OPERATOR_PASSWORD.",
        },
        { status: 503 },
      );
    }

    const body = (await request.json()) as {
      leagueId?: string;
      name?: string;
      skillLevel?: string;
      selectedTeams?: PlayoffTeam[];
    };

    const leagueId = body.leagueId?.trim() ?? "";
    const name = body.name?.trim() ?? "";
    const skillLevel = body.skillLevel?.trim() ?? "";
    const selectedTeams = Array.isArray(body.selectedTeams)
      ? body.selectedTeams.filter((t) => t?.id && t?.name)
      : [];

    if (!leagueId || !name || !skillLevel) {
      return NextResponse.json(
        { error: "leagueId, name, and skillLevel are required." },
        { status: 400 },
      );
    }
    if (selectedTeams.length < 2) {
      return NextResponse.json(
        { error: "Select at least two teams for the playoff." },
        { status: 400 },
      );
    }

    const operator = await loginLeagueOperator();
    const result = await operatorCreatePlayoff(operator, {
      leagueId,
      name,
      skillLevel,
      selectedTeams: selectedTeams.map((t) => ({
        id: String(t.id),
        name: String(t.name),
        divisionId: String(t.divisionId ?? ""),
        numberOfPlayers: Number(t.numberOfPlayers ?? 0) || 0,
      })),
    });

    if (!result.success) {
      return NextResponse.json(
        {
          ok: false,
          error: result.message || "Playoff creation failed.",
          redirectUrl: result.redirectUrl,
        },
        { status: 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      message: result.message,
      redirectUrl: result.redirectUrl,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create playoff.";
    const status = message.includes("Sign in")
      ? 401
      : message.includes("not configured")
        ? 503
        : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
