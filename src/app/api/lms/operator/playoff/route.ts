import { NextRequest, NextResponse } from "next/server";
import { requireOperatorApi } from "@/lib/lms-operator-api";
import {
  loginLeagueOperator,
  operatorCreatePlayoff,
  operatorGetPlayoffInfo,
  type PlayoffTeam,
} from "@/lib/lms-operator";
import {
  invalidateOperatorCache,
  operatorCacheKey,
  withOperatorCache,
} from "@/lib/lms-operator-cache";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireOperatorApi();

    const leagueId = request.nextUrl.searchParams.get("leagueId")?.trim();
    if (!leagueId) {
      return NextResponse.json(
        { error: "leagueId is required." },
        { status: 400 },
      );
    }

    const refresh = request.nextUrl.searchParams.get("refresh") === "1";
    const info = await withOperatorCache(
      operatorCacheKey("playoff", leagueId),
      async () => {
        const operator = await loginLeagueOperator();
        return operatorGetPlayoffInfo(operator, leagueId);
      },
      { bypass: refresh },
    );
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
    await requireOperatorApi();

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

    await invalidateOperatorCache({ leagueId });
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
