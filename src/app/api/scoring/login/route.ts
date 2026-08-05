import { NextRequest, NextResponse } from "next/server";
import {
  toPublicAuthUser,
  upsertAppUserFromFargo,
  writeAppSession,
} from "@/lib/app-auth";
import {
  loginWithPassword,
  writeScoringSession,
} from "@/lib/scoring-auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      email?: string;
      username?: string;
      password?: string;
    };
    const username = (body.email ?? body.username ?? "").trim();
    const password = body.password ?? "";
    if (!username || !password) {
      return NextResponse.json(
        { error: "Email and password are required." },
        { status: 400 },
      );
    }

    const session = await loginWithPassword(username, password);
    await writeScoringSession(session);

    // Fargo login always creates or updates the Tableside account.
    const appUser = await upsertAppUserFromFargo(session, {
      password,
      emailFallback: username,
    });
    await writeAppSession(appUser.id);

    return NextResponse.json({
      user: toPublicAuthUser(appUser, true),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Login failed.";
    const status =
      message.includes("Tableside") || message.includes("email was returned")
        ? 400
        : 401;
    return NextResponse.json({ error: message }, { status });
  }
}
