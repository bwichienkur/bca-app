import { NextRequest, NextResponse } from "next/server";
import { fetchAllDivisions, groupLeagues } from "@/lib/lms";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const q = (request.nextUrl.searchParams.get("q") ?? "").trim().toLowerCase();
    const entries = await fetchAllDivisions();
    let leagues = groupLeagues(entries);

    if (q) {
      leagues = leagues.filter(
        (league) =>
          league.name.toLowerCase().includes(q) ||
          league.state.toLowerCase().includes(q),
      );
    }

    return NextResponse.json({ leagues, total: leagues.length });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to load leagues from FargoRate LMS." },
      { status: 502 },
    );
  }
}
