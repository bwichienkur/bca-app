import { createHash, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { getRedis, isRedisConfigured } from "@/lib/redis";
import type { ScoringSession } from "@/lib/scoring-auth";

export const APP_SESSION_COOKIE = "tableside.app.session";
const USER_KEY = (id: string) => `tableside:app-user:v1:${id}`;
const EMAIL_KEY = (email: string) =>
  `tableside:app-user-email:v1:${normalizeEmail(email)}`;
const LMS_KEY = (lmsId: string) => `tableside:app-user-lms:v1:${lmsId.trim()}`;
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 60; // 60 days

export type LinkedFargoAccount = {
  lmsId: string;
  fargoRateId: string | null;
  readableId: string | null;
  email: string | null;
  name: string | null;
  linkedAt: string;
};

export type LinkedDigitalPoolAccount = {
  uid: string;
  userId: number;
  email: string;
  name: string | null;
  refreshToken: string;
  idToken: string | null;
  idTokenExpiresAt: number | null;
  linkedAt: string;
};

/** Stripe Connect Express account for tournament entry-fee payouts. */
export type LinkedStripeAccount = {
  accountId: string;
  chargesEnabled: boolean;
  detailsSubmitted: boolean;
  payoutsEnabled: boolean;
  linkedAt: string;
  updatedAt: string;
};

export type AppUser = {
  id: string;
  email: string;
  name: string | null;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
  fargo: LinkedFargoAccount | null;
  digitalPool: LinkedDigitalPoolAccount | null;
  stripe?: LinkedStripeAccount | null;
  /** Verified LMS League Operator web login (see /api/auth/login/operator). */
  leagueOperator?: boolean;
  leagueOperatorLinkedAt?: string | null;
};

export type AppSession = {
  userId: string;
  expiresAt: number;
};

/** Public user shape returned to the client. */
export type PublicAuthUser = {
  id: string;
  email: string | null;
  name: string | null;
  /** Present when Fargo is linked; empty string when not. */
  lmsId: string;
  readableId: string | null;
  fargoLinked: boolean;
  digitalPoolLinked: boolean;
  stripeLinked: boolean;
  /** True when the connected Stripe account can accept charges. */
  stripeChargesEnabled: boolean;
  /** True when a live Fargo scoring session cookie is available. */
  scoringReady: boolean;
  /** Verified LMS League Operator — unlocks the LMS tab with Bright allowlist. */
  leagueOperator: boolean;
};

type MemoryStore = {
  users: Map<string, AppUser>;
  emailIndex: Map<string, string>;
  lmsIndex: Map<string, string>;
};

declare global {
  // eslint-disable-next-line no-var
  var __tablesideAppAuthMemory: MemoryStore | undefined;
}

function memory(): MemoryStore {
  if (!globalThis.__tablesideAppAuthMemory) {
    globalThis.__tablesideAppAuthMemory = {
      users: new Map(),
      emailIndex: new Map(),
      lmsIndex: new Map(),
    };
  }
  const store = globalThis.__tablesideAppAuthMemory;
  if (!store.lmsIndex) store.lmsIndex = new Map();
  return store;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function newId(): string {
  return `usr_${randomBytes(12).toString("hex")}`;
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, encoded: string): boolean {
  const [scheme, salt, hash] = encoded.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const next = scryptSync(password, salt, 64);
  const prev = Buffer.from(hash, "hex");
  if (prev.length !== next.length) return false;
  return timingSafeEqual(prev, next);
}

function signSession(session: AppSession): string {
  const secret = sessionSecret();
  const body = Buffer.from(JSON.stringify(session)).toString("base64url");
  const sig = createHash("sha256")
    .update(`${body}.${secret}`)
    .digest("base64url");
  return `${body}.${sig}`;
}

function readSignedSession(raw: string): AppSession | null {
  const [body, sig] = raw.split(".");
  if (!body || !sig) return null;
  const expected = createHash("sha256")
    .update(`${body}.${sessionSecret()}`)
    .digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const session = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as AppSession;
    if (!session.userId || !session.expiresAt) return null;
    if (session.expiresAt <= Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

function sessionSecret(): string {
  return (
    process.env.TABLESIDE_APP_SESSION_SECRET ||
    process.env.AUTH0_CLIENT_SECRET ||
    "tableside-dev-app-session-secret"
  );
}

export async function getAppUser(id: string): Promise<AppUser | null> {
  const redis = getRedis();
  if (redis) {
    try {
      const row = await redis.get<AppUser>(USER_KEY(id));
      return row?.id ? row : null;
    } catch {
      /* fall through */
    }
  }
  return memory().users.get(id) ?? null;
}

export async function getAppUserByEmail(
  email: string,
): Promise<AppUser | null> {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const redis = getRedis();
  if (redis) {
    try {
      const id = await redis.get<string>(EMAIL_KEY(normalized));
      if (id) return getAppUser(id);
    } catch {
      /* fall through */
    }
  }
  const id = memory().emailIndex.get(normalized);
  return id ? (memory().users.get(id) ?? null) : null;
}

/** Look up an app user by linked Fargo LMS id (tournament organizerUserId). */
export async function getAppUserByLmsId(
  lmsId: string,
): Promise<AppUser | null> {
  const id = lmsId.trim();
  if (!id) return null;
  const redis = getRedis();
  if (redis) {
    try {
      const userId = await redis.get<string>(LMS_KEY(id));
      if (userId) {
        const user = await getAppUser(userId);
        if (user?.fargo?.lmsId === id) return user;
      }
    } catch {
      /* fall through */
    }
  }
  const userId = memory().lmsIndex.get(id);
  if (userId) {
    const user = memory().users.get(userId);
    if (user?.fargo?.lmsId === id) return user;
  }
  // Memory fallback scan (dev / single-instance without index).
  for (const user of memory().users.values()) {
    if (user.fargo?.lmsId === id) return user;
  }
  return null;
}

async function syncLmsIndex(
  user: AppUser,
  previousLmsId?: string | null,
): Promise<void> {
  const nextLmsId = user.fargo?.lmsId?.trim() || "";
  const prev = previousLmsId?.trim() || "";
  const redis = getRedis();
  if (redis) {
    try {
      if (prev && prev !== nextLmsId) {
        const current = await redis.get<string>(LMS_KEY(prev));
        if (current === user.id) await redis.del(LMS_KEY(prev));
      }
      if (nextLmsId) {
        await redis.set(LMS_KEY(nextLmsId), user.id, {
          ex: SESSION_TTL_SECONDS * 6,
        });
      }
    } catch {
      /* fall through to memory */
    }
  }
  if (prev && prev !== nextLmsId) {
    if (memory().lmsIndex.get(prev) === user.id) {
      memory().lmsIndex.delete(prev);
    }
  }
  if (nextLmsId) memory().lmsIndex.set(nextLmsId, user.id);
}

export async function saveAppUser(user: AppUser): Promise<AppUser> {
  const previous = await getAppUser(user.id);
  const next: AppUser = {
    ...user,
    email: normalizeEmail(user.email),
    stripe: user.stripe ?? null,
    updatedAt: new Date().toISOString(),
  };
  const redis = getRedis();
  if (redis) {
    try {
      await redis.set(USER_KEY(next.id), next, { ex: SESSION_TTL_SECONDS * 6 });
      await redis.set(EMAIL_KEY(next.email), next.id, {
        ex: SESSION_TTL_SECONDS * 6,
      });
      await syncLmsIndex(next, previous?.fargo?.lmsId);
      return next;
    } catch {
      /* fall through */
    }
  }
  memory().users.set(next.id, next);
  memory().emailIndex.set(next.email, next.id);
  await syncLmsIndex(next, previous?.fargo?.lmsId);
  return next;
}

export async function registerAppUser(input: {
  email: string;
  password: string;
  name?: string | null;
}): Promise<AppUser> {
  const email = normalizeEmail(input.email);
  const password = input.password;
  if (!email || !email.includes("@")) {
    throw new Error("A valid email is required.");
  }
  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }
  const existing = await getAppUserByEmail(email);
  if (existing) {
    throw new Error("An account with that email already exists.");
  }
  if (!isRedisConfigured() && process.env.NODE_ENV === "production") {
    // Still allow memory fallback in prod if Redis missing, but warn via error
    // would be too harsh — memory works for single-instance.
  }
  const now = new Date().toISOString();
  const user: AppUser = {
    id: newId(),
    email,
    name: input.name?.trim() || null,
    passwordHash: hashPassword(password),
    createdAt: now,
    updatedAt: now,
    fargo: null,
    digitalPool: null,
    stripe: null,
    leagueOperator: false,
    leagueOperatorLinkedAt: null,
  };
  return saveAppUser(user);
}

export async function authenticateAppUser(
  email: string,
  password: string,
): Promise<AppUser> {
  const user = await getAppUserByEmail(email);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    throw new Error("Invalid email or password.");
  }
  return user;
}

/**
 * Ensure an app user exists for a successful Fargo login.
 * First-time Fargo sign-in creates the Tableside account automatically.
 */
export async function upsertAppUserFromFargo(
  scoring: ScoringSession,
  options?: {
    /** Password used at Fargo login — becomes the Tableside password for new accounts. */
    password?: string;
    /** Fallback when Fargo JWT has no email (use the login username). */
    emailFallback?: string;
  },
): Promise<AppUser> {
  const email = normalizeEmail(
    scoring.email || options?.emailFallback || "",
  );
  if (!email || !email.includes("@")) {
    throw new Error(
      "Fargo login succeeded but no email was returned. Sign in with your Fargo email address.",
    );
  }

  let user = await getAppUserByEmail(email);

  // Also match an existing Tableside user already linked to this LMS id.
  if (!user && scoring.lmsId) {
    // No email index hit — leave as create; LMS-id lookup would need a secondary index.
  }

  const fargo: LinkedFargoAccount = {
    lmsId: scoring.lmsId,
    fargoRateId: scoring.fargoRateId,
    readableId: scoring.readableId,
    email: scoring.email || email,
    name: scoring.name,
    linkedAt: new Date().toISOString(),
  };

  if (!user) {
    const now = new Date().toISOString();
    const password =
      options?.password?.trim() || randomBytes(24).toString("hex");
    user = {
      id: newId(),
      email,
      name: scoring.name,
      passwordHash: hashPassword(password),
      createdAt: now,
      updatedAt: now,
      fargo,
      digitalPool: null,
      stripe: null,
      leagueOperator: false,
      leagueOperatorLinkedAt: null,
    };
  } else {
    user = {
      ...user,
      name: user.name || scoring.name,
      fargo,
      // Keep Tableside password in sync when they sign in via Fargo.
      ...(options?.password
        ? { passwordHash: hashPassword(options.password) }
        : {}),
    };
  }
  return saveAppUser(user);
}

/**
 * Ensure an app user exists after a successful LMS League Operator web login.
 * Marks the account as a league operator so the LMS tab stays visible.
 */
export async function upsertAppUserFromLeagueOperator(input: {
  email: string;
  password: string;
  name?: string | null;
}): Promise<AppUser> {
  const email = normalizeEmail(input.email);
  if (!email || !email.includes("@")) {
    throw new Error("A valid league operator email is required.");
  }
  if (!input.password.trim()) {
    throw new Error("Password is required.");
  }

  let user = await getAppUserByEmail(email);
  const now = new Date().toISOString();
  if (!user) {
    user = {
      id: newId(),
      email,
      name: input.name?.trim() || null,
      passwordHash: hashPassword(input.password),
      createdAt: now,
      updatedAt: now,
      fargo: null,
      digitalPool: null,
      stripe: null,
      leagueOperator: true,
      leagueOperatorLinkedAt: now,
    };
  } else {
    user = {
      ...user,
      name: user.name || input.name?.trim() || null,
      passwordHash: hashPassword(input.password),
      leagueOperator: true,
      leagueOperatorLinkedAt: now,
    };
  }
  return saveAppUser(user);
}

export async function writeAppSession(userId: string): Promise<void> {
  const jar = await cookies();
  const session: AppSession = {
    userId,
    expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000,
  };
  jar.set(APP_SESSION_COOKIE, signSession(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearAppSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(APP_SESSION_COOKIE);
}

export async function readAppSession(): Promise<AppSession | null> {
  const jar = await cookies();
  const raw = jar.get(APP_SESSION_COOKIE)?.value;
  if (!raw) return null;
  return readSignedSession(raw);
}

export async function requireAppUser(): Promise<AppUser> {
  const session = await readAppSession();
  if (!session) throw new Error("Sign in required.");
  const user = await getAppUser(session.userId);
  if (!user) {
    await clearAppSession();
    throw new Error("Sign in required.");
  }
  return user;
}

/**
 * Prefer the Tableside app session; if missing, bridge a live Fargo scoring
 * cookie into an app user (same path as GET /api/auth/session).
 */
export async function requireAppUserOrBridge(): Promise<AppUser> {
  try {
    return await requireAppUser();
  } catch {
    /* try scoring bridge below */
  }

  const { readScoringSession } = await import("@/lib/scoring-auth");
  const scoring = await readScoringSession();
  if (!scoring) throw new Error("Sign in required.");

  const user = await upsertAppUserFromFargo(scoring, {
    emailFallback: scoring.email ?? undefined,
  });
  await writeAppSession(user.id);
  return user;
}

export function toPublicAuthUser(
  user: AppUser,
  scoringReady: boolean,
): PublicAuthUser {
  const stripe = user.stripe ?? null;
  return {
    id: user.id,
    email: user.email,
    name: user.name || user.fargo?.name || null,
    lmsId: user.fargo?.lmsId ?? "",
    readableId: user.fargo?.readableId ?? null,
    fargoLinked: Boolean(user.fargo?.lmsId),
    digitalPoolLinked: Boolean(user.digitalPool?.uid),
    stripeLinked: Boolean(stripe?.accountId),
    stripeChargesEnabled: Boolean(stripe?.chargesEnabled),
    scoringReady,
    leagueOperator: Boolean(user.leagueOperator),
  };
}

/** Legacy Fargo-only session → public user (no app account yet). */
export function publicUserFromScoring(
  scoring: ScoringSession,
): PublicAuthUser {
  return {
    id: `fargo:${scoring.lmsId}`,
    email: scoring.email,
    name: scoring.name,
    lmsId: scoring.lmsId,
    readableId: scoring.readableId,
    fargoLinked: true,
    digitalPoolLinked: false,
    stripeLinked: false,
    stripeChargesEnabled: false,
    scoringReady: true,
    leagueOperator: false,
  };
}
