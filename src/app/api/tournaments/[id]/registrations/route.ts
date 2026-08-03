import { NextRequest, NextResponse } from "next/server";
import { requireScoringSession } from "@/lib/scoring-auth";
import {
  createRegistration,
  getTournamentDetail,
  tournamentStoreMode,
  updateRegistration,
} from "@/lib/tournaments/store";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireScoringSession();
    const { id } = await context.params;
    const body = (await request.json()) as {
      displayName?: string;
      phone?: string | null;
      ratingAtSignup?: number | null;
      isGuest?: boolean;
      noteToOrganizer?: string;
      fargoPlayerId?: string | null;
    };

    const displayName =
      body.displayName?.trim() ||
      session.name?.trim() ||
      session.email ||
      "Player";

    const result = await createRegistration({
      tournamentId: id,
      userId: session.lmsId,
      fargoPlayerId: body.fargoPlayerId ?? session.fargoRateId,
      displayName,
      email: session.email,
      phone: body.phone ?? null,
      ratingAtSignup:
        body.ratingAtSignup === undefined ? null : body.ratingAtSignup,
      isGuest: Boolean(body.isGuest),
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
            message.includes("requires")
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
