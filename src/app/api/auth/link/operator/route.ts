import { NextRequest, NextResponse } from "next/server";
import {
  requireAppUser,
  saveAppUser,
  toPublicAuthUser,
} from "@/lib/app-auth";
import { loginLeagueOperatorWithCredentials } from "@/lib/lms-operator";
import { readScoringSession } from "@/lib/scoring-auth";

export const dynamic = "force-dynamic";

/**
 * Link LMS League Operator web credentials to the signed-in Tableside account.
 * Separate from FargoRate player Auth0 login.
 */
export async function POST(request: NextRequest) {
  try {
    const appUser = await requireAppUser();
    const body = (await request.json()) as {
      email?: string;
      password?: string;
    };
    const email = (body.email ?? "").trim();
    const password = body.password ?? "";
    if (!email || !password) {
      return NextResponse.json(
        { error: "League operator email and password are required." },
        { status: 400 },
      );
    }

    await loginLeagueOperatorWithCredentials(email, password);
    const now = new Date().toISOString();
    const updated = await saveAppUser({
      ...appUser,
      leagueOperator: true,
      leagueOperatorLinkedAt: now,
    });

    const scoring = await readScoringSession();
    const scoringReady = Boolean(
      scoring &&
        updated.fargo?.lmsId &&
        scoring.lmsId === updated.fargo.lmsId,
    );

    return NextResponse.json({
      user: toPublicAuthUser(updated, scoringReady),
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Could not link league operator account.";
    const status = message.includes("Sign in") ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
