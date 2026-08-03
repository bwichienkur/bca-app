import {
  fetchFargoPlayerProfile,
  lookupRatingsByReadableIds,
} from "@/lib/fargo-player";
import type { ScoringSession } from "@/lib/scoring-auth";

/** Resolve the signed-in player's effective Fargo; never trust client-supplied ratings. */
export async function resolveSessionFargo(
  session: ScoringSession,
): Promise<number | null> {
  const candidates = [session.fargoRateId, session.readableId]
    .map((id) => (id ?? "").trim())
    .filter(Boolean);

  for (const id of candidates) {
    try {
      const profile = await fetchFargoPlayerProfile(id);
      if (profile.effectiveRating != null) return profile.effectiveRating;
      if (profile.provisionalRating != null) return profile.provisionalRating;
    } catch {
      /* try next id */
    }
  }

  if (session.readableId) {
    try {
      const map = await lookupRatingsByReadableIds([session.readableId]);
      return map.get(String(session.readableId).trim()) ?? null;
    } catch {
      return null;
    }
  }

  return null;
}
