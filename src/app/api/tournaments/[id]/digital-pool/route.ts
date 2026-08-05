import { NextRequest, NextResponse } from "next/server";
import { requireAppUser } from "@/lib/app-auth";
import { pushTournamentToDigitalPool } from "@/lib/digital-pool-push";
import { requireScoringSession } from "@/lib/scoring-auth";
import {
  getTournamentDetail,
  updateTournament,
} from "@/lib/tournaments/store";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const [appUser, scoring] = await Promise.all([
      requireAppUser(),
      requireScoringSession(),
    ]);

    const detail = await getTournamentDetail(id);
    if (!detail) {
      return NextResponse.json({ error: "Event not found." }, { status: 404 });
    }
    if (detail.tournament.organizerUserId !== scoring.lmsId) {
      return NextResponse.json({ error: "Organizer only." }, { status: 403 });
    }
    if (!appUser.digitalPool?.refreshToken) {
      return NextResponse.json(
        {
          error:
            "Connect Digital Pool in Settings before pushing a bracket.",
        },
        { status: 400 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      tableCount?: number;
      force?: boolean;
    };

    if (
      detail.tournament.digitalPoolSlug &&
      detail.tournament.digitalPoolTournamentId &&
      !body.force
    ) {
      return NextResponse.json(
        {
          error:
            "This event was already pushed to Digital Pool. Open it there, or pass force=true to push again.",
          digitalPool: {
            tournamentId: detail.tournament.digitalPoolTournamentId,
            slug: detail.tournament.digitalPoolSlug,
            builderUrl: `https://digitalpool.com/tournament-builder/${detail.tournament.digitalPoolSlug}`,
            pushedAt: detail.tournament.digitalPoolPushedAt,
          },
        },
        { status: 409 },
      );
    }

    const result = await pushTournamentToDigitalPool({
      appUser,
      tournament: detail.tournament,
      registrations: detail.registrations,
      tableCount:
        typeof body.tableCount === "number" && body.tableCount >= 2
          ? Math.floor(body.tableCount)
          : undefined,
    });

    const updated = await updateTournament(id, {
      digitalPoolTournamentId: result.tournamentId,
      digitalPoolSlug: result.slug,
      digitalPoolPushedAt: new Date().toISOString(),
    });

    return NextResponse.json({
      digitalPool: result,
      tournament: updated ?? detail.tournament,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to push tournament to Digital Pool.";
    const status = message.includes("Sign in")
      ? 401
      : message.includes("Organizer")
        ? 403
        : message.includes("Connect Digital Pool") ||
            message.includes("Need at least")
          ? 400
          : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
