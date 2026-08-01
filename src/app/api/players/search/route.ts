import { NextRequest, NextResponse } from "next/server";
import { searchFairMatchPlayers } from "@/lib/fairmatch";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json(
      { error: "Query must be at least 2 characters.", players: [] },
      { status: 400 },
    );
  }

  try {
    const players = await searchFairMatchPlayers(q);
    return NextResponse.json({ players, query: q });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to search FairMatch players.", players: [] },
      { status: 502 },
    );
  }
}
