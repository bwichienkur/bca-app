import { NextRequest, NextResponse } from "next/server";
import {
  deleteSharedDraft,
  getSharedDraft,
  isDraftStoreConfigured,
  putSharedDraft,
} from "@/lib/draft-store";
import type { ScoringDraft } from "@/lib/scoring";
import { requireScoringSession } from "@/lib/scoring-auth";

export const dynamic = "force-dynamic";

function isDraft(value: unknown): value is ScoringDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as ScoringDraft;
  return (
    typeof draft.matchId === "string" &&
    typeof draft.updatedAt === "string" &&
    Array.isArray(draft.teamOneLineup) &&
    Array.isArray(draft.teamTwoLineup) &&
    !!draft.games &&
    typeof draft.games === "object"
  );
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ matchId: string }> },
) {
  try {
    await requireScoringSession();
    const { matchId } = await context.params;

    if (!isDraftStoreConfigured()) {
      return NextResponse.json({
        shared: false,
        draft: null,
        updatedBy: null,
        updatedByName: null,
        submittedAt: null,
      });
    }

    const record = await getSharedDraft(matchId);
    return NextResponse.json({
      shared: true,
      draft: record?.draft ?? null,
      updatedBy: record?.updatedBy ?? null,
      updatedByName: record?.updatedByName ?? null,
      submittedAt: record?.submittedAt ?? null,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load draft.";
    const status = message.includes("Sign in") ? 401 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ matchId: string }> },
) {
  try {
    const session = await requireScoringSession();
    const { matchId } = await context.params;
    const body = (await request.json()) as {
      draft?: unknown;
      baseUpdatedAt?: string | null;
    };

    if (!isDraft(body.draft)) {
      return NextResponse.json(
        { error: "Invalid scoring draft." },
        { status: 400 },
      );
    }

    if (body.draft.matchId !== matchId) {
      return NextResponse.json(
        { error: "Draft matchId does not match URL." },
        { status: 400 },
      );
    }

    const result = await putSharedDraft({
      matchId,
      draft: body.draft,
      updatedBy: session.lmsId,
      updatedByName: session.name,
      baseUpdatedAt: body.baseUpdatedAt,
    });

    if (!result.shared) {
      return NextResponse.json(
        {
          shared: false,
          error: result.error,
          draft: body.draft,
        },
        { status: 503 },
      );
    }

    if (!result.ok) {
      return NextResponse.json(
        {
          shared: true,
          conflict: true,
          draft: result.record.draft,
          updatedBy: result.record.updatedBy,
          updatedByName: result.record.updatedByName,
          submittedAt: result.record.submittedAt,
        },
        { status: 409 },
      );
    }

    return NextResponse.json({
      shared: true,
      conflict: false,
      draft: result.record.draft,
      updatedBy: result.record.updatedBy,
      updatedByName: result.record.updatedByName,
      submittedAt: result.record.submittedAt,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save draft.";
    const status = message.includes("Sign in") ? 401 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ matchId: string }> },
) {
  try {
    await requireScoringSession();
    const { matchId } = await context.params;
    if (isDraftStoreConfigured()) {
      await deleteSharedDraft(matchId);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to delete draft.";
    const status = message.includes("Sign in") ? 401 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
