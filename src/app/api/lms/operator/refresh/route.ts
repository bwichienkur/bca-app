import { NextRequest, NextResponse } from "next/server";
import {
  operatorErrorResponse,
  requireOperatorApi,
} from "@/lib/lms-operator-api";
import { invalidateOperatorCache } from "@/lib/lms-operator-cache";

export const dynamic = "force-dynamic";

/** Clear operator LMS caches so the next reads hit LMS fresh. */
export async function POST(request: NextRequest) {
  try {
    await requireOperatorApi();
    const body = (await request.json().catch(() => ({}))) as {
      leagueId?: string;
      divisionId?: string;
    };
    const deleted = await invalidateOperatorCache({
      leagueId: body.leagueId?.trim() || null,
      divisionId: body.divisionId?.trim() || null,
    });
    return NextResponse.json({ ok: true, deleted });
  } catch (error) {
    return operatorErrorResponse(error);
  }
}
