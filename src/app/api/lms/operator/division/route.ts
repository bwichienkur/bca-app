import { NextRequest, NextResponse } from "next/server";
import { requireOperatorApi } from "@/lib/lms-operator-api";
import {
  loginLeagueOperator,
  operatorCreateDivisionFromCopy,
  operatorGetDivisionSettings,
} from "@/lib/lms-operator";
import { invalidateOperatorCache } from "@/lib/lms-operator-cache";

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

    const operator = await loginLeagueOperator();
    const settings = await operatorGetDivisionSettings(
      operator,
      divisionId,
      true,
    );
    return NextResponse.json({
      id: settings.Id ?? divisionId,
      name: settings.Name ?? null,
      description: settings.Description ?? null,
      skillLevel: settings.SkillLevel ?? null,
      numberOfPlayers: settings.NumberOfPlayers ?? null,
      costPerPlayer: settings.CostPerPlayer ?? null,
      gameType: settings.GameType ?? null,
      tableSize: settings.TableSize ?? null,
      timeZoneName: settings.TimeZoneName ?? null,
      bcaplFormat: settings.BCAPLFormat ?? null,
      leagueId: settings.LeagueId ?? null,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to load division settings.";
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
      sourceDivisionId?: string;
      name?: string;
      description?: string;
      skillLevel?: string | number;
      includeTeams?: boolean;
      includePlayers?: boolean;
    };

    const leagueId = body.leagueId?.trim() ?? "";
    const sourceDivisionId = body.sourceDivisionId?.trim() ?? "";
    const name = body.name?.trim() ?? "";

    if (!leagueId || !sourceDivisionId || !name) {
      return NextResponse.json(
        { error: "leagueId, sourceDivisionId, and name are required." },
        { status: 400 },
      );
    }

    const operator = await loginLeagueOperator();
    const result = await operatorCreateDivisionFromCopy(operator, {
      leagueId,
      sourceDivisionId,
      name,
      description: body.description?.trim(),
      skillLevel: body.skillLevel,
      includeTeams: body.includeTeams !== false,
      includePlayers: Boolean(body.includePlayers),
    });

    if (!result.success) {
      return NextResponse.json(
        {
          ok: false,
          error:
            result.messages.join("\n") ||
            "Division creation failed in LMS.",
          messages: result.messages,
          redirectUrl: result.redirectUrl,
        },
        { status: 400 },
      );
    }

    await invalidateOperatorCache({ leagueId });
    return NextResponse.json({
      ok: true,
      messages: result.messages,
      redirectUrl: result.redirectUrl,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create division.";
    const status = message.includes("Sign in")
      ? 401
      : message.includes("not configured")
        ? 503
        : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
