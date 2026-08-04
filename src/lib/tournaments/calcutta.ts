import type {
  CalcuttaLot,
  CalcuttaPayoutTier,
  CalcuttaStatus,
  CalcuttaSummary,
  TournamentCalcutta,
  TournamentRegistration,
} from "@/lib/tournaments/types";

export const DEFAULT_CALCUTTA_PAYOUT_TIERS: CalcuttaPayoutTier[] = [
  { place: 1, percent: 40 },
  { place: 2, percent: 30 },
  { place: 3, percent: 20 },
  { place: 4, percent: 10 },
];

export function emptyCalcuttaLot(registrationId: string): CalcuttaLot {
  return {
    registrationId,
    buyerName: "",
    soldPriceCents: null,
    buyBackHalf: false,
    buyerPaid: false,
    playerPaidBuyBack: false,
    place: null,
    notes: "",
  };
}

export function defaultCalcutta(tournamentId: string): TournamentCalcutta {
  return {
    tournamentId,
    enabled: false,
    status: "setup",
    minBidCents: 2000,
    houseCutPercent: 0,
    allowBuyBackHalf: true,
    payoutTiers: DEFAULT_CALCUTTA_PAYOUT_TIERS.map((tier) => ({ ...tier })),
    lots: [],
    updatedAt: new Date().toISOString(),
  };
}

function normalizeTier(raw: unknown): CalcuttaPayoutTier[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return DEFAULT_CALCUTTA_PAYOUT_TIERS.map((tier) => ({ ...tier }));
  }
  const tiers = raw
    .map((item) => {
      const row = item as Partial<CalcuttaPayoutTier>;
      const place = Math.floor(Number(row.place));
      const percent = Number(row.percent);
      if (!Number.isFinite(place) || place < 1) return null;
      if (!Number.isFinite(percent) || percent < 0) return null;
      return { place, percent };
    })
    .filter((tier): tier is CalcuttaPayoutTier => Boolean(tier));
  return tiers.length
    ? tiers.sort((a, b) => a.place - b.place)
    : DEFAULT_CALCUTTA_PAYOUT_TIERS.map((tier) => ({ ...tier }));
}

function normalizeLot(raw: unknown): CalcuttaLot | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Partial<CalcuttaLot>;
  const registrationId =
    typeof row.registrationId === "string" ? row.registrationId.trim() : "";
  if (!registrationId) return null;
  const soldRaw = row.soldPriceCents;
  const soldPriceCents =
    soldRaw == null || soldRaw === ("" as unknown)
      ? null
      : Number.isFinite(Number(soldRaw))
        ? Math.max(0, Math.round(Number(soldRaw)))
        : null;
  const placeRaw = row.place;
  const place =
    placeRaw == null || placeRaw === ("" as unknown)
      ? null
      : Number.isFinite(Number(placeRaw))
        ? Math.max(1, Math.floor(Number(placeRaw)))
        : null;
  return {
    registrationId,
    buyerName: typeof row.buyerName === "string" ? row.buyerName.trim() : "",
    soldPriceCents,
    buyBackHalf: Boolean(row.buyBackHalf),
    buyerPaid: Boolean(row.buyerPaid),
    playerPaidBuyBack: Boolean(row.playerPaidBuyBack),
    place,
    notes: typeof row.notes === "string" ? row.notes.trim() : "",
  };
}

export function normalizeCalcutta(
  tournamentId: string,
  raw: unknown,
): TournamentCalcutta {
  const base = defaultCalcutta(tournamentId);
  if (!raw || typeof raw !== "object") return base;
  const row = raw as Partial<TournamentCalcutta>;
  const status: CalcuttaStatus =
    row.status === "live" || row.status === "settled" || row.status === "setup"
      ? row.status
      : "setup";
  const lots = Array.isArray(row.lots)
    ? row.lots
        .map(normalizeLot)
        .filter((lot): lot is CalcuttaLot => Boolean(lot))
    : [];
  return {
    tournamentId,
    enabled: Boolean(row.enabled),
    status,
    minBidCents: Math.max(
      0,
      Math.round(
        Number.isFinite(Number(row.minBidCents))
          ? Number(row.minBidCents)
          : base.minBidCents,
      ),
    ),
    houseCutPercent: Math.min(
      100,
      Math.max(
        0,
        Number.isFinite(Number(row.houseCutPercent))
          ? Number(row.houseCutPercent)
          : 0,
      ),
    ),
    allowBuyBackHalf:
      row.allowBuyBackHalf == null ? true : Boolean(row.allowBuyBackHalf),
    payoutTiers: normalizeTier(row.payoutTiers),
    lots,
    updatedAt:
      typeof row.updatedAt === "string" && row.updatedAt
        ? row.updatedAt
        : base.updatedAt,
  };
}

/** Keep lots aligned with approved registrations; preserve sold data. */
export function syncCalcuttaLots(
  calcutta: TournamentCalcutta,
  registrations: TournamentRegistration[],
): TournamentCalcutta {
  const approved = registrations.filter((reg) => reg.status === "approved");
  const byId = new Map(calcutta.lots.map((lot) => [lot.registrationId, lot]));
  const lots = approved.map((reg) => {
    const existing = byId.get(reg.id);
    return existing
      ? { ...existing, registrationId: reg.id }
      : emptyCalcuttaLot(reg.id);
  });
  return { ...calcutta, lots };
}

export function summarizeCalcutta(calcutta: TournamentCalcutta): CalcuttaSummary {
  const soldLots = calcutta.lots.filter(
    (lot) => lot.soldPriceCents != null && lot.soldPriceCents > 0,
  );
  const grossPotCents = soldLots.reduce(
    (sum, lot) => sum + (lot.soldPriceCents ?? 0),
    0,
  );
  const houseCutCents = Math.round(
    (grossPotCents * calcutta.houseCutPercent) / 100,
  );
  const netPotCents = Math.max(0, grossPotCents - houseCutCents);

  const byPlace = new Map<number, CalcuttaLot>();
  for (const lot of soldLots) {
    if (lot.place != null) byPlace.set(lot.place, lot);
  }

  const payouts = calcutta.payoutTiers.map((tier) => {
    const amountCents = Math.round((netPotCents * tier.percent) / 100);
    const lot = byPlace.get(tier.place) ?? null;
    return {
      place: tier.place,
      percent: tier.percent,
      amountCents,
      registrationId: lot?.registrationId ?? null,
      buyerName: lot?.buyerName?.trim() || null,
      buyBackHalf: Boolean(lot?.buyBackHalf),
    };
  });

  return {
    grossPotCents,
    houseCutCents,
    netPotCents,
    soldCount: soldLots.length,
    lotCount: calcutta.lots.length,
    payouts,
  };
}

export function formatCalcuttaMoney(cents: number): string {
  const dollars = cents / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: dollars % 1 === 0 ? 0 : 2,
  }).format(dollars);
}

export function lotLabel(
  reg: TournamentRegistration | undefined,
  fallbackId: string,
): string {
  if (!reg) return fallbackId;
  if (reg.teamName?.trim()) return reg.teamName.trim();
  return reg.displayName.trim() || fallbackId;
}
