import { NextRequest, NextResponse } from "next/server";
import {
  fetchFargoOpponentRecords,
  type OpponentSort,
} from "@/lib/fargo-player";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ playerId: string }>;
};

const SORTS = new Set<OpponentSort>([
  "wins",
  "losses",
  "played",
  "winpct",
  "name",
]);

export async function GET(request: NextRequest, context: RouteContext) {
  const { playerId: rawId } = await context.params;
  const playerId = decodeURIComponent(rawId ?? "").trim();
  if (!playerId) {
    return NextResponse.json({ error: "Player id is required." }, { status: 400 });
  }

  const params = request.nextUrl.searchParams;
  const page = Number(params.get("page") ?? "1");
  const limit = Number(params.get("limit") ?? "20");
  const q = params.get("q") ?? "";
  const sortRaw = params.get("sort")?.trim() ?? "wins";
  const sort = SORTS.has(sortRaw as OpponentSort)
    ? (sortRaw as OpponentSort)
    : "wins";

  try {
    const result = await fetchFargoOpponentRecords(playerId, {
      page: Number.isFinite(page) ? page : 1,
      limit: Number.isFinite(limit) ? limit : 20,
      q,
      sort,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to load opponent records." },
      { status: 502 },
    );
  }
}
