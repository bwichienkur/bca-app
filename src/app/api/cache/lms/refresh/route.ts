import { NextResponse } from "next/server";
import { invalidateLmsCaches } from "@/lib/lms-cache";
import { clearLmsMemoryCaches } from "@/lib/lms";

export const dynamic = "force-dynamic";

/** POST — clear LMS Redis + in-memory caches so the next reads hit FargoRate. */
export async function POST() {
  try {
    clearLmsMemoryCaches();
    const result = await invalidateLmsCaches();
    return NextResponse.json({
      ok: true,
      shared: result.shared,
      deleted: result.deleted,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to refresh LMS cache." },
      { status: 502 },
    );
  }
}
