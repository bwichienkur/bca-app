import { NextResponse } from "next/server";
import {
  clearScoringSession,
  readScoringSession,
  requireScoringSession,
} from "@/lib/scoring-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const existing = await readScoringSession();
    if (!existing) {
      return NextResponse.json({ user: null });
    }
    const session = await requireScoringSession();
    return NextResponse.json({
      user: {
        lmsId: session.lmsId,
        readableId: session.readableId,
        name: session.name,
        email: session.email,
      },
    });
  } catch {
    await clearScoringSession();
    return NextResponse.json({ user: null });
  }
}
