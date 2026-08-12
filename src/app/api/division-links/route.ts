import { NextRequest, NextResponse } from "next/server";
import {
  validateNightFormatRosters,
  type DivisionLinkMode,
  type DivisionLinkRosterSide,
} from "@/lib/division-links";
import {
  normalizeNightLegs,
  type DivisionLinkConfig,
  type NightLeg,
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
    } satisfies DivisionLinkRosterSide;
  });
}

function legsFromBody(body: {
  legs?: Array<Partial<NightLeg>> | null;
  primaryDivisionId?: string;
  primaryDivisionName?: string;
  linkedDivisionId?: string;
  linkedDivisionName?: string;
  config?: Partial<DivisionLinkConfig> | null;
}): NightLeg[] {
  const fromLegs = normalizeNightLegs(body.legs);
  if (fromLegs.length >= 2) return fromLegs;

  const primaryDivisionId = body.primaryDivisionId?.trim() ?? "";
  const linkedDivisionId = body.linkedDivisionId?.trim() ?? "";
  if (!primaryDivisionId || !linkedDivisionId) return fromLegs;

  const primaryName =
    body.primaryDivisionName?.trim() || primaryDivisionId;
  const linkedName = body.linkedDivisionName?.trim() || linkedDivisionId;

  // Seed two legs from legacy primary/linked (+ optional config overrides).
  const seeded = normalizeNightLegs([
    {
      id: "singles",
      label: "Singles",
      divisionId: primaryDivisionId,
      divisionName: primaryName,
      standing: body.config?.standing?.primary,
      scoring: body.config?.scoring?.primary,
    },
    {
      id: "teams",
      label: "Teams",
      divisionId: linkedDivisionId,
      divisionName: linkedName,
      standing: body.config?.standing?.linked,
      scoring: body.config?.scoring?.linked,
    },
  ]);
  return seeded;
}

/** Public read — any client can resolve named nights for a league. */
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
 * Create/update a Tableside-only Night Format (never writes to LMS).
 * Body: { leagueId, name, legs: [{ divisionId, label?, standing?, scoring? }, ...] }
 * Legacy: { primaryDivisionId, linkedDivisionId, config? }
 */
export async function PUT(request: NextRequest) {
  try {
    const caller = await requireOperatorApi();
    const body = (await request.json()) as {
      leagueId?: string;
      name?: string;
      legs?: Array<Partial<NightLeg>> | null;
      primaryDivisionId?: string;
      primaryDivisionName?: string;
      linkedDivisionId?: string;
      linkedDivisionName?: string;
      config?: Partial<DivisionLinkConfig> | null;
      id?: string;
    };

    const leagueId = body.leagueId?.trim() ?? "";
    const name = body.name?.trim() ?? "";
    const legs = legsFromBody(body);

    if (!leagueId || !name) {
      return NextResponse.json(
        { error: "leagueId and name are required." },
        { status: 400 },
      );
    }
    if (legs.length < 2) {
      return NextResponse.json(
        {
          error:
            "Add at least two LMS divisions (legs). You can still send legacy primaryDivisionId + linkedDivisionId.",
        },
        { status: 400 },
      );
    }

    const sides = await Promise.all(
      legs.map((leg) => loadRosterSide(leg.divisionId, leg.divisionName)),
    );

    // Refresh division names from LMS roster load.
    const namedLegs = legs.map((leg, index) => ({
      ...leg,
      divisionName: sides[index]?.divisionName || leg.divisionName,
    }));

    const validation = validateNightFormatRosters(sides);
    if (!validation.ok || !validation.mode) {
      return NextResponse.json(
        {
          error: validation.message,
          validation,
        },
        { status: 400 },
      );
    }

    const link = await upsertDivisionLink({
      leagueId,
      link: {
        id: body.id?.trim() || undefined,
        name,
        leagueId,
        legs: namedLegs,
        mode: validation.mode as DivisionLinkMode,
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
      legs?: Array<Partial<NightLeg>> | null;
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

    const legs = legsFromBody(body);
    if (legs.length < 2) {
      return NextResponse.json(
        { error: "At least two legs (LMS divisions) are required." },
        { status: 400 },
      );
    }

    const sides = await Promise.all(
      legs.map((leg) => loadRosterSide(leg.divisionId, leg.divisionName)),
    );
    const validation = validateNightFormatRosters(sides);
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
