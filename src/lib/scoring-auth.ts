import { cookies } from "next/headers";
import { LMS_BASE } from "./constants";

export const AUTH0_DOMAIN =
  process.env.AUTH0_DOMAIN ?? "https://fargorate.auth0.com";
export const AUTH0_AUDIENCE =
  process.env.AUTH0_AUDIENCE ?? "https://auth.fargorate.com";
/** Public client id embedded in the official BCAPL scoring app. */
export const AUTH0_CLIENT_ID =
  process.env.AUTH0_CLIENT_ID ?? "rwiVBUErujgLFo4OgPrEuw0WPo4saSQI";

export const SCORING_SESSION_COOKIE = "tableside.scoring.session";

export type ScoringSession = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  lmsId: string;
  fargoRateId: string | null;
  readableId: string | null;
  email: string | null;
  name: string | null;
};

type Auth0TokenResponse = {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in: number;
  token_type: string;
};

function decodeJwtPayload(token: string): Record<string, unknown> {
  const part = token.split(".")[1];
  if (!part) return {};
  const padded = part + "=".repeat((4 - (part.length % 4)) % 4);
  const json = Buffer.from(padded, "base64url").toString("utf8");
  return JSON.parse(json) as Record<string, unknown>;
}

function clientSecret(): string {
  const secret = process.env.AUTH0_CLIENT_SECRET;
  if (!secret) {
    throw new Error(
      "AUTH0_CLIENT_SECRET is not configured on the server.",
    );
  }
  return secret;
}

export async function loginWithPassword(
  username: string,
  password: string,
): Promise<ScoringSession> {
  const body = new URLSearchParams({
    grant_type: "password",
    username,
    password,
    audience: AUTH0_AUDIENCE,
    scope: "openid profile email offline_access",
    client_id: AUTH0_CLIENT_ID,
    client_secret: clientSecret(),
  });

  const response = await fetch(`${AUTH0_DOMAIN}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });

  if (!response.ok) {
    const err = (await response.json().catch(() => null)) as {
      error_description?: string;
      error?: string;
    } | null;
    throw new Error(
      err?.error_description || err?.error || "Login failed.",
    );
  }

  const tokens = (await response.json()) as Auth0TokenResponse;
  return sessionFromTokens(tokens);
}

export async function refreshSession(
  refreshToken: string,
): Promise<ScoringSession> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: AUTH0_CLIENT_ID,
    client_secret: clientSecret(),
    refresh_token: refreshToken,
  });

  const response = await fetch(`${AUTH0_DOMAIN}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Session expired. Please sign in again.");
  }

  const tokens = (await response.json()) as Auth0TokenResponse;
  return sessionFromTokens({
    ...tokens,
    refresh_token: tokens.refresh_token ?? refreshToken,
  });
}

function sessionFromTokens(tokens: Auth0TokenResponse): ScoringSession {
  const accessClaims = decodeJwtPayload(tokens.access_token);
  const idClaims = tokens.id_token
    ? decodeJwtPayload(tokens.id_token)
    : {};

  const lmsId = String(
    accessClaims["https://auth.fargorate.com/lmsId"] ?? "",
  );
  if (!lmsId) {
    throw new Error("Login succeeded but no LMS player id was returned.");
  }

  const given = idClaims.given_name ? String(idClaims.given_name) : "";
  const family = idClaims.family_name ? String(idClaims.family_name) : "";
  const name =
    [given, family].filter(Boolean).join(" ") ||
    (idClaims.name ? String(idClaims.name) : null);

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + tokens.expires_in * 1000,
    lmsId,
    fargoRateId: accessClaims["https://auth.fargorate.com/fargorateId"]
      ? String(accessClaims["https://auth.fargorate.com/fargorateId"])
      : null,
    readableId: accessClaims["https://auth.fargorate.com/readableId"]
      ? String(accessClaims["https://auth.fargorate.com/readableId"])
      : null,
    email: idClaims.email ? String(idClaims.email) : null,
    name,
  };
}

export async function readScoringSession(): Promise<ScoringSession | null> {
  const jar = await cookies();
  const raw = jar.get(SCORING_SESSION_COOKIE)?.value;
  if (!raw) return null;
  try {
    const session = JSON.parse(raw) as ScoringSession;
    if (!session.accessToken || !session.lmsId) return null;
    return session;
  } catch {
    return null;
  }
}

export async function writeScoringSession(
  session: ScoringSession,
): Promise<void> {
  const jar = await cookies();
  const maxAge = Math.max(
    60,
    Math.floor((session.expiresAt - Date.now()) / 1000),
  );
  jar.set(SCORING_SESSION_COOKIE, JSON.stringify(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  });
}

export async function clearScoringSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(SCORING_SESSION_COOKIE);
}

/** Return a valid session, refreshing the Auth0 token when near expiry. */
export async function requireScoringSession(): Promise<ScoringSession> {
  const session = await readScoringSession();
  if (!session) {
    throw new Error("Sign in required.");
  }

  if (session.expiresAt - Date.now() > 60_000) {
    return session;
  }

  if (!session.refreshToken) {
    throw new Error("Session expired. Please sign in again.");
  }

  const refreshed = await refreshSession(session.refreshToken);
  await writeScoringSession(refreshed);
  return refreshed;
}

export async function lmsAuthFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const session = await requireScoringSession();
  const response = await fetch(`${LMS_BASE}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${session.accessToken}`,
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  return response;
}
