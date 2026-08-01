import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_LEAGUE_ID } from "@/lib/constants";
import { lmsCacheKey } from "@/lib/lms-cache";
import { discoverMembership } from "@/lib/membership";
import { getRedis } from "@/lib/redis";
import { lmsAuthFetch, requireScoringSession } from "@/lib/scoring-auth";
import type { MembershipSnapshot } from "@/lib/types";

export const dynamic = "force-dynamic";
/** Membership scan may probe many divisions; keep serverless headroom. */
export const maxDuration = 60;

/** Membership cache — shorter than LMS data so roster moves show up sooner. */
const MEMBERSHIP_TTL_SECONDS = 60 * 60; // 1 hour

export async function GET(request: NextRequest) {
  try {
    const session = await requireScoringSession();
    const leagueId =
      request.nextUrl.searchParams.get("leagueId")?.trim() ||
      DEFAULT_LEAGUE_ID;
    const auto = request.nextUrl.searchParams.get("auto") === "1";
    const fresh = request.nextUrl.searchParams.get("fresh") === "1";

    // v3: auth probe + public roster fallback (empty results are not cached).
    const cacheKey = lmsCacheKey(
      "membership-v3",
      `${session.lmsId}:${auto ? "auto" : "league"}:${leagueId}`,
    );

    if (fresh) {
      const redis = getRedis();
      if (redis) await redis.del(cacheKey);
    }

    let membership: MembershipSnapshot | null = null;
    const redis = getRedis();
    if (!fresh && redis) {
      try {
        membership = await redis.get<MembershipSnapshot>(cacheKey);
      } catch {
        membership = null;
      }
    }

    if (!membership) {
      membership = await discoverMembership(session.lmsId, {
        leagueId,
        auto,
        authFetch: lmsAuthFetch,
      });
      // Only cache successful discoveries so empty misses can be retried.
      if (membership.teams.length && redis) {
        try {
          await redis.set(cacheKey, membership, {
            ex: MEMBERSHIP_TTL_SECONDS,
          });
        } catch {
          // Ignore cache write failures.
        }
      }
    }

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
