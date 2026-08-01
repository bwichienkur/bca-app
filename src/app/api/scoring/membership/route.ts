import { NextRequest, NextResponse } from "next/server";
import { lmsCacheKey, withLmsCache } from "@/lib/lms-cache";
import { discoverMembership } from "@/lib/membership";
import { getRedis } from "@/lib/redis";
import { requireScoringSession } from "@/lib/scoring-auth";

export const dynamic = "force-dynamic";

/** Membership cache — shorter than LMS data so roster moves show up sooner. */
const MEMBERSHIP_TTL_SECONDS = 60 * 60; // 1 hour

export async function GET(request: NextRequest) {
  try {
    const session = await requireScoringSession();
    const leagueId = request.nextUrl.searchParams.get("leagueId");
    const fresh = request.nextUrl.searchParams.get("fresh") === "1";

    const cacheKey = lmsCacheKey(
      "membership",
      `${session.lmsId}:${leagueId ?? "all"}`,
    );

    if (fresh) {
      const redis = getRedis();
      if (redis) await redis.del(cacheKey);
    }

    const membership = await withLmsCache(
      cacheKey,
      MEMBERSHIP_TTL_SECONDS,
      () =>
        discoverMembership(session.lmsId, {
          leagueId: leagueId || null,
        }),
    );

    return NextResponse.json({
      membership: {
        ...membership,
        playerId: session.lmsId,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load membership.";
    const status = message.includes("Sign in") ? 401 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
