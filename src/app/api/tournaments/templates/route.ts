import { NextRequest, NextResponse } from "next/server";
import { requireScoringSession } from "@/lib/scoring-auth";
import {
  deleteTournamentTemplate,
  listTournamentTemplates,
  tournamentTemplatesStoreMode,
  upsertTournamentTemplate,
} from "@/lib/tournaments/templates-store";
import type { TournamentTemplateForm } from "@/lib/tournaments/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await requireScoringSession();
    const templates = await listTournamentTemplates(session.lmsId);
    return NextResponse.json({
      templates,
      store: tournamentTemplatesStoreMode(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load templates.";
    const status = message.includes("Sign in") ? 401 : 502;
    return NextResponse.json({ error: message, templates: [] }, { status });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await requireScoringSession();
    const body = (await request.json()) as {
      name?: string;
      form?: TournamentTemplateForm;
      id?: string;
    };
    if (!body?.name?.trim()) {
      return NextResponse.json(
        { error: "Template name is required.", templates: [] },
        { status: 400 },
      );
    }
    if (!body.form || typeof body.form !== "object") {
      return NextResponse.json(
        { error: "Template form is required.", templates: [] },
        { status: 400 },
      );
    }
    const templates = await upsertTournamentTemplate({
      userId: session.lmsId,
      name: body.name,
      form: body.form,
      id: typeof body.id === "string" ? body.id : undefined,
    });
    return NextResponse.json({
      templates,
      store: tournamentTemplatesStoreMode(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save template.";
    const status = message.includes("Sign in") ? 401 : 502;
    return NextResponse.json({ error: message, templates: [] }, { status });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await requireScoringSession();
    const templateId = request.nextUrl.searchParams.get("id")?.trim();
    if (!templateId) {
      return NextResponse.json(
        { error: "Template id is required.", templates: [] },
        { status: 400 },
      );
    }
    const templates = await deleteTournamentTemplate(
      session.lmsId,
      templateId,
    );
    return NextResponse.json({
      templates,
      store: tournamentTemplatesStoreMode(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to delete template.";
    const status = message.includes("Sign in") ? 401 : 502;
    return NextResponse.json({ error: message, templates: [] }, { status });
  }
}
