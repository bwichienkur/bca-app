import { NextRequest, NextResponse } from "next/server";
import {
  requireAppUser,
  saveAppUser,
  toPublicAuthUser,
} from "@/lib/app-auth";
import { loginDigitalPool } from "@/lib/digital-pool";
import { readScoringSession } from "@/lib/scoring-auth";

export const dynamic = "force-dynamic";

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
        { error: "Digital Pool email and password are required." },
        { status: 400 },
      );
    }

    const { auth, profile } = await loginDigitalPool(email, password);
    const name =
      [profile.firstName, profile.lastName].filter(Boolean).join(" ").trim() ||
      auth.displayName;

    const updated = await saveAppUser({
      ...appUser,
      digitalPool: {
        uid: profile.uid,
        userId: profile.id,
        email: profile.email,
        name,
        refreshToken: auth.refreshToken,
        idToken: auth.idToken,
        idTokenExpiresAt: auth.expiresAt,
        linkedAt: new Date().toISOString(),
      },
    });

    const scoring = await readScoringSession();
    const scoringReady = Boolean(
      scoring &&
        updated.fargo?.lmsId &&
        scoring.lmsId === updated.fargo.lmsId,
    );

    return NextResponse.json({
      user: toPublicAuthUser(updated, scoringReady),
      digitalPool: {
        userId: profile.id,
        email: profile.email,
        name,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Could not link Digital Pool.";
    const status = message.includes("Sign in") ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
