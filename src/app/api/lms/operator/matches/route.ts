import { NextRequest, NextResponse } from "next/server";
import { requireOperatorApi } from "@/lib/lms-operator-api";
import {
  loginLeagueOperator,
  operatorGetMissedMatches,
  operatorGetNextMatches,
} from "@/lib/lms-operator";
import {
  operatorCacheKey,
  withOperatorCache,
} from "@/lib/lms-operator-cache";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireOperatorApi();

    const divisionId = request.nextUrl.searchParams.get("divisionId")?.trim();
    const kind = (
      request.nextUrl.searchParams.get("kind") ?? "next"
    ).toLowerCase();
    if (!divisionId) {
      return NextResponse.json(
        { error: "divisionId is required." },
        { status: 400 },
      );
    }
    if (kind !== "next" && kind !== "missed") {
      return NextResponse.json(
        { error: 'kind must be "next" or "missed".' },
        { status: 400 },
      );
    }

    const refresh = request.nextUrl.searchParams.get("refresh") === "1";
    const matches = await withOperatorCache(
      operatorCacheKey("matches", divisionId, kind),
      async () => {
        const operator = await loginLeagueOperator();
        return kind === "missed"
          ? operatorGetMissedMatches(operator, divisionId)
          : operatorGetNextMatches(operator, divisionId);
      },
      { bypass: refresh },
    );

    return NextResponse.json({ kind, divisionId, matches });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load matches.";
    const status = message.includes("Sign in")
      ? 401
      : message.includes("not configured")
        ? 503
        : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
