import { NextRequest, NextResponse } from "next/server";
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

    return NextResponse.json({
      user: {
        lmsId: session.lmsId,
        readableId: session.readableId,
        name: session.name,
        email: session.email,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Login failed.";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
