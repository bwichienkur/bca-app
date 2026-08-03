import { NextRequest, NextResponse } from "next/server";
import { requireScoringSession, readScoringSession } from "@/lib/scoring-auth";
import {
  createMessage,
  getTournamentDetail,
  listMessages,
  tournamentStoreMode,
} from "@/lib/tournaments/store";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
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
    const messages = await listMessages(id);
    return NextResponse.json({ messages, store: tournamentStoreMode() });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load messages.";
    const status = message.includes("Sign in") ? 401 : 502;
    return NextResponse.json({ error: message, messages: [] }, { status });
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const detail = await getTournamentDetail(id);
    if (!detail) {
      return NextResponse.json({ error: "Event not found." }, { status: 404 });
    }

    const body = (await request.json()) as {
      fromName?: string;
      fromEmail?: string | null;
      fromPhone?: string | null;
      body?: string;
      registrationId?: string | null;
    };

    const session = await readScoringSession();
    const fromName =
      body.fromName?.trim() ||
      session?.name?.trim() ||
      session?.email ||
      "";
    if (!fromName) {
      return NextResponse.json(
        { error: "Your name is required." },
        { status: 400 },
      );
    }
    if (!body.body?.trim()) {
      return NextResponse.json(
        { error: "Message cannot be empty." },
        { status: 400 },
      );
    }

    const message = await createMessage({
      tournamentId: id,
      registrationId: body.registrationId ?? null,
      fromName,
      fromEmail: body.fromEmail ?? session?.email ?? null,
      fromPhone: body.fromPhone ?? null,
      body: body.body,
    });

    return NextResponse.json(
      { message, store: tournamentStoreMode() },
      { status: 201 },
    );
  } catch (error) {
    const err =
      error instanceof Error ? error.message : "Failed to send message.";
    return NextResponse.json({ error: err }, { status: 502 });
  }
}
