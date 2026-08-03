import { NextRequest, NextResponse } from "next/server";
import { requireScoringSession } from "@/lib/scoring-auth";
import { resolveSessionFargo } from "@/lib/tournaments/resolve-fargo";
import {
  createRegistration,
  getTournamentDetail,
  tournamentStoreMode,
  updateRegistration,
} from "@/lib/tournaments/store";
import type { RegistrationTeammate } from "@/lib/tournaments/types";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function parseTeammates(raw: unknown): RegistrationTeammate[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    const row = item as Partial<RegistrationTeammate>;
    const rating =
      typeof row.ratingAtSignup === "number" && Number.isFinite(row.ratingAtSignup)
        ? row.ratingAtSignup
        : null;
    return {
      displayName: typeof row.displayName === "string" ? row.displayName : "",
      ratingAtSignup: rating,
    };
  });
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireScoringSession();
    const { id } = await context.params;
    const body = (await request.json()) as {
      displayName?: string;
      phone?: string | null;
      noteToOrganizer?: string;
      teamName?: string | null;
      teammates?: unknown;
      /** Ignored for signed-in users — rating is resolved server-side. */
      ratingAtSignup?: number | null;
      isGuest?: boolean;
      fargoPlayerId?: string | null;
    };

    const displayName =
      body.displayName?.trim() ||
      session.name?.trim() ||
      session.email ||
      "Player";

    // Never trust a client-supplied Fargo for the signed-in captain.
    const ratingAtSignup = await resolveSessionFargo(session);

    const result = await createRegistration({
      tournamentId: id,
      userId: session.lmsId,
      fargoPlayerId: session.fargoRateId,
      displayName,
      email: session.email,
      phone: body.phone ?? null,
      ratingAtSignup,
      isGuest: ratingAtSignup == null,
      teamName: body.teamName ?? null,
      teammates: parseTeammates(body.teammates),
      noteToOrganizer: body.noteToOrganizer,
    });

    return NextResponse.json(
      { ...result, store: tournamentStoreMode() },
      { status: 201 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to register.";
    const status = message.includes("Sign in")
      ? 401
      : message.includes("not found")
        ? 404
        : message.includes("full") ||
            message.includes("already") ||
            message.includes("closed") ||
            message.includes("invite") ||
            message.includes("requires") ||
            message.includes("needs") ||
            message.includes("Team name") ||
            message.includes("teammate") ||
            message.includes("partner") ||
            message.includes("Singles") ||
            message.includes("Too many")
          ? 400
          : 502;
    return NextResponse.json({ error: message }, { status });
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

    const body = (await request.json()) as {
      registrationId?: string;
      status?: "pending" | "approved" | "rejected" | "withdrawn" | "waitlisted";
      paid?: boolean;
      checkedIn?: boolean;
      noteToOrganizer?: string;
    };
    if (!body.registrationId) {
      return NextResponse.json(
        { error: "registrationId is required." },
        { status: 400 },
      );
    }

    const result = await updateRegistration(id, body.registrationId, {
      status: body.status,
      paid: body.paid,
      checkedIn: body.checkedIn,
      noteToOrganizer: body.noteToOrganizer,
    });

    return NextResponse.json({ ...result, store: tournamentStoreMode() });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update registration.";
    const status = message.includes("Sign in")
      ? 401
      : message.includes("Organizer")
        ? 403
        : message.includes("not found")
          ? 404
          : message.includes("full")
            ? 400
            : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
