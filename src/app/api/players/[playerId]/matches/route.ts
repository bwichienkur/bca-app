import { NextRequest, NextResponse } from "next/server";
import {
  fetchFargoPlayerMatches,
  prefetchOpponentRatings,
} from "@/lib/fargo-player";

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

  const params = request.nextUrl.searchParams;

  if (params.get("prefetch") === "1") {
    try {
      const result = await prefetchOpponentRatings(playerId);
      return NextResponse.json({ ok: true, ...result });
    } catch (error) {
      console.error(error);
      return NextResponse.json(
        { error: "Failed to prefetch opponent ratings." },
        { status: 502 },
      );
    }
  }

  const page = Number(params.get("page") ?? "1");
  const limit = Number(params.get("limit") ?? "20");
  const q = params.get("q") ?? "";
  const bucketRaw = params.get("bucket");
  const bucket =
    bucketRaw != null && bucketRaw !== "" ? Number(bucketRaw) : null;

  try {
    const result = await fetchFargoPlayerMatches(playerId, {
      page: Number.isFinite(page) ? page : 1,
      limit: Number.isFinite(limit) ? limit : 20,
      q,
      bucket: bucket != null && Number.isFinite(bucket) ? bucket : null,
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
