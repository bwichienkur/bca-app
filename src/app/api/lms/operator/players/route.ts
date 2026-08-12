import { NextRequest, NextResponse } from "next/server";
import {
  operatorErrorResponse,
  requireOperatorApi,
} from "@/lib/lms-operator-api";
import {
  operatorAssignPlayerById,
  operatorAssignPlayerByReadableId,
  operatorCreatePlayer,
  operatorGetPlayer,
  operatorListPlayers,
  operatorRemovePlayerFromDivision,
  operatorRemovePlayerFromTeam,
  operatorSearchPlayers,
  operatorUpdatePlayer,
  withOperatorSession,
  type PlayerInput,
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
    const params = request.nextUrl.searchParams;
    const q = params.get("q")?.trim();
    if (q) {
      const results = await withOperatorSession((session) =>
        operatorSearchPlayers(session, q),
      );
      return NextResponse.json({ results });
    }
    const playerId = params.get("playerId")?.trim();
    if (playerId) {
      const player = await withOperatorSession((session) =>
        operatorGetPlayer(session, playerId),
      );
      return NextResponse.json({ player });
    }
    const divisionId = params.get("divisionId")?.trim();
    if (!divisionId) {
      return NextResponse.json(
        { error: "divisionId, playerId, or q is required." },
        { status: 400 },
      );
    }
    const refresh = params.get("refresh") === "1";
    const players = await withOperatorCache(
      operatorCacheKey("players", divisionId),
      () =>
        withOperatorSession((session) =>
          operatorListPlayers(session, divisionId),
        ),
      { bypass: refresh },
    );
    return NextResponse.json({ players });
  } catch (error) {
    return operatorErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireOperatorApi();
    const body = (await request.json()) as {
      action?: string;
      player?: PlayerInput & { id?: string; readableId?: string | null };
      teamId?: string;
      playerId?: string;
      readableId?: string;
      divisionId?: string;
    };
    const action = body.action ?? "create";
    const divisionId = body.divisionId?.trim() || null;

    if (action === "create") {
      if (
        !body.player?.firstName?.trim() ||
        !body.player.lastName?.trim() ||
        !body.player.city?.trim() ||
        !body.player.state?.trim()
      ) {
        return NextResponse.json(
          {
            error:
              "player.firstName, lastName, city, and state are required.",
          },
          { status: 400 },
        );
      }
      const created = await withOperatorSession((session) =>
        operatorCreatePlayer(session, body.player!, body.teamId),
      );
      await invalidateOperatorCache({ divisionId });
      return NextResponse.json({ ok: true, ...created });
    }

    if (action === "update") {
      if (!body.player?.id) {
        return NextResponse.json(
          { error: "player.id is required." },
          { status: 400 },
        );
      }
      await withOperatorSession((session) =>
        operatorUpdatePlayer(session, body.player!.id!, body.player!),
      );
      await invalidateOperatorCache({ divisionId });
      return NextResponse.json({ ok: true });
    }

    if (action === "assign") {
      if (!body.teamId || (!body.readableId && !body.playerId)) {
        return NextResponse.json(
          { error: "teamId and readableId or playerId are required." },
          { status: 400 },
        );
      }
      await withOperatorSession(async (session) => {
        if (body.readableId) {
          await operatorAssignPlayerByReadableId(
            session,
            body.teamId!,
            body.readableId,
          );
        } else {
          await operatorAssignPlayerById(
            session,
            body.teamId!,
            body.playerId!,
          );
        }
      });
      await invalidateOperatorCache({ divisionId });
      return NextResponse.json({ ok: true });
    }

    if (action === "remove") {
      if (!body.playerId?.trim()) {
        return NextResponse.json(
          { error: "playerId is required." },
          { status: 400 },
        );
      }
      if (body.teamId?.trim()) {
        await withOperatorSession((session) =>
          operatorRemovePlayerFromTeam(
            session,
            body.teamId!.trim(),
            body.playerId!.trim(),
          ),
        );
        await invalidateOperatorCache({ divisionId });
        return NextResponse.json({ ok: true });
      }
      if (!divisionId) {
        return NextResponse.json(
          { error: "teamId or divisionId is required to remove a player." },
          { status: 400 },
        );
      }
      const removedFrom = await withOperatorSession((session) =>
        operatorRemovePlayerFromDivision(
          session,
          divisionId,
          body.playerId!.trim(),
        ),
      );
      await invalidateOperatorCache({ divisionId });
      return NextResponse.json({ ok: true, removedFrom });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    return operatorErrorResponse(error);
  }
}
