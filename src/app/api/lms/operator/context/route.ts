import { NextRequest, NextResponse } from "next/server";
import {
  operatorErrorResponse,
  requireOperatorApi,
} from "@/lib/lms-operator-api";
import {
  operatorGetDivisionsForLeague,
  operatorGetLeaguesForUser,
  withOperatorSession,
} from "@/lib/lms-operator-manage";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireOperatorApi();
    const leagueId = request.nextUrl.searchParams.get("leagueId")?.trim();
    const includeArchived =
      request.nextUrl.searchParams.get("includeArchived") === "true";

    if (leagueId) {
      const divisions = await withOperatorSession((session) =>
        operatorGetDivisionsForLeague(session, leagueId, includeArchived),
      );
      return NextResponse.json({ leagueId, divisions });
    }

    const leagues = await withOperatorSession((session) =>
      operatorGetLeaguesForUser(session),
    );
    return NextResponse.json({ leagues });
  } catch (error) {
    return operatorErrorResponse(error);
  }
}
