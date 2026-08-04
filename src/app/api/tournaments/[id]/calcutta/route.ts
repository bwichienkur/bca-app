import { NextRequest, NextResponse } from "next/server";
import {
  readScoringSession,
  requireScoringSession,
} from "@/lib/scoring-auth";
import { summarizeCalcutta } from "@/lib/tournaments/calcutta";
import {
  getCalcutta,
  getTournamentDetail,
  saveCalcutta,
  tournamentStoreMode,
} from "@/lib/tournaments/store";
import type {
  CalcuttaLot,
  CalcuttaPayoutTier,
  CalcuttaStatus,
  TournamentCalcutta,
} from "@/lib/tournaments/types";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function parseLots(raw: unknown): CalcuttaLot[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw.map((item) => {
    const row = item as Partial<CalcuttaLot>;
    return {
      registrationId: String(row.registrationId ?? ""),
      buyerName: typeof row.buyerName === "string" ? row.buyerName : "",
      soldPriceCents:
        row.soldPriceCents == null
          ? null
          : Math.max(0, Math.round(Number(row.soldPriceCents))),
      buyBackHalf: Boolean(row.buyBackHalf),
      buyerPaid: Boolean(row.buyerPaid),
      playerPaidBuyBack: Boolean(row.playerPaidBuyBack),
      place:
        row.place == null
          ? null
          : Math.max(1, Math.floor(Number(row.place))),
      notes: typeof row.notes === "string" ? row.notes : "",
    };
  });
}

function parseTiers(raw: unknown): CalcuttaPayoutTier[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw.map((item) => {
    const row = item as Partial<CalcuttaPayoutTier>;
    return {
      place: Math.max(1, Math.floor(Number(row.place))),
      percent: Math.max(0, Number(row.percent)),
    };
  });
}

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

    const calcutta = await getCalcutta(id);
    const summary = summarizeCalcutta(calcutta);

    if (!isOrganizer && !calcutta.enabled) {
      return NextResponse.json({
        calcutta: null,
        summary: null,
        isOrganizer: false,
        store: tournamentStoreMode(),
      });
    }

    // Public board: hide unpaid settlement toggles / notes.
    const publicCalcutta: TournamentCalcutta | null = isOrganizer
      ? calcutta
      : {
          ...calcutta,
          lots: calcutta.lots.map((lot) => ({
            ...lot,
            notes: "",
            buyerPaid: false,
            playerPaidBuyBack: false,
          })),
        };

    return NextResponse.json({
      calcutta: publicCalcutta,
      summary,
      isOrganizer,
      store: tournamentStoreMode(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load Calcutta.";
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

    const body = (await request.json()) as Partial<TournamentCalcutta>;
    const existing = await getCalcutta(id);
    const status: CalcuttaStatus =
      body.status === "live" ||
      body.status === "settled" ||
      body.status === "setup"
        ? body.status
        : existing.status;

    const next = await saveCalcutta({
      ...existing,
      enabled: body.enabled != null ? Boolean(body.enabled) : existing.enabled,
      status,
      minBidCents:
        body.minBidCents != null
          ? Math.max(0, Math.round(Number(body.minBidCents)))
          : existing.minBidCents,
      houseCutPercent:
        body.houseCutPercent != null
          ? Math.min(100, Math.max(0, Number(body.houseCutPercent)))
          : existing.houseCutPercent,
      allowBuyBackHalf:
        body.allowBuyBackHalf != null
          ? Boolean(body.allowBuyBackHalf)
          : existing.allowBuyBackHalf,
      payoutTiers: parseTiers(body.payoutTiers) ?? existing.payoutTiers,
      lots: parseLots(body.lots) ?? existing.lots,
    });

    return NextResponse.json({
      calcutta: next,
      summary: summarizeCalcutta(next),
      store: tournamentStoreMode(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save Calcutta.";
    const statusCode = message.includes("Sign in")
      ? 401
      : message.includes("Organizer")
        ? 403
        : 502;
    return NextResponse.json({ error: message }, { status: statusCode });
  }
}
