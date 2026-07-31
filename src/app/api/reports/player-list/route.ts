import { NextRequest, NextResponse } from "next/server";
import { fetchPlayerList } from "@/lib/lms";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const divisionId = request.nextUrl.searchParams.get("divisionId");
  if (!divisionId) {
    return NextResponse.json({ error: "divisionId is required" }, { status: 400 });
  }

  try {
    const report = await fetchPlayerList(divisionId);
    return NextResponse.json(report);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to load player list." },
      { status: 502 },
    );
  }
}
