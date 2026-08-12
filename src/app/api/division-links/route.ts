import { NextRequest, NextResponse } from "next/server";
import {
  validateDivisionLinkRosters,
  type DivisionLinkMode,
} from "@/lib/division-links";
import {
  normalizeDivisionLinkConfig,
  type DivisionLinkConfig,
} from "@/lib/division-link-config";
import {
  deleteDivisionLink,
  listDivisionLinks,
  upsertDivisionLink,
} from "@/lib/division-links-store";
import {
  operatorErrorResponse,
  requireOperatorApi,
} from "@/lib/lms-operator-api";
import {
  operatorListTeams,
  withOperatorSession,
} from "@/lib/lms-operator-manage";

export const dynamic = "force-dynamic";

async function loadRosterSide(divisionId: string, divisionName: string) {
  return withOperatorSession(async (session) => {
    const teams = await operatorListTeams(session, divisionId);
    const players = teams
      .filter((team) => !team.isBye)
      .flatMap((team) =>
        (team.players ?? []).map((player) => ({
          id: String(player.id ?? "").trim(),
          name: String(player.name ?? "").trim(),
        })),
      )
      .filter((player) => player.id || player.name);
    return {
      divisionId,
      divisionName,
      teams: teams.map((team) => ({
        id: team.id,
        name: team.name,
        isBye: team.isBye,
      })),
      players,
    };
  });
}

/** Public read — any client can resolve named links for a league. */
export async function GET(request: NextRequest) {
  try {
    const leagueId = request.nextUrl.searchParams.get("leagueId")?.trim();
    if (!leagueId) {
      return NextResponse.json(
        { error: "leagueId is required.", links: [] },
        { status: 400 },
      );
    }
    const links = await listDivisionLinks(leagueId);
    return NextResponse.json({ links });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load division links.";
    return NextResponse.json({ error: message, links: [] }, { status: 502 });
  }
}

/**
 * Create/update a Tableside-only division link (never writes to LMS).
 * Body: { leagueId, name, primaryDivisionId, linkedDivisionId, id? }
 */
export async function PUT(request: NextRequest) {
  try {
    const caller = await requireOperatorApi();
    const body = (await request.json()) as {
      leagueId?: string;
      name?: string;
      primaryDivisionId?: string;
      primaryDivisionName?: string;
      linkedDivisionId?: string;
      linkedDivisionName?: string;
      config?: Partial<DivisionLinkConfig> | null;
      id?: string;
    };

    const leagueId = body.leagueId?.trim() ?? "";
    const name = body.name?.trim() ?? "";
    const primaryDivisionId = body.primaryDivisionId?.trim() ?? "";
    const linkedDivisionId = body.linkedDivisionId?.trim() ?? "";
    if (!leagueId || !name || !primaryDivisionId || !linkedDivisionId) {
      return NextResponse.json(
        {
          error:
            "leagueId, name, primaryDivisionId, and linkedDivisionId are required.",
        },
        { status: 400 },
      );
    }

    const primaryDivisionName =
      body.primaryDivisionName?.trim() || primaryDivisionId;
    const linkedDivisionName =
      body.linkedDivisionName?.trim() || linkedDivisionId;

    const [primary, linked] = await Promise.all([
      loadRosterSide(primaryDivisionId, primaryDivisionName),
      loadRosterSide(linkedDivisionId, linkedDivisionName),
    ]);

    const validation = validateDivisionLinkRosters(primary, linked);
    if (!validation.ok || !validation.mode) {
      return NextResponse.json(
        {
          error: validation.message,
          validation,
        },
        { status: 400 },
      );
    }

    const config = normalizeDivisionLinkConfig(
      body.config,
      primary.divisionName,
      linked.divisionName,
    );

    const link = await upsertDivisionLink({
      leagueId,
      link: {
        id: body.id?.trim() || undefined,
        name,
        leagueId,
        primaryDivisionId,
        primaryDivisionName: primary.divisionName,
        linkedDivisionId,
        linkedDivisionName: linked.divisionName,
        mode: validation.mode as DivisionLinkMode,
        config,
        updatedBy: caller.name ?? caller.email ?? caller.lmsId ?? null,
      },
    });

    return NextResponse.json({ link, validation });
  } catch (error) {
    return operatorErrorResponse(error);
  }
}

/** Validate without saving. */
export async function POST(request: NextRequest) {
  try {
    await requireOperatorApi();
    const body = (await request.json()) as {
      action?: string;
      primaryDivisionId?: string;
      primaryDivisionName?: string;
      linkedDivisionId?: string;
      linkedDivisionName?: string;
    };
    if (body.action !== "validate") {
      return NextResponse.json(
        { error: "Unsupported action." },
        { status: 400 },
      );
    }
    const primaryDivisionId = body.primaryDivisionId?.trim() ?? "";
    const linkedDivisionId = body.linkedDivisionId?.trim() ?? "";
    if (!primaryDivisionId || !linkedDivisionId) {
      return NextResponse.json(
        { error: "primaryDivisionId and linkedDivisionId are required." },
        { status: 400 },
      );
    }
    const [primary, linked] = await Promise.all([
      loadRosterSide(
        primaryDivisionId,
        body.primaryDivisionName?.trim() || primaryDivisionId,
      ),
      loadRosterSide(
        linkedDivisionId,
        body.linkedDivisionName?.trim() || linkedDivisionId,
      ),
    ]);
    const validation = validateDivisionLinkRosters(primary, linked);
    return NextResponse.json({ validation });
  } catch (error) {
    return operatorErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireOperatorApi();
    const leagueId = request.nextUrl.searchParams.get("leagueId")?.trim();
    const linkId = request.nextUrl.searchParams.get("linkId")?.trim();
    if (!leagueId || !linkId) {
      return NextResponse.json(
        { error: "leagueId and linkId are required." },
        { status: 400 },
      );
    }
    const ok = await deleteDivisionLink({ leagueId, linkId });
    if (!ok) {
      return NextResponse.json({ error: "Link not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return operatorErrorResponse(error);
  }
}
