import { createHash, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import {
  LMS_ACCESS_BRIGHT_EMAIL,
  LMS_ACCESS_BRIGHT_LMS_ID,
  type LmsAccessIdentity,
} from "@/lib/lms-access";
import type { AppUser } from "@/lib/app-auth";

/** HttpOnly cookie holding the active view-as target (Bright only). */
export const IMPERSONATION_COOKIE = "tableside.impersonate";

const IMPERSONATION_TTL_SECONDS = 60 * 60 * 12; // 12 hours

export type ImpersonationSession = {
  actorUserId: string;
  targetLmsId: string;
  targetName: string | null;
  targetEmail: string | null;
  targetReadableId: string | null;
  startedAt: number;
  expiresAt: number;
};

export type ImpersonationActor = {
  id: string;
  email: string | null;
  name: string | null;
  lmsId: string;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Superadmin gate — Bright only (hardcoded owner).
 * Not granted to other league operators.
 */
export function isSuperadminIdentity(
  identity: LmsAccessIdentity | null | undefined,
): boolean {
  if (!identity) return false;
  const email = identity.email ? normalizeEmail(identity.email) : "";
  if (email === LMS_ACCESS_BRIGHT_EMAIL) return true;
  const lmsId = identity.lmsId?.trim().toLowerCase() ?? "";
  return lmsId === LMS_ACCESS_BRIGHT_LMS_ID.toLowerCase();
}

export function isSuperadminAppUser(user: AppUser | null | undefined): boolean {
  if (!user) return false;
  return isSuperadminIdentity({
    email: user.email,
    lmsId: user.fargo?.lmsId ?? null,
  });
}

function impersonationSecret(): string {
  return (
    process.env.TABLESIDE_APP_SESSION_SECRET ||
    process.env.AUTH0_CLIENT_SECRET ||
    "tableside-dev-app-session-secret"
  );
}

function signPayload(session: ImpersonationSession): string {
  const body = Buffer.from(JSON.stringify(session)).toString("base64url");
  const sig = createHash("sha256")
    .update(`${body}.${impersonationSecret()}`)
    .digest("base64url");
  return `${body}.${sig}`;
}

function readSignedPayload(raw: string): ImpersonationSession | null {
  const [body, sig] = raw.split(".");
  if (!body || !sig) return null;
  const expected = createHash("sha256")
    .update(`${body}.${impersonationSecret()}`)
    .digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const session = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as ImpersonationSession;
    if (
      !session.actorUserId ||
      !session.targetLmsId ||
      !session.expiresAt
    ) {
      return null;
    }
    if (session.expiresAt <= Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

export async function readImpersonation(): Promise<ImpersonationSession | null> {
  const jar = await cookies();
  const raw = jar.get(IMPERSONATION_COOKIE)?.value;
  if (!raw) return null;
  return readSignedPayload(raw);
}

export async function writeImpersonation(
  session: Omit<ImpersonationSession, "startedAt" | "expiresAt">,
): Promise<ImpersonationSession> {
  const jar = await cookies();
  const now = Date.now();
  const full: ImpersonationSession = {
    ...session,
    startedAt: now,
    expiresAt: now + IMPERSONATION_TTL_SECONDS * 1000,
  };
  jar.set(IMPERSONATION_COOKIE, signPayload(full), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: IMPERSONATION_TTL_SECONDS,
  });
  return full;
}

export async function clearImpersonation(): Promise<void> {
  const jar = await cookies();
  jar.delete(IMPERSONATION_COOKIE);
}

/**
 * Resolve the effective LMS player id for read paths (membership, etc.).
 * Returns null when not impersonating or actor is not the cookie owner.
 */
export async function resolveImpersonatedPlayerId(
  actor: AppUser,
): Promise<string | null> {
  if (!isSuperadminAppUser(actor)) return null;
  const session = await readImpersonation();
  if (!session) return null;
  if (session.actorUserId !== actor.id) {
    await clearImpersonation();
    return null;
  }
  return session.targetLmsId.trim() || null;
}

export function actorFromAppUser(user: AppUser): ImpersonationActor {
  return {
    id: user.id,
    email: user.email,
    name: user.name || user.fargo?.name || null,
    lmsId: user.fargo?.lmsId ?? "",
  };
}

/** Reject LMS write actions while Bright is viewing as another player. */
export async function assertNotImpersonating(): Promise<void> {
  try {
    const { requireAppUser } = await import("@/lib/app-auth");
    const actor = await requireAppUser();
    const target = await resolveImpersonatedPlayerId(actor);
    if (target) {
      throw new Error(
        "Exit view-as before submitting scores to LMS. Draft sync still works while viewing as another player.",
      );
    }
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("Exit view-as before submitting")
    ) {
      throw error;
    }
    // No app session — not impersonating.
  }
}
