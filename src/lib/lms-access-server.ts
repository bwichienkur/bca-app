import {
  normalizeEmail,
  type AppUser,
  type PublicAuthUser,
} from "./app-auth";
import {
  canAccessLmsClient,
  LMS_ACCESS_BRIGHT_EMAIL,
  LMS_ACCESS_BRIGHT_LMS_ID,
  type LmsAccessIdentity,
} from "./lms-access";

function serverAllowlistEmails(): Set<string> {
  const emails = new Set<string>([LMS_ACCESS_BRIGHT_EMAIL]);
  const envLo = process.env.LMS_OPERATOR_EMAIL?.trim();
  if (envLo) emails.add(normalizeEmail(envLo));
  const extra = process.env.LMS_TAB_ALLOWLIST_EMAILS?.split(",") ?? [];
  for (const raw of extra) {
    const email = normalizeEmail(raw);
    if (email) emails.add(email);
  }
  return emails;
}

function serverAllowlistLmsIds(): Set<string> {
  const ids = new Set<string>([LMS_ACCESS_BRIGHT_LMS_ID.toLowerCase()]);
  const extra = process.env.LMS_TAB_ALLOWLIST_LMS_IDS?.split(",") ?? [];
  for (const raw of extra) {
    const id = raw.trim().toLowerCase();
    if (id) ids.add(id);
  }
  return ids;
}

/** Server-side gate (includes env allowlists). */
export function canAccessLms(identity: LmsAccessIdentity | null | undefined): boolean {
  if (!identity) return false;
  if (canAccessLmsClient(identity)) return true;
  const email = identity.email ? normalizeEmail(identity.email) : "";
  if (email && serverAllowlistEmails().has(email)) return true;
  const lmsId = identity.lmsId?.trim().toLowerCase() ?? "";
  if (lmsId && serverAllowlistLmsIds().has(lmsId)) return true;
  return false;
}

export function canAccessLmsFromAppUser(user: AppUser | null | undefined): boolean {
  if (!user) return false;
  return canAccessLms({
    email: user.email,
    lmsId: user.fargo?.lmsId ?? null,
    leagueOperator: Boolean(user.leagueOperator),
  });
}

export function canAccessLmsFromPublicUserServer(
  user: PublicAuthUser | null | undefined,
): boolean {
  if (!user) return false;
  return canAccessLms({
    email: user.email,
    lmsId: user.lmsId,
    leagueOperator: Boolean(user.leagueOperator),
  });
}
