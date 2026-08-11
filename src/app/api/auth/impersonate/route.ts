import { NextRequest, NextResponse } from "next/server";
import { requireAppUser, toPublicAuthUser } from "@/lib/app-auth";
import {
  actorFromAppUser,
  clearImpersonation,
  isSuperadminAppUser,
  readImpersonation,
  writeImpersonation,
} from "@/lib/impersonation";
import { readScoringSession, requireScoringSession } from "@/lib/scoring-auth";

export const dynamic = "force-dynamic";

async function publicSessionForActor() {
  const actor = await requireAppUser();
  if (!isSuperadminAppUser(actor)) {
    throw new Error("View-as is only available to the superadmin.");
  }

  let scoring = await readScoringSession();
  if (scoring) {
    try {
      scoring = await requireScoringSession();
    } catch {
      scoring = null;
    }
  }

  const scoringReady = Boolean(
    scoring && actor.fargo?.lmsId && scoring.lmsId === actor.fargo.lmsId,
  );
  const impersonation = await readImpersonation();
  const validImpersonation =
    impersonation && impersonation.actorUserId === actor.id
      ? impersonation
      : null;

  if (impersonation && !validImpersonation) {
    await clearImpersonation();
  }

  const base = toPublicAuthUser(actor, scoringReady);
  if (!validImpersonation) {
    return {
      ...base,
      canImpersonate: true,
      impersonating: false,
      actor: null,
    };
  }

  return {
    ...base,
    // Effective identity = target player (membership / Score list use lmsId).
    lmsId: validImpersonation.targetLmsId,
    name: validImpersonation.targetName || base.name,
    email: validImpersonation.targetEmail,
    readableId: validImpersonation.targetReadableId,
    fargoLinked: true,
    // Keep Bright's scoring cookie so shared drafts still sync; LMS submit is blocked.
    scoringReady,
    canImpersonate: false,
    impersonating: true,
    actor: actorFromAppUser(actor),
  };
}

/** Start viewing the app as another LMS player (Bright only). */
export async function POST(request: NextRequest) {
  try {
    const actor = await requireAppUser();
    if (!isSuperadminAppUser(actor)) {
      return NextResponse.json(
        { error: "View-as is only available to the superadmin." },
        { status: 403 },
      );
    }

    const body = (await request.json().catch(() => null)) as {
      lmsId?: string;
      name?: string | null;
      email?: string | null;
      readableId?: string | null;
    } | null;

    const targetLmsId = body?.lmsId?.trim() ?? "";
    if (!targetLmsId) {
      return NextResponse.json(
        { error: "Player LMS id is required." },
        { status: 400 },
      );
    }

    if (
      actor.fargo?.lmsId &&
      targetLmsId.toLowerCase() === actor.fargo.lmsId.toLowerCase()
    ) {
      return NextResponse.json(
        { error: "You are already signed in as that player." },
        { status: 400 },
      );
    }

    await writeImpersonation({
      actorUserId: actor.id,
      targetLmsId,
      targetName: body?.name?.trim() || null,
      targetEmail: body?.email?.trim() || null,
      targetReadableId: body?.readableId?.trim() || null,
    });

    return NextResponse.json({ user: await publicSessionForActor() });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not start view-as.";
    const status = message.includes("Sign in") ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

/** Stop viewing as another player. */
export async function DELETE() {
  try {
    const actor = await requireAppUser();
    if (!isSuperadminAppUser(actor)) {
      return NextResponse.json(
        { error: "View-as is only available to the superadmin." },
        { status: 403 },
      );
    }
    await clearImpersonation();
    return NextResponse.json({ user: await publicSessionForActor() });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not stop view-as.";
    const status = message.includes("Sign in") ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
