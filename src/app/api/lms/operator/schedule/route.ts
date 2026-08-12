import { NextRequest, NextResponse } from "next/server";
import {
  operatorErrorResponse,
  requireOperatorApi,
} from "@/lib/lms-operator-api";
import {
  operatorChangeMatch,
  operatorClearSchedule,
  operatorCreateMatch,
  operatorDeleteMatch,
  operatorFlipMatch,
  operatorListSchedule,
  operatorRegenerateSchedule,
  withOperatorSession,
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
    const matches = await withOperatorCache(
      operatorCacheKey("schedule", divisionId),
      () =>
        withOperatorSession((session) =>
          operatorListSchedule(session, divisionId),
        ),
      { bypass: refresh },
    );
    return NextResponse.json({ matches });
  } catch (error) {
    return operatorErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireOperatorApi();
    const body = (await request.json()) as {
      action?: string;
      divisionId?: string;
      startDate?: string;
      numberOfRounds?: number;
      numberOfWeeks?: number;
      matchId?: string;
      teamOneId?: string;
      teamTwoId?: string;
      date?: string;
      locationId?: string;
    };
    const action = body.action ?? "list";

    if (action === "generate") {
      const modeRaw = String(
        (body as { mode?: string }).mode ?? "",
      ).toLowerCase();
      // LMS accepts weeks XOR rounds (the other must be 0). Prefer explicit mode;
      // fall back to whichever positive count was provided.
      const weeks = Number(body.numberOfWeeks);
      const rounds = Number(body.numberOfRounds);
      const mode =
        modeRaw === "weeks" || modeRaw === "rounds"
          ? (modeRaw as "weeks" | "rounds")
          : weeks > 0 && !(rounds > 0)
            ? "weeks"
            : rounds > 0 && !(weeks > 0)
              ? "rounds"
              : null;
      const count = mode === "weeks" ? weeks : mode === "rounds" ? rounds : NaN;
      if (!body.divisionId || !body.startDate || !mode || !(count > 0)) {
        return NextResponse.json(
          {
            error:
              "divisionId, startDate, and either numberOfWeeks or numberOfRounds (not both) are required.",
          },
          { status: 400 },
        );
      }
      const result = await withOperatorSession((session) =>
        operatorRegenerateSchedule(session, {
          divisionId: body.divisionId!,
          startDate: body.startDate!,
          mode,
          count,
        }),
      );
      await invalidateOperatorCache({ divisionId: body.divisionId ?? null });
      return NextResponse.json({ ok: true, ...result });
    }

    if (action === "clear") {
      if (!body.divisionId) {
        return NextResponse.json(
          { error: "divisionId is required." },
          { status: 400 },
        );
      }
      await withOperatorSession((session) =>
        operatorClearSchedule(session, body.divisionId!),
      );
      await invalidateOperatorCache({ divisionId: body.divisionId ?? null });
      return NextResponse.json({ ok: true });
    }

    if (action === "create") {
      if (
        !body.divisionId ||
        !body.teamOneId ||
        !body.teamTwoId ||
        !body.date ||
        !body.locationId
      ) {
        return NextResponse.json(
          {
            error:
              "divisionId, teamOneId, teamTwoId, date, and locationId are required.",
          },
          { status: 400 },
        );
      }
      await withOperatorSession((session) =>
        operatorCreateMatch(session, {
          divisionId: body.divisionId!,
          teamOneId: body.teamOneId!,
          teamTwoId: body.teamTwoId!,
          date: body.date!,
          locationId: body.locationId!,
        }),
      );
      await invalidateOperatorCache({ divisionId: body.divisionId ?? null });
      return NextResponse.json({ ok: true });
    }

    if (action === "change") {
      if (
        !body.matchId ||
        !body.teamOneId ||
        !body.teamTwoId ||
        !body.date ||
        !body.locationId
      ) {
        return NextResponse.json(
          {
            error:
              "matchId, teamOneId, teamTwoId, date, and locationId are required.",
          },
          { status: 400 },
        );
      }
      await withOperatorSession((session) =>
        operatorChangeMatch(session, {
          matchId: body.matchId!,
          teamOneId: body.teamOneId!,
          teamTwoId: body.teamTwoId!,
          date: body.date!,
          locationId: body.locationId!,
        }),
      );
      await invalidateOperatorCache({ divisionId: body.divisionId ?? null });
      return NextResponse.json({ ok: true });
    }

    if (action === "delete") {
      if (!body.matchId) {
        return NextResponse.json(
          { error: "matchId is required." },
          { status: 400 },
        );
      }
      await withOperatorSession((session) =>
        operatorDeleteMatch(session, body.matchId!),
      );
      await invalidateOperatorCache({ divisionId: body.divisionId ?? null });
      return NextResponse.json({ ok: true });
    }

    if (action === "flip") {
      if (!body.matchId) {
        return NextResponse.json(
          { error: "matchId is required." },
          { status: 400 },
        );
      }
      await withOperatorSession((session) =>
        operatorFlipMatch(session, body.matchId!),
      );
      await invalidateOperatorCache({ divisionId: body.divisionId ?? null });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    return operatorErrorResponse(error);
  }
}
