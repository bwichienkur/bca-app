import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_LEAGUE_ID } from "@/lib/constants";
import { lmsCacheKey, withLmsCache } from "@/lib/lms-cache";
import { discoverMembership } from "@/lib/membership";
import { getRedis } from "@/lib/redis";
import { lmsAuthFetch, requireScoringSession } from "@/lib/scoring-auth";

export const dynamic = "force-dynamic";
/** League-scoped membership scan — keep headroom on serverless. */
export const maxDuration = 60;

/** Membership cache — shorter than LMS data so roster moves show up sooner. */
const MEMBERSHIP_TTL_SECONDS = 60 * 60; // 1 hour

export async function GET(request: NextRequest) {
  try {
    const session = await requireScoringSession();
    const leagueId =
      request.nextUrl.searchParams.get("leagueId")?.trim() ||
      DEFAULT_LEAGUE_ID;
    const fresh = request.nextUrl.searchParams.get("fresh") === "1";

    // v2: league-scoped + player-schedule discovery (not worldwide calculator).
    const cacheKey = lmsCacheKey(
      "membership-v2",
      `${session.lmsId}:${leagueId}`,
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
          leagueId,
          authFetch: lmsAuthFetch,
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
