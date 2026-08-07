import { NextRequest, NextResponse } from "next/server";
import {
  operatorErrorResponse,
  requireOperatorApi,
} from "@/lib/lms-operator-api";
import {
  operatorCacheKey,
  withOperatorCache,
} from "@/lib/lms-operator-cache";
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
    const refresh = request.nextUrl.searchParams.get("refresh") === "1";

    if (leagueId) {
      const divisions = await withOperatorCache(
        operatorCacheKey(
          "divisions",
          leagueId,
          includeArchived ? "archived" : "active",
        ),
        () =>
          withOperatorSession((session) =>
            operatorGetDivisionsForLeague(session, leagueId, includeArchived),
          ),
        { bypass: refresh },
      );
      return NextResponse.json({ leagueId, divisions });
    }

    const leagues = await withOperatorCache(
      operatorCacheKey("leagues"),
      () => withOperatorSession((session) => operatorGetLeaguesForUser(session)),
      { bypass: refresh },
    );
    return NextResponse.json({ leagues });
  } catch (error) {
    return operatorErrorResponse(error);
  }
}
