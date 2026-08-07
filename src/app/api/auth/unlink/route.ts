import { NextRequest, NextResponse } from "next/server";
import {
  requireAppUser,
  saveAppUser,
  toPublicAuthUser,
} from "@/lib/app-auth";
import {
  clearScoringSession,
  readScoringSession,
} from "@/lib/scoring-auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const appUser = await requireAppUser();
    const body = (await request.json()) as { provider?: string };
    const provider = body.provider;

    if (
      provider !== "fargo" &&
      provider !== "digital-pool" &&
      provider !== "operator"
    ) {
      return NextResponse.json(
        { error: "provider must be fargo, digital-pool, or operator." },
        { status: 400 },
      );
    }

    let updated = appUser;
    if (provider === "fargo") {
      updated = await saveAppUser({ ...appUser, fargo: null });
      await clearScoringSession();
    } else if (provider === "digital-pool") {
      updated = await saveAppUser({ ...appUser, digitalPool: null });
    } else {
      updated = await saveAppUser({
        ...appUser,
        leagueOperator: false,
        leagueOperatorLinkedAt: null,
      });
    }

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
      error instanceof Error ? error.message : "Could not unlink account.";
    const status = message.includes("Sign in") ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
