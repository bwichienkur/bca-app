import { NextRequest, NextResponse } from "next/server";
import {
  toPublicAuthUser,
  upsertAppUserFromLeagueOperator,
  writeAppSession,
} from "@/lib/app-auth";
import { loginLeagueOperatorWithCredentials } from "@/lib/lms-operator";
import { readScoringSession } from "@/lib/scoring-auth";

export const dynamic = "force-dynamic";

/** Sign in with LMS League Operator web credentials (not FargoRate player auth). */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      email?: string;
      password?: string;
    };
    const email = body.email?.trim() ?? "";
    const password = body.password ?? "";
    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required." },
        { status: 400 },
      );
    }

    await loginLeagueOperatorWithCredentials(email, password);
    const user = await upsertAppUserFromLeagueOperator({ email, password });
    await writeAppSession(user.id);

    const scoring = await readScoringSession();
    const scoringReady = Boolean(
      scoring && user.fargo?.lmsId && scoring.lmsId === user.fargo.lmsId,
    );

    return NextResponse.json({
      user: toPublicAuthUser(user, scoringReady),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "League operator login failed.";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
