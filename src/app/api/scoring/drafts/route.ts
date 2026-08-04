import { NextRequest, NextResponse } from "next/server";
import {
  getSharedDraftSummaries,
  isDraftStoreConfigured,
  whichSharedDraftsExist,
} from "@/lib/draft-store";
import { fillBoardSummariesFromLms } from "@/lib/match-results";
import { requireScoringSession } from "@/lib/scoring-auth";

export const dynamic = "force-dynamic";

/** GET /api/scoring/drafts?ids=a,b,c[&summaries=1] */
export async function GET(request: NextRequest) {
  try {
    await requireScoringSession();
    const idsParam = request.nextUrl.searchParams.get("ids") ?? "";
    const ids = idsParam
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
      .slice(0, 80);
    const wantSummaries =
      request.nextUrl.searchParams.get("summaries") === "1";

    const shared = isDraftStoreConfigured();

    if (wantSummaries) {
      const draftSummaries = shared
        ? await getSharedDraftSummaries(ids)
        : {};
      const summaries = await fillBoardSummariesFromLms(ids, draftSummaries);
      return NextResponse.json({
        shared,
        matchIds: Object.keys(summaries).filter(
          (id) => summaries[id]?.status === "in_progress",
        ),
        summaries,
      });
    }

    if (!shared) {
      return NextResponse.json({
        shared: false,
        matchIds: [] as string[],
        summaries: {},
      });
    }

    const matchIds = await whichSharedDraftsExist(ids);
    return NextResponse.json({ shared: true, matchIds, summaries: {} });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to list drafts.";
    const status = message.includes("Sign in") ? 401 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
