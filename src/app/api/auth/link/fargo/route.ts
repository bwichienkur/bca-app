import { NextRequest, NextResponse } from "next/server";
import {
  requireAppUser,
  saveAppUser,
  toPublicAuthUser,
} from "@/lib/app-auth";
import {
  loginWithPassword,
  writeScoringSession,
} from "@/lib/scoring-auth";

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
        { error: "Fargo email and password are required." },
        { status: 400 },
      );
    }

    const scoring = await loginWithPassword(email, password);
    await writeScoringSession(scoring);

    const updated = await saveAppUser({
      ...appUser,
      name: appUser.name || scoring.name,
      fargo: {
        lmsId: scoring.lmsId,
        fargoRateId: scoring.fargoRateId,
        readableId: scoring.readableId,
        email: scoring.email,
        name: scoring.name,
        linkedAt: new Date().toISOString(),
      },
    });

    return NextResponse.json({
      user: toPublicAuthUser(updated, true),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not link Fargo.";
    const status = message.includes("Sign in") ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
