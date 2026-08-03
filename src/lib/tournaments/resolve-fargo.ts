import {
  fetchFargoPlayerProfile,
  lookupRatingsByReadableIds,
  type FargoPlayerProfile,
} from "@/lib/fargo-player";
import type { ScoringSession } from "@/lib/scoring-auth";

export type SessionPlayerSnapshot = {
  rating: number | null;
  robustness: number | null;
  robustnessStatus: FargoPlayerProfile["robustnessStatus"];
  fargoPlayerId: string | null;
};

function emptySnapshot(): SessionPlayerSnapshot {
  return {
    rating: null,
    robustness: null,
    robustnessStatus: "starter",
    fargoPlayerId: null,
  };
}

/** Resolve signed-in player Fargo + robustness; never trust client-supplied ratings. */
export async function resolveSessionPlayer(
  session: ScoringSession,
): Promise<SessionPlayerSnapshot> {
  const candidates = [session.fargoRateId, session.readableId]
    .map((id) => (id ?? "").trim())
    .filter(Boolean);

  for (const id of candidates) {
    try {
      const profile = await fetchFargoPlayerProfile(id);
      const rating =
        profile.effectiveRating ?? profile.provisionalRating ?? profile.rating;
      return {
        rating,
        robustness: profile.robustness,
        robustnessStatus: profile.robustnessStatus,
        fargoPlayerId: profile.id || id,
      };
    } catch {
      /* try next id */
    }
  }

  if (session.readableId) {
    try {
      const map = await lookupRatingsByReadableIds([session.readableId]);
      const rating = map.get(String(session.readableId).trim()) ?? null;
      return {
        ...emptySnapshot(),
        rating,
        fargoPlayerId: session.fargoRateId,
      };
    } catch {
      return {
        ...emptySnapshot(),
        fargoPlayerId: session.fargoRateId,
      };
    }
  }

  return {
    ...emptySnapshot(),
    fargoPlayerId: session.fargoRateId,
  };
}

/** @deprecated Prefer resolveSessionPlayer for rating + robustness. */
export async function resolveSessionFargo(
  session: ScoringSession,
): Promise<number | null> {
  const snap = await resolveSessionPlayer(session);
  return snap.rating;
}
