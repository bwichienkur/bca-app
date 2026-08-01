import { NextResponse } from "next/server";
import { clearScoringSession } from "@/lib/scoring-auth";

export const dynamic = "force-dynamic";

export async function POST() {
  await clearScoringSession();
  return NextResponse.json({ ok: true });
}
