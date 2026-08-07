import { NextResponse } from "next/server";
import {
  getAppUser,
  publicUserFromScoring,
  readAppSession,
  toPublicAuthUser,
} from "./app-auth";
import {
  canAccessLmsFromAppUser,
  canAccessLmsFromPublicUserServer,
} from "./lms-access-server";
import { isOperatorConfigured } from "./lms-operator";
import { readScoringSession, requireScoringSession } from "./scoring-auth";

async function resolveOperatorCaller() {
  const appSession = await readAppSession();
  if (appSession) {
    const user = await getAppUser(appSession.userId);
    if (user && canAccessLmsFromAppUser(user)) {
      const scoring = await readScoringSession();
      const scoringReady = Boolean(
        scoring &&
          user.fargo?.lmsId &&
          scoring.lmsId === user.fargo.lmsId,
      );
      return toPublicAuthUser(user, scoringReady);
    }
  }

  // Legacy / Fargo-only: allow Bright (and allowlisted LMS ids) via scoring cookie.
  try {
    const scoring = await requireScoringSession();
    const publicUser = publicUserFromScoring(scoring);
    if (canAccessLmsFromPublicUserServer(publicUser)) return publicUser;
  } catch {
    // fall through
  }

  return null;
}

export async function requireOperatorApi() {
  if (!isOperatorConfigured()) {
    const error = new Error(
      "League operator is not configured. Set LMS_OPERATOR_EMAIL and LMS_OPERATOR_PASSWORD.",
    );
    (error as Error & { status: number }).status = 503;
    throw error;
  }

  const caller = await resolveOperatorCaller();
  if (!caller) {
    const error = new Error(
      "LMS tools are only available to league operators (and Bright).",
    );
    (error as Error & { status: number }).status = 403;
    throw error;
  }
  return caller;
}

export function operatorErrorResponse(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Operator request failed.";
  const status =
    (error as { status?: number }).status ??
    (message.includes("Sign in")
      ? 401
      : message.includes("only available")
        ? 403
        : message.includes("not configured")
          ? 503
          : 502);
  return NextResponse.json({ error: message }, { status });
}
