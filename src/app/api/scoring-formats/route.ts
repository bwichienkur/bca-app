import { NextRequest, NextResponse } from "next/server";
import {
  operatorErrorResponse,
  requireOperatorApi,
} from "@/lib/lms-operator-api";
import type { LeagueScoringFormat } from "@/lib/scoring-formats";
import {
  deleteScoringFormat,
  listScoringFormatItemsForLeague,
  scoringFormatsStoreMode,
  upsertScoringFormat,
} from "@/lib/scoring-formats-store";

export const dynamic = "force-dynamic";

/** Public read — Score / Settings / Night Format need the merged catalog. */
export async function GET(request: NextRequest) {
  try {
    const leagueId = request.nextUrl.searchParams.get("leagueId")?.trim();
    if (!leagueId) {
      return NextResponse.json(
        { error: "leagueId is required.", formats: [] },
        { status: 400 },
      );
    }
    const formats = await listScoringFormatItemsForLeague(leagueId);
    return NextResponse.json({
      formats,
      storeMode: scoringFormatsStoreMode(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load scoring formats.",
        formats: [],
      },
      { status: 500 },
    );
  }
}

/** Create or update a league custom format / built-in override. */
export async function PUT(request: NextRequest) {
  try {
    const caller = await requireOperatorApi();
    const body = (await request.json()) as {
      leagueId?: string;
      format?: Partial<LeagueScoringFormat> & { id?: string | null };
    };
    const leagueId = body.leagueId?.trim();
    if (!leagueId) {
      return NextResponse.json(
        { error: "leagueId is required." },
        { status: 400 },
      );
    }
    if (!body.format || typeof body.format !== "object") {
      return NextResponse.json(
        { error: "format is required." },
        { status: 400 },
      );
    }

    const format = await upsertScoringFormat({
      leagueId,
      format: body.format,
    });
    const formats = await listScoringFormatItemsForLeague(leagueId);
    return NextResponse.json({
      format,
      formats,
      updatedBy: caller.name ?? caller.email ?? null,
      storeMode: scoringFormatsStoreMode(),
    });
  } catch (error) {
    return operatorErrorResponse(error);
  }
}

/** Delete a custom format, or reset a built-in override. */
export async function DELETE(request: NextRequest) {
  try {
    await requireOperatorApi();
    const leagueId = request.nextUrl.searchParams.get("leagueId")?.trim();
    const formatId = request.nextUrl.searchParams.get("formatId")?.trim();
    if (!leagueId || !formatId) {
      return NextResponse.json(
        { error: "leagueId and formatId are required." },
        { status: 400 },
      );
    }
    const result = await deleteScoringFormat({ leagueId, formatId });
    const formats = await listScoringFormatItemsForLeague(leagueId);
    return NextResponse.json({
      ...result,
      formats,
      storeMode: scoringFormatsStoreMode(),
    });
  } catch (error) {
    return operatorErrorResponse(error);
  }
}
