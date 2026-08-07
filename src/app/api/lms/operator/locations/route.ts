import { NextRequest, NextResponse } from "next/server";
import {
  operatorErrorResponse,
  requireOperatorApi,
} from "@/lib/lms-operator-api";
import {
  operatorCreateLocation,
  operatorDeleteLocation,
  operatorListLocations,
  operatorUpdateLocation,
  withOperatorSession,
  type LocationInput,
  type OperatorLocation,
} from "@/lib/lms-operator-manage";
import {
  invalidateOperatorCache,
  operatorCacheKey,
  withOperatorCache,
} from "@/lib/lms-operator-cache";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireOperatorApi();
    const divisionId = request.nextUrl.searchParams.get("divisionId")?.trim();
    if (!divisionId) {
      return NextResponse.json(
        { error: "divisionId is required." },
        { status: 400 },
      );
    }
    const refresh = request.nextUrl.searchParams.get("refresh") === "1";
    const locations = await withOperatorCache(
      operatorCacheKey("locations", divisionId),
      () =>
        withOperatorSession((session) =>
          operatorListLocations(session, divisionId),
        ),
      { bypass: refresh },
    );
    return NextResponse.json({ locations });
  } catch (error) {
    return operatorErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireOperatorApi();
    const body = (await request.json()) as {
      divisionId?: string;
      location?: LocationInput;
    };
    if (!body.divisionId?.trim() || !body.location?.name?.trim()) {
      return NextResponse.json(
        { error: "divisionId and location.name are required." },
        { status: 400 },
      );
    }
    const location = await withOperatorSession((session) =>
      operatorCreateLocation(session, body.divisionId!.trim(), body.location!),
    );
    await invalidateOperatorCache({ divisionId: body.divisionId!.trim() });
    return NextResponse.json({ ok: true, location });
  } catch (error) {
    return operatorErrorResponse(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    await requireOperatorApi();
    const body = (await request.json()) as { location?: OperatorLocation };
    if (!body.location?.id || !body.location.name?.trim()) {
      return NextResponse.json(
        { error: "location.id and location.name are required." },
        { status: 400 },
      );
    }
    const location = await withOperatorSession((session) =>
      operatorUpdateLocation(session, body.location!),
    );
    await invalidateOperatorCache({ divisionId: body.location.divisionId });
    return NextResponse.json({ ok: true, location });
  } catch (error) {
    return operatorErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireOperatorApi();
    const locationId =
      request.nextUrl.searchParams.get("locationId")?.trim() ||
      ((await request.json().catch(() => null)) as { locationId?: string } | null)
        ?.locationId;
    if (!locationId) {
      return NextResponse.json(
        { error: "locationId is required." },
        { status: 400 },
      );
    }
    await withOperatorSession((session) =>
      operatorDeleteLocation(session, locationId),
    );
    const divisionId = request.nextUrl.searchParams.get("divisionId")?.trim();
    await invalidateOperatorCache({ divisionId: divisionId || null });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return operatorErrorResponse(error);
  }
}
