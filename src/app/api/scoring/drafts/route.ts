import { NextRequest, NextResponse } from "next/server";
import {
  isDraftStoreConfigured,
  whichSharedDraftsExist,
} from "@/lib/draft-store";
import { requireScoringSession } from "@/lib/scoring-auth";

export const dynamic = "force-dynamic";

/** GET /api/scoring/drafts?ids=a,b,c — which match ids have a shared draft. */
export async function GET(request: NextRequest) {
  try {
    await requireScoringSession();
    const idsParam = request.nextUrl.searchParams.get("ids") ?? "";
    const ids = idsParam
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
      .slice(0, 80);

    if (!isDraftStoreConfigured()) {
      return NextResponse.json({
        shared: false,
        matchIds: [] as string[],
      });
    }

    const matchIds = await whichSharedDraftsExist(ids);
    return NextResponse.json({ shared: true, matchIds });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to list drafts.";
    const status = message.includes("Sign in") ? 401 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
