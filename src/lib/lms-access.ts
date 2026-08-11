/** Bright Wichienkur — always allowed to use the LMS operator tab. */
export const LMS_ACCESS_BRIGHT_EMAIL = "twichien@outlook.com";
export const LMS_ACCESS_BRIGHT_LMS_ID =
  "46949e5b-ad49-4325-a142-ae8b012604aa";

export type LmsAccessIdentity = {
  email?: string | null;
  lmsId?: string | null;
  leagueOperator?: boolean | null;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Client-safe: Bright / owner only (view-as / superadmin tools). */
export function isSuperadminClient(
  identity: LmsAccessIdentity | null | undefined,
): boolean {
  if (!identity) return false;
  const email = identity.email ? normalizeEmail(identity.email) : "";
  if (email === LMS_ACCESS_BRIGHT_EMAIL) return true;
  const lmsId = identity.lmsId?.trim().toLowerCase() ?? "";
  return lmsId === LMS_ACCESS_BRIGHT_LMS_ID.toLowerCase();
}

/**
 * Client-safe gate: Bright allowlist + `leagueOperator` flag from session.
 * Env LO email is covered when they sign in via League Operator login
 * (sets `leagueOperator: true`).
 */
export function canAccessLmsClient(
  identity: LmsAccessIdentity | null | undefined,
): boolean {
  if (!identity) return false;
  if (identity.leagueOperator) return true;
  return isSuperadminClient(identity);
}

/** Alias used by client UI (nav / LMS tab). */
export function canAccessLmsFromPublicUser(
  user: LmsAccessIdentity | null | undefined,
): boolean {
  return canAccessLmsClient(user);
}
