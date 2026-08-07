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
  operatorRemovePlayerFromTeam,
  operatorSearchPlayers,
  operatorUpdatePlayer,
  withOperatorSession,
  type PlayerInput,
} from "@/lib/lms-operator-manage";

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
    const players = await withOperatorSession((session) =>
      operatorListPlayers(session, divisionId),
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
    };
    const action = body.action ?? "create";

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
      return NextResponse.json({ ok: true });
    }

    if (action === "remove") {
      if (!body.teamId || !body.playerId) {
        return NextResponse.json(
          { error: "teamId and playerId are required." },
          { status: 400 },
        );
      }
      await withOperatorSession((session) =>
        operatorRemovePlayerFromTeam(session, body.teamId!, body.playerId!),
      );
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    return operatorErrorResponse(error);
  }
}
