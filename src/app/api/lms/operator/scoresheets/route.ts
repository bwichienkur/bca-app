import { NextRequest, NextResponse } from "next/server";
import {
  deleteSharedDraft,
  isDraftStoreConfigured,
} from "@/lib/draft-store";
import {
  operatorErrorResponse,
  requireOperatorApi,
} from "@/lib/lms-operator-api";
import {
  operatorListScoresheets,
  operatorResetMatchResults,
  withOperatorSession,
} from "@/lib/lms-operator-manage";
import {
  invalidateOperatorCache,
  operatorCacheKey,
  withOperatorCache,
} from "@/lib/lms-operator-cache";

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
    const refresh = request.nextUrl.searchParams.get("refresh") === "1";
    const matches = await withOperatorCache(
      operatorCacheKey("scoresheets", divisionId),
      () =>
        withOperatorSession((session) =>
          operatorListScoresheets(session, divisionId),
        ),
      { bypass: refresh },
    );
    return NextResponse.json({ matches });
  } catch (error) {
    return operatorErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireOperatorApi();
    const body = (await request.json()) as {
      action?: string;
      matchId?: string;
      divisionId?: string;
    };
    const action = (body.action ?? "").trim().toLowerCase();

    if (action === "clear") {
      const matchId = body.matchId?.trim();
      if (!matchId) {
        return NextResponse.json(
          { error: "matchId is required." },
          { status: 400 },
        );
      }
      await withOperatorSession((session) =>
        operatorResetMatchResults(session, matchId),
      );
      if (isDraftStoreConfigured()) {
        await deleteSharedDraft(matchId);
      }
      await invalidateOperatorCache({
        divisionId: body.divisionId?.trim() || null,
      });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    return operatorErrorResponse(error);
  }
}
