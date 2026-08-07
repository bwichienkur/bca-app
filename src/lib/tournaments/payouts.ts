/**
 * Default tournament & Calcutta purse distribution.
 *
 * Based on the organizer’s reference payouts:
 * - Tournament 16-place @ $5,100
 * - Calcutta 8-place @ $6,410
 *
 * Always pays 100% of the purse in clean $5 amounts, with 1st as the
 * primary rounding adjustment. Do not replace with generic industry tables.
 */

export type PayoutPlaceRow = {
  /** Inclusive place range, e.g. [1] or [5, 6]. */
  places: number[];
  /** Display label, e.g. "5th/6th". */
  label: string;
  /** Dollars paid to EACH place in the group. */
  eachCents: number;
  /** Count of places in the group. */
  count: number;
  /** eachCents * count */
  groupTotalCents: number;
};

export type PayoutPlan = {
  kind: "tournament" | "calcutta";
  purseCents: number;
  rows: PayoutPlaceRow[];
  totalPaidCents: number;
};

type ShareGroup = {
  places: number[];
  /** Percent of purse paid to EACH place in the group. */
  percentEach: number;
};

/** Reference: $5,100 → 1475 / 865 / 560 / 410 / 280×2 / 205×2 / 130×4 / 75×4 */
export const TOURNAMENT_16_SHARE_GROUPS: ShareGroup[] = [
  { places: [1], percentEach: 28.9 },
  { places: [2], percentEach: 17.0 },
  { places: [3], percentEach: 11.0 },
  { places: [4], percentEach: 8.0 },
  { places: [5, 6], percentEach: 5.5 },
  { places: [7, 8], percentEach: 4.0 },
  { places: [9, 10, 11, 12], percentEach: 2.55 },
  { places: [13, 14, 15, 16], percentEach: 1.47 },
];

/** Reference: $6,410 → 2185 / 1540 / 895 / 640 / 385×2 / 190×2 */
export const CALCUTTA_8_SHARE_GROUPS: ShareGroup[] = [
  { places: [1], percentEach: 34.1 },
  { places: [2], percentEach: 24.0 },
  { places: [3], percentEach: 14.0 },
  { places: [4], percentEach: 10.0 },
  { places: [5, 6], percentEach: 6.0 },
  { places: [7, 8], percentEach: 3.0 },
];

const FIVE_DOLLARS = 500;

function placeOrdinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

export function formatPlaceLabel(places: number[]): string {
  if (places.length === 1) return placeOrdinal(places[0]!);
  const first = places[0]!;
  const last = places[places.length - 1]!;
  if (places.length === 2 && last === first + 1) {
    return `${placeOrdinal(first)}/${placeOrdinal(last)}`;
  }
  return `${placeOrdinal(first)}-${placeOrdinal(last)}`;
}

/** Round to nearest $5 (500 cents). Half-up via Math.round on dollars/5. */
export function roundToNearestFiveDollars(cents: number): number {
  if (!Number.isFinite(cents) || cents <= 0) return 0;
  const dollars = cents / 100;
  return Math.round(dollars / 5) * 5 * 100;
}

function cloneGroups(groups: ShareGroup[]): ShareGroup[] {
  return groups.map((g) => ({
    places: [...g.places],
    percentEach: g.percentEach,
  }));
}

/**
 * Adapt the reference structure when a different paid-place count is requested.
 * Keeps the same philosophy: strong 1st, solid 2nd, gradual decrease, equal ties.
 */
export function adaptShareGroups(
  base: ShareGroup[],
  paidPlaces: number,
): ShareGroup[] {
  const basePlaces = base.reduce((n, g) => n + g.places.length, 0);
  if (paidPlaces === basePlaces) return cloneGroups(base);
  if (paidPlaces < 1) return cloneGroups(base);

  // Build a flat percent-per-place curve from the base, then regroup.
  const flat: number[] = [];
  for (const g of base) {
    for (const _ of g.places) flat.push(g.percentEach);
  }

  let curve: number[];
  if (paidPlaces < flat.length) {
    // Keep top (paidPlaces - 1) singular places, merge the rest into one bottom group
    // using the average of the truncated tail (still meaningful).
    curve = flat.slice(0, paidPlaces);
  } else {
    // Extend the tail by repeating the last percent, then renormalize later.
    curve = [...flat];
    const last = flat[flat.length - 1] ?? 1;
    while (curve.length < paidPlaces) curve.push(last * 0.85);
  }

  // Renormalize so sum of per-place percents ≈ 100.
  const sum = curve.reduce((a, b) => a + b, 0) || 1;
  const norm = curve.map((p) => (p / sum) * 100);

  // Regroup equal (or near-equal) neighbors for clean tied brackets when scaling up.
  const groups: ShareGroup[] = [];
  let i = 0;
  while (i < norm.length) {
    const place = i + 1;
    // Top 4 stay singular when we have enough places.
    if (place <= 4 || paidPlaces <= 4) {
      groups.push({ places: [place], percentEach: norm[i]! });
      i += 1;
      continue;
    }
    // Pair remaining places (5/6, 7/8, …); last odd place stands alone.
    if (i + 1 < norm.length) {
      const avg = (norm[i]! + norm[i + 1]!) / 2;
      groups.push({ places: [place, place + 1], percentEach: avg });
      i += 2;
    } else {
      groups.push({ places: [place], percentEach: norm[i]! });
      i += 1;
    }
  }
  return groups;
}

function enforceDescending(amounts: number[]): number[] {
  const next = [...amounts];
  for (let i = 1; i < next.length; i += 1) {
    if (next[i]! >= next[i - 1]!) {
      // Step down by at least $5 from the group above.
      next[i] = Math.max(0, next[i - 1]! - FIVE_DOLLARS);
    }
  }
  return next;
}

function allocateFromGroups(
  purseCents: number,
  groups: ShareGroup[],
): PayoutPlaceRow[] {
  const purse = Math.max(0, Math.round(purseCents));
  if (purse <= 0 || groups.length === 0) return [];

  // 1) Raw → round each group's per-place amount to $5.
  let each = groups.map((g) =>
    roundToNearestFiveDollars((purse * g.percentEach) / 100),
  );

  // 2) Descending hierarchy.
  each = enforceDescending(each);

  // 3) Floor: never zero out a paid place if purse allows.
  for (let i = 0; i < each.length; i += 1) {
    if (each[i]! <= 0) each[i] = FIVE_DOLLARS;
  }
  each = enforceDescending(each);

  const groupCounts = groups.map((g) => g.places.length);
  const totalFor = (amounts: number[]) =>
    amounts.reduce((sum, amt, i) => sum + amt * groupCounts[i]!, 0);

  // 4) Adjust primarily 1st so total == purse. Prefer $5 steps.
  let total = totalFor(each);
  const delta = purse - total;
  if (delta !== 0) {
    // Snap delta to $5 when possible; leftover $1–$4 goes to 1st as exact cents
    // only if needed to hit purse exactly (user wants exact purse).
    const first = each[0] ?? 0;
    let adjustedFirst = first + delta;

    // Keep 1st clearly above 2nd when possible.
    const second = each[1] ?? 0;
    if (each.length > 1 && adjustedFirst <= second) {
      adjustedFirst = second + FIVE_DOLLARS;
      // Rebalance remainder across 2nd–4th in $5 steps if we overshot.
      each[0] = adjustedFirst;
      const newTotal = totalFor(each);
      let remain = purse - newTotal;
      let idx = 1;
      while (remain !== 0 && idx < Math.min(4, each.length)) {
        const step =
          remain > 0
            ? Math.min(remain, FIVE_DOLLARS)
            : Math.max(remain, -FIVE_DOLLARS);
        const candidate = each[idx]! + step;
        const floor = each[idx + 1] != null ? each[idx + 1]! + FIVE_DOLLARS : 0;
        const ceil = each[idx - 1]! - FIVE_DOLLARS;
        if (step > 0 && candidate <= ceil) {
          each[idx] = candidate;
          remain -= step;
        } else if (step < 0 && candidate >= floor) {
          each[idx] = candidate;
          remain -= step;
        } else {
          idx += 1;
          continue;
        }
        if (Math.abs(remain) < FIVE_DOLLARS && remain !== 0) {
          // Final exact cents on 1st.
          each[0] = each[0]! + remain;
          remain = 0;
        }
        idx += 1;
      }
      if (remain !== 0) each[0] = each[0]! + remain;
    } else {
      each[0] = adjustedFirst;
    }
  }

  // Final safety: exact purse via 1st.
  total = totalFor(each);
  if (total !== purse && each.length > 0) {
    each[0] = each[0]! + (purse - total);
  }
  each = enforceDescending(each);
  total = totalFor(each);
  if (total !== purse && each.length > 0) {
    each[0] = each[0]! + (purse - total);
  }

  return groups.map((g, i) => {
    const eachCents = each[i]!;
    const count = g.places.length;
    return {
      places: [...g.places],
      label: formatPlaceLabel(g.places),
      eachCents,
      count,
      groupTotalCents: eachCents * count,
    };
  });
}

export type TournamentPayoutOptions = {
  /** Paid places; default 16 (reference structure). */
  paidPlaces?: number;
};

export function computeTournamentPayouts(
  purseCents: number,
  options: TournamentPayoutOptions = {},
): PayoutPlan {
  const paidPlaces = options.paidPlaces ?? 16;
  const groups = adaptShareGroups(TOURNAMENT_16_SHARE_GROUPS, paidPlaces);
  const rows = allocateFromGroups(purseCents, groups);
  return {
    kind: "tournament",
    purseCents: Math.max(0, Math.round(purseCents)),
    rows,
    totalPaidCents: rows.reduce((s, r) => s + r.groupTotalCents, 0),
  };
}

export type CalcuttaPayoutOptions = {
  paidPlaces?: number;
  /**
   * Highest hammer price in the auction (cents).
   * 2nd should preferably break even for that buyer when the pot allows.
   */
  highestSoldCents?: number | null;
};

export function computeCalcuttaPayouts(
  purseCents: number,
  options: CalcuttaPayoutOptions = {},
): PayoutPlan {
  const paidPlaces = options.paidPlaces ?? 8;
  const groups = adaptShareGroups(CALCUTTA_8_SHARE_GROUPS, paidPlaces);
  let rows = allocateFromGroups(purseCents, groups);

  const highest = options.highestSoldCents;
  if (
    highest != null &&
    Number.isFinite(highest) &&
    highest > 0 &&
    rows.length >= 2
  ) {
    const first = rows[0]!;
    const second = rows[1]!;
    if (second.eachCents < highest) {
      // Raise 2nd toward break-even / comfort, funded mostly from 1st,
      // but keep 1st clearly ahead by at least $5.
      const comfort = highest + 5000;
      let desired = roundToNearestFiveDollars(
        Math.min(comfort, Math.max(highest, second.eachCents)),
      );
      if (desired < highest) desired = roundToNearestFiveDollars(highest);

      const maxSecond = Math.max(0, first.eachCents - FIVE_DOLLARS);
      if (desired > maxSecond) desired = maxSecond;

      if (desired > second.eachCents) {
        const bump = desired - second.eachCents;
        let nextSecond = second.eachCents + bump;
        let nextFirst = first.eachCents - bump;

        // If 1st would fall to/below 2nd, stop short.
        if (nextFirst <= nextSecond) {
          nextSecond = Math.max(second.eachCents, nextFirst - FIVE_DOLLARS);
          nextFirst = first.eachCents - (nextSecond - second.eachCents);
        }

        rows = rows.map((row, i) => {
          if (i === 0) {
            return {
              ...row,
              eachCents: nextFirst,
              groupTotalCents: nextFirst * row.count,
            };
          }
          if (i === 1) {
            return {
              ...row,
              eachCents: nextSecond,
              groupTotalCents: nextSecond * row.count,
            };
          }
          return row;
        });

        const purse = Math.max(0, Math.round(purseCents));
        const total = rows.reduce((s, r) => s + r.groupTotalCents, 0);
        if (total !== purse && rows[0] && rows[1]) {
          const fix = purse - total;
          let eachCents = rows[0].eachCents + fix;
          // Preserve 1st > 2nd after the exact-purse fix.
          if (eachCents <= rows[1].eachCents) {
            eachCents = rows[1].eachCents + FIVE_DOLLARS;
          }
          rows[0] = {
            ...rows[0],
            eachCents,
            groupTotalCents: eachCents * rows[0].count,
          };
          // If that overshot the purse, trim lower singles (3rd/4th) slightly.
          const again = rows.reduce((s, r) => s + r.groupTotalCents, 0);
          let remain = purse - again;
          for (let i = 2; i < Math.min(4, rows.length) && remain !== 0; i += 1) {
            const row = rows[i]!;
            const floor =
              i + 1 < rows.length ? rows[i + 1]!.eachCents + FIVE_DOLLARS : 0;
            const step =
              remain < 0
                ? Math.max(remain, floor - row.eachCents)
                : Math.min(remain, FIVE_DOLLARS);
            if (step === 0) continue;
            const each = row.eachCents + step;
            rows[i] = {
              ...row,
              eachCents: each,
              groupTotalCents: each * row.count,
            };
            remain -= step;
          }
          if (remain !== 0 && rows[0]) {
            const each = rows[0].eachCents + remain;
            rows[0] = {
              ...rows[0],
              eachCents: each,
              groupTotalCents: each * rows[0].count,
            };
          }
        }
      }
    }
  }

  return {
    kind: "calcutta",
    purseCents: Math.max(0, Math.round(purseCents)),
    rows,
    totalPaidCents: rows.reduce((s, r) => s + r.groupTotalCents, 0),
  };
}

/** Flat place → amount map for wiring into lot settlement. */
export function payoutCentsByPlace(plan: PayoutPlan): Map<number, number> {
  const map = new Map<number, number>();
  for (const row of plan.rows) {
    for (const place of row.places) map.set(place, row.eachCents);
  }
  return map;
}

/**
 * Default Calcutta percent tiers derived from the share groups
 * (one tier row per finishing place for lot attachment).
 */
export function defaultCalcuttaPercentTiers(
  paidPlaces = 8,
): Array<{ place: number; percent: number }> {
  const groups = adaptShareGroups(CALCUTTA_8_SHARE_GROUPS, paidPlaces);
  return groups.flatMap((g) =>
    g.places.map((place) => ({ place, percent: g.percentEach })),
  );
}

export function formatPayoutDollars(cents: number): string {
  const dollars = cents / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: dollars % 1 === 0 ? 0 : 2,
  }).format(dollars);
}

/** Text block matching the organizer’s preferred output format. */
export function formatPayoutPlan(plan: PayoutPlan): string {
  const title =
    plan.kind === "tournament"
      ? `TOURNAMENT — ${formatPayoutDollars(plan.purseCents)} TOTAL`
      : `CALCUTTA — ${formatPayoutDollars(plan.purseCents)} TOTAL`;
  const lines = plan.rows.map((row) => {
    const amount = formatPayoutDollars(row.eachCents);
    if (row.count > 1) return `${row.label} — ${amount} each`;
    return `${row.label} — ${amount}`;
  });
  return [
    title,
    "",
    ...lines,
    "",
    `TOTAL PAID: ${formatPayoutDollars(plan.totalPaidCents)}`,
  ].join("\n");
}

/** Purse helper: paid entries × fee + added money. */
export function computeTournamentPurseCents(args: {
  paidEntryCount: number;
  entryFeeCents: number;
  addedMoneyCents?: number | null;
}): number {
  const entries = Math.max(0, Math.floor(args.paidEntryCount));
  const fee = Math.max(0, Math.round(args.entryFeeCents));
  const added = Math.max(0, Math.round(args.addedMoneyCents ?? 0));
  return entries * fee + added;
}
