import { NextRequest, NextResponse } from "next/server";
import { divisionsForLeague, fetchAllDivisions } from "@/lib/lms";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ leagueId: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { leagueId } = await params;
    const entries = await fetchAllDivisions();
    const divisions = divisionsForLeague(entries, leagueId);

    if (!divisions.length) {
      return NextResponse.json(
        { error: "League not found or has no public divisions." },
        { status: 404 },
      );
    }

    return NextResponse.json({
      leagueId,
      leagueName: divisions[0].leagueName,
      state: divisions[0].state,
      divisions,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to load divisions from FargoRate LMS." },
      { status: 502 },
    );
  }
}
