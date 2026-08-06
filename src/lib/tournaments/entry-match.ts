import type { ScoringSession } from "@/lib/scoring-auth";
import type { TournamentRegistration } from "@/lib/tournaments/types";

export type SessionIdentity = {
  lmsId: string;
  fargoRateId: string | null;
  readableId: string | null;
  /** FairMatch / Fargo profile id from resolveSessionPlayer. */
  resolvedFargoPlayerId: string | null;
};

export type EntryMatchRole = "captain" | "teammate";

export function buildSessionIdentity(
  session: ScoringSession,
  resolvedFargoPlayerId: string | null,
): SessionIdentity {
  return {
    lmsId: session.lmsId,
    fargoRateId: session.fargoRateId?.trim() || null,
    readableId: session.readableId?.trim() || null,
    resolvedFargoPlayerId: resolvedFargoPlayerId?.trim() || null,
  };
}

function idsEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = a?.trim();
  const right = b?.trim();
  if (!left || !right) return false;
  return left === right;
}

function teammateMatchesIdentity(
  mate: {
    fargoPlayerId?: string | null;
    readableId?: string | null;
  },
  identity: SessionIdentity,
): boolean {
  const mateFargo = mate.fargoPlayerId?.trim() || null;
  if (
    mateFargo &&
    (idsEqual(mateFargo, identity.fargoRateId) ||
      idsEqual(mateFargo, identity.resolvedFargoPlayerId))
  ) {
    return true;
  }
  if (
    identity.readableId &&
    idsEqual(mate.readableId, identity.readableId)
  ) {
    return true;
  }
  return false;
}

/** Captain by LMS id; teammate by Fargo / readable id on the mate row. */
export function registrationMatchRole(
  reg: TournamentRegistration,
  identity: SessionIdentity,
): EntryMatchRole | null {
  if (reg.userId && reg.userId === identity.lmsId) return "captain";
  if ((reg.teammates ?? []).some((mate) => teammateMatchesIdentity(mate, identity))) {
    return "teammate";
  }
  return null;
}

export function isActiveEntryStatus(
  status: TournamentRegistration["status"],
): boolean {
  return status !== "withdrawn";
}
