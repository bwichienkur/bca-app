import { NextResponse } from "next/server";
import {
  getAppUser,
  publicUserFromScoring,
  readAppSession,
  toPublicAuthUser,
} from "@/lib/app-auth";
import {
  canAccessLmsFromAppUser,
  canAccessLmsFromPublicUserServer,
} from "@/lib/lms-access-server";
import { isOperatorConfigured } from "@/lib/lms-operator";
import { readScoringSession } from "@/lib/scoring-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const configured = isOperatorConfigured();
    const appSession = await readAppSession();
    const scoring = await readScoringSession();

    let allowed = false;
    if (appSession) {
      const user = await getAppUser(appSession.userId);
      if (user) {
        allowed = canAccessLmsFromAppUser(user);
        const scoringReady = Boolean(
          scoring &&
            user.fargo?.lmsId &&
            scoring.lmsId === user.fargo.lmsId,
        );
        return NextResponse.json({
          configured,
          allowed,
          user: toPublicAuthUser(user, scoringReady),
        });
      }
    }

    if (scoring) {
      const user = publicUserFromScoring(scoring);
      allowed = canAccessLmsFromPublicUserServer(user);
      return NextResponse.json({ configured, allowed, user });
    }

    return NextResponse.json({
      configured,
      allowed: false,
      user: null,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Not signed in.";
    return NextResponse.json(
      { error: message, configured: false, allowed: false },
      { status: 500 },
    );
  }
}
