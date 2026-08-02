import { NextRequest, NextResponse } from "next/server";
import { fetchFargoPlayerMatches } from "@/lib/fargo-player";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ playerId: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const { playerId: rawId } = await context.params;
  const playerId = decodeURIComponent(rawId ?? "").trim();
  if (!playerId) {
    return NextResponse.json({ error: "Player id is required." }, { status: 400 });
  }

  const page = Number(request.nextUrl.searchParams.get("page") ?? "1");
  const limit = Number(request.nextUrl.searchParams.get("limit") ?? "25");

  try {
    const result = await fetchFargoPlayerMatches(playerId, {
      page: Number.isFinite(page) ? page : 1,
      limit: Number.isFinite(limit) ? limit : 25,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to load match history." },
      { status: 502 },
    );
  }
}
