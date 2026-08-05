import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * @deprecated Prefer GET /api/auth/session — kept as a thin alias for older clients.
 */
export async function GET() {
  const { GET: authSession } = await import("@/app/api/auth/session/route");
  return authSession();
}
