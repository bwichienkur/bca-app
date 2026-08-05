import { NextRequest, NextResponse } from "next/server";
import {
  authenticateAppUser,
  toPublicAuthUser,
  writeAppSession,
} from "@/lib/app-auth";
import { readScoringSession } from "@/lib/scoring-auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      email?: string;
      password?: string;
    };
    const email = (body.email ?? "").trim();
    const password = body.password ?? "";
    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required." },
        { status: 400 },
      );
    }

    const user = await authenticateAppUser(email, password);
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
      error instanceof Error ? error.message : "Login failed.";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
