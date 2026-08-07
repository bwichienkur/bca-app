import { NextResponse } from "next/server";
import { isOperatorConfigured } from "@/lib/lms-operator";
import { requireScoringSession } from "@/lib/scoring-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireScoringSession();
    return NextResponse.json({ configured: isOperatorConfigured() });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Not signed in.";
    const status = message.includes("Sign in") ? 401 : 500;
    return NextResponse.json({ error: message, configured: false }, { status });
  }
}
