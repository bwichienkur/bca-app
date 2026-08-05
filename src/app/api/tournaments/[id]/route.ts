import { NextRequest, NextResponse } from "next/server";
import {
  readScoringSession,
  requireScoringSession,
} from "@/lib/scoring-auth";
import {
  deleteTournament,
  getTournamentDetail,
  tournamentStoreMode,
  updateTournament,
} from "@/lib/tournaments/store";
import type { Tournament } from "@/lib/tournaments/types";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const detail = await getTournamentDetail(id);
    if (!detail) {
      return NextResponse.json({ error: "Event not found." }, { status: 404 });
    }

    const session = await readScoringSession();
    const isOrganizer = Boolean(
      session && session.lmsId === detail.tournament.organizerUserId,
    );

    const registrations = isOrganizer
      ? detail.registrations
      : detail.registrations
          .filter(
            (r) =>
              r.status === "approved" ||
              (session != null && r.userId === session.lmsId),
          )
          .map((r) =>
            session && r.userId === session.lmsId
              ? r
              : {
                  ...r,
                  email: null,
                  phone: null,
                  noteToOrganizer: "",
                },
          );

    return NextResponse.json({
      ...detail,
      isOrganizer,
      // Hide contact messages from non-organizers
      messages: isOrganizer ? detail.messages : [],
      registrations,
      store: tournamentStoreMode(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load event.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireScoringSession();
    const { id } = await context.params;
    const detail = await getTournamentDetail(id);
    if (!detail) {
      return NextResponse.json({ error: "Event not found." }, { status: 404 });
    }
    if (detail.tournament.organizerUserId !== session.lmsId) {
      return NextResponse.json({ error: "Organizer only." }, { status: 403 });
    }

    const body = (await request.json()) as Partial<Tournament>;
    const allowed: Partial<Tournament> = {};
    const keys: (keyof Tournament)[] = [
      "title",
      "description",
      "thumbnailUrl",
      "gameType",
      "eventType",
      "bracketFormat",
      "handicapSystem",
      "handicapNotes",
      "rulesetPreset",
      "winnersRaceTo",
      "losersRaceTo",
      "maxFargo",
      "minRobustnessStatus",
      "unratedPolicy",
      "maxPlayers",
      "teamSize",
      "entryFeeCents",
      "payMethod",
      "venmoHandle",
      "zelleHandle",
      "cashAppHandle",
      "payoutNotes",
      "registrationMode",
      "reportedToFargo",
      "tableSize",
      "venueName",
      "venueAddress",
      "city",
      "region",
      "startsAt",
      "checkInAt",
      "organizerPhone",
      "status",
    ];
    for (const key of keys) {
      if (key in body) {
        (allowed as Record<string, unknown>)[key] = body[key];
      }
    }
    if ("minRobustnessStatus" in allowed) {
      const min = allowed.minRobustnessStatus;
      allowed.minRobustnessStatus =
        min === "preliminary" || min === "established" ? min : null;
    }
    // Min Fargo is no longer configurable — clear on any edit that touches Fargo.
    if ("maxFargo" in allowed) {
      allowed.minFargo = null;
    }
    for (const key of ["venmoHandle", "zelleHandle", "cashAppHandle"] as const) {
      if (key in allowed) {
        const value = allowed[key];
        allowed[key] =
          typeof value === "string" && value.trim() ? value.trim() : null;
      }
    }

    const tournament = await updateTournament(id, allowed);
    if (!tournament) {
      return NextResponse.json({ error: "Event not found." }, { status: 404 });
    }
    const refreshed = await getTournamentDetail(id);
    return NextResponse.json({
      tournament: refreshed?.tournament ?? tournament,
      store: tournamentStoreMode(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update event.";
    const status = message.includes("Sign in")
      ? 401
      : message.includes("Organizer")
        ? 403
        : 502;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const session = await requireScoringSession();
    const { id } = await context.params;
    const detail = await getTournamentDetail(id);
    if (!detail) {
      return NextResponse.json({ error: "Event not found." }, { status: 404 });
    }
    if (detail.tournament.organizerUserId !== session.lmsId) {
      return NextResponse.json({ error: "Organizer only." }, { status: 403 });
    }

    const removed = await deleteTournament(id);
    if (!removed) {
      return NextResponse.json({ error: "Event not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, store: tournamentStoreMode() });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to remove event.";
    const status = message.includes("Sign in")
      ? 401
      : message.includes("Organizer")
        ? 403
        : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
