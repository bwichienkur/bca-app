import { NextRequest, NextResponse } from "next/server";
import { requireAppUser } from "@/lib/app-auth";
import { DEFAULT_LEAGUE_ID } from "@/lib/constants";
import { resolveImpersonatedPlayerId } from "@/lib/impersonation";
import { lmsCacheKey } from "@/lib/lms-cache";
import { discoverMembership } from "@/lib/membership";
import { getRedis } from "@/lib/redis";
import { lmsAuthFetch, requireScoringSession } from "@/lib/scoring-auth";
import type { MembershipSnapshot } from "@/lib/types";

export const dynamic = "force-dynamic";
/** Player-schedule discovery is usually a few seconds. */
export const maxDuration = 60;

/** Membership cache — shorter than LMS data so roster moves show up sooner. */
const MEMBERSHIP_TTL_SECONDS = 60 * 60; // 1 hour

export async function GET(request: NextRequest) {
  try {
    const session = await requireScoringSession();
    let playerId = session.lmsId;
    try {
      const appUser = await requireAppUser();
      const impersonated = await resolveImpersonatedPlayerId(appUser);
      if (impersonated) playerId = impersonated;
    } catch {
      // No app session — use scoring cookie player id.
    }

    const leagueId =
      request.nextUrl.searchParams.get("leagueId")?.trim() ||
      DEFAULT_LEAGUE_ID;
    const divisionId = request.nextUrl.searchParams.get("divisionId");
    const teamId = request.nextUrl.searchParams.get("teamId");
    const teamName = request.nextUrl.searchParams.get("teamName");
    const fresh = request.nextUrl.searchParams.get("fresh") === "1";

    // v6: one global BCAPL player-schedule discovery per player.
    const cacheKey = lmsCacheKey("membership-v6", playerId);

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
      membership = await discoverMembership(playerId, {
        leagueId,
        divisionId,
        teamId,
        teamName,
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
        playerId,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load membership.";
    const status = message.includes("Sign in") ? 401 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
