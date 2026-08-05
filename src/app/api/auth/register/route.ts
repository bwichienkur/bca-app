import { NextRequest, NextResponse } from "next/server";
import {
  registerAppUser,
  toPublicAuthUser,
  writeAppSession,
} from "@/lib/app-auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      email?: string;
      password?: string;
      name?: string;
    };
    const email = (body.email ?? "").trim();
    const password = body.password ?? "";
    const name = body.name?.trim() || null;
    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required." },
        { status: 400 },
      );
    }

    const user = await registerAppUser({ email, password, name });
    await writeAppSession(user.id);

    return NextResponse.json(
      {
        user: toPublicAuthUser(user, false),
      },
      { status: 201 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not create account.";
    const status = message.includes("already exists") ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
