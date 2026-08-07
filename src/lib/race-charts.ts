/**
 * Fargo race charts used by BCA-style handicapped singles.
 * Values are “higher race – lower race” for a given rating difference.
 */

export type RaceChartId = "r6-hot";

export type RacePair = {
  /** Games the higher-rated player must win. */
  higher: number;
  /** Games the lower-rated player must win. */
  lower: number;
};

type RaceBand = {
  minDiff: number;
  maxDiff: number;
  race: RacePair;
};

/** Palm Beach Tuesday 9-Ball sheet: Race Chart – R6 Hot */
const R6_HOT_BANDS: RaceBand[] = [
  { minDiff: 0, maxDiff: 27, race: { higher: 6, lower: 6 } },
  { minDiff: 28, maxDiff: 51, race: { higher: 6, lower: 5 } },
  { minDiff: 52, maxDiff: 85, race: { higher: 7, lower: 5 } },
  { minDiff: 86, maxDiff: 106, race: { higher: 7, lower: 4 } },
  { minDiff: 107, maxDiff: 151, race: { higher: 8, lower: 4 } },
  { minDiff: 152, maxDiff: 169, race: { higher: 8, lower: 3 } },
  { minDiff: 170, maxDiff: Number.POSITIVE_INFINITY, race: { higher: 9, lower: 3 } },
];

const CHARTS: Record<RaceChartId, RaceBand[]> = {
  "r6-hot": R6_HOT_BANDS,
};

export function raceForRatingDiff(
  chartId: RaceChartId,
  ratingDiff: number,
): RacePair {
  const diff = Math.max(0, Math.abs(Math.round(ratingDiff)));
  const bands = CHARTS[chartId];
  const band =
    bands.find((row) => diff >= row.minDiff && diff <= row.maxDiff) ??
    bands[bands.length - 1]!;
  return { ...band.race };
}

/**
 * Given two Fargo ratings, return each player’s race-to target on the chart.
 * Higher rating plays to `higher`; lower plays to `lower`. Equal → both `higher`
 * (same as 0-diff band, which is symmetric).
 */
export function raceTargetsForPlayers(
  chartId: RaceChartId,
  ratingA: number,
  ratingB: number,
): { raceA: number; raceB: number; diff: number } {
  const diff = Math.abs(Math.round(ratingA) - Math.round(ratingB));
  const { higher, lower } = raceForRatingDiff(chartId, diff);
  if (ratingA === ratingB) return { raceA: higher, raceB: higher, diff };
  if (ratingA > ratingB) return { raceA: higher, raceB: lower, diff };
  return { raceA: lower, raceB: higher, diff };
}

export function formatRacePair(race: RacePair): string {
  return `${race.higher} to ${race.lower}`;
}
