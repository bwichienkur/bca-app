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
  actorFromAppUser,
  clearImpersonation,
  isSuperadminAppUser,
  readImpersonation,
} from "@/lib/impersonation";
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
        const canImpersonate = isSuperadminAppUser(user);
        const impersonation = canImpersonate
          ? await readImpersonation()
          : null;
        const validImpersonation =
          impersonation && impersonation.actorUserId === user.id
            ? impersonation
            : null;

        if (impersonation && !validImpersonation) {
          await clearImpersonation();
        }
        if (!canImpersonate && impersonation) {
          await clearImpersonation();
        }

        if (validImpersonation) {
          const base = toPublicAuthUser(user, scoringReady);
          return NextResponse.json({
            user: {
              ...base,
              lmsId: validImpersonation.targetLmsId,
              name: validImpersonation.targetName || base.name,
              email: validImpersonation.targetEmail,
              readableId: validImpersonation.targetReadableId,
              fargoLinked: true,
              scoringReady,
              canImpersonate: false,
              impersonating: true,
              actor: actorFromAppUser(user),
            },
          });
        }

        return NextResponse.json({
          user: {
            ...toPublicAuthUser(user, scoringReady),
            canImpersonate,
            impersonating: false,
            actor: null,
          },
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
        const canImpersonate = isSuperadminAppUser(user);
        return NextResponse.json({
          user: {
            ...toPublicAuthUser(user, true),
            canImpersonate,
            impersonating: false,
            actor: null,
          },
        });
      } catch {
        return NextResponse.json({
          user: {
            ...publicUserFromScoring(scoring),
            canImpersonate: false,
            impersonating: false,
            actor: null,
          },
        });
      }
    }

    return NextResponse.json({ user: null });
  } catch {
    return NextResponse.json({ user: null });
  }
}
