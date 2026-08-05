import { NextResponse } from "next/server";
import { clearAppSession } from "@/lib/app-auth";
import { clearScoringSession } from "@/lib/scoring-auth";

export const dynamic = "force-dynamic";

export async function POST() {
  await clearAppSession();
  await clearScoringSession();
  return NextResponse.json({ ok: true });
}
