import { NextResponse } from "next/server";
import {
  clearAppSession,
  getAppUser,
  publicUserFromScoring,
  readAppSession,
  toPublicAuthUser,
  upsertAppUserFromFargo,
  writeAppSession,
} from "@/lib/app-auth";
import {
  clearScoringSession,
  readScoringSession,
  requireScoringSession,
} from "@/lib/scoring-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const appSession = await readAppSession();
    let scoring = await readScoringSession();
    if (scoring) {
      try {
        scoring = await requireScoringSession();
      } catch {
        await clearScoringSession();
        scoring = null;
      }
    }

    if (appSession) {
      const user = await getAppUser(appSession.userId);
      if (!user) {
        await clearAppSession();
      } else {
        const scoringReady = Boolean(
          scoring &&
            user.fargo?.lmsId &&
            scoring.lmsId === user.fargo.lmsId,
        );
        return NextResponse.json({
          user: toPublicAuthUser(user, scoringReady),
        });
      }
    }

    // Legacy bridge: Fargo scoring cookie only → create/link Tableside account.
    if (scoring) {
      try {
        const user = await upsertAppUserFromFargo(scoring, {
          emailFallback: scoring.email ?? undefined,
        });
        await writeAppSession(user.id);
        return NextResponse.json({
          user: toPublicAuthUser(user, true),
        });
      } catch {
        return NextResponse.json({
          user: publicUserFromScoring(scoring),
        });
      }
    }

    return NextResponse.json({ user: null });
  } catch {
    return NextResponse.json({ user: null });
  }
}
