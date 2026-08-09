/**
 * FargoRate race charts (Hot / Medium / Mild × R2–R11).
 *
 * Race targets are derived from the Fargo single-game win model
 *   P = 2^(Δ/100) / (2^(Δ/100) + 1)
 * and race-win DP, matching FargoRate’s chart philosophy:
 *   Hot    — closest to 50/50 without favoring the lower-rated player
 *   Medium — less aggressive (target ~55% for higher)
 *   Mild   — lightest spot (target ~62% for higher)
 *
 * Official Palm Beach “R6 Hot” printed bands are kept as an exact override.
 */

export type RaceChartIntensity = "hot" | "medium" | "mild";
export type RaceChartBase = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;

/** e.g. "r6-hot", "r5-medium" */
export type RaceChartId = `r${RaceChartBase}-${RaceChartIntensity}`;

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

export type RaceChartMeta = {
  id: RaceChartId;
  base: RaceChartBase;
  intensity: RaceChartIntensity;
  label: string;
  shortLabel: string;
};

const BASES: RaceChartBase[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const INTENSITIES: RaceChartIntensity[] = ["hot", "medium", "mild"];

const INTENSITY_LABEL: Record<RaceChartIntensity, string> = {
  hot: "Hot",
  medium: "Medium",
  mild: "Mild",
};

/** Higher-player race-win probability targets (Hot stays at fair). */
const INTENSITY_TARGET: Record<RaceChartIntensity, number> = {
  hot: 0.5,
  medium: 0.55,
  mild: 0.62,
};

/** Palm Beach Tuesday 9-Ball sheet: Race Chart – R6 Hot (official bands). */
const R6_HOT_BANDS: RaceBand[] = [
  { minDiff: 0, maxDiff: 27, race: { higher: 6, lower: 6 } },
  { minDiff: 28, maxDiff: 51, race: { higher: 6, lower: 5 } },
  { minDiff: 52, maxDiff: 85, race: { higher: 7, lower: 5 } },
  { minDiff: 86, maxDiff: 106, race: { higher: 7, lower: 4 } },
  { minDiff: 107, maxDiff: 151, race: { higher: 8, lower: 4 } },
  { minDiff: 152, maxDiff: 169, race: { higher: 8, lower: 3 } },
  { minDiff: 170, maxDiff: Number.POSITIVE_INFINITY, race: { higher: 9, lower: 3 } },
];

const OFFICIAL_BANDS: Partial<Record<RaceChartId, RaceBand[]>> = {
  "r6-hot": R6_HOT_BANDS,
};

function chartId(base: RaceChartBase, intensity: RaceChartIntensity): RaceChartId {
  return `r${base}-${intensity}`;
}

export const RACE_CHART_OPTIONS: RaceChartMeta[] = BASES.flatMap((base) =>
  INTENSITIES.map((intensity) => ({
    id: chartId(base, intensity),
    base,
    intensity,
    label: `R${base} ${INTENSITY_LABEL[intensity]}`,
    shortLabel: `R${base} ${INTENSITY_LABEL[intensity]}`,
  })),
);

export const DEFAULT_RACE_CHART_ID: RaceChartId = "r6-hot";

export function isRaceChartId(value: string | null | undefined): value is RaceChartId {
  return Boolean(value && RACE_CHART_OPTIONS.some((row) => row.id === value));
}

export function parseRaceChartId(
  value: string | null | undefined,
  fallback: RaceChartId = DEFAULT_RACE_CHART_ID,
): RaceChartId {
  return isRaceChartId(value) ? value : fallback;
}

export function raceChartMeta(id: RaceChartId): RaceChartMeta {
  return (
    RACE_CHART_OPTIONS.find((row) => row.id === id) ??
    RACE_CHART_OPTIONS.find((row) => row.id === DEFAULT_RACE_CHART_ID)!
  );
}

export function formatRacePair(race: RacePair): string {
  return `${race.higher} to ${race.lower}`;
}

function singleGameWinProb(ratingDiff: number): number {
  const share = Math.pow(2, ratingDiff / 100);
  return share / (share + 1);
}

/** P(higher reaches `higherTo` before lower reaches `lowerTo`). */
function raceWinProb(
  pHigherGame: number,
  higherTo: number,
  lowerTo: number,
): number {
  const H = Math.max(1, higherTo);
  const L = Math.max(1, lowerTo);
  const dp: number[][] = Array.from({ length: H + 1 }, () =>
    Array<number>(L + 1).fill(0),
  );
  for (let h = 0; h <= H; h++) dp[h]![L] = 0;
  for (let l = 0; l <= L; l++) dp[H]![l] = 1;
  for (let h = H - 1; h >= 0; h--) {
    for (let l = L - 1; l >= 0; l--) {
      dp[h]![l] =
        pHigherGame * dp[h + 1]![l]! + (1 - pHigherGame) * dp[h]![l + 1]!;
    }
  }
  return dp[0]![0]!;
}

/** Candidate races around an even R-n, same family as FargoRate charts. */
function candidateRaces(base: number): RacePair[] {
  const races: RacePair[] = [];
  const seen = new Set<string>();
  const push = (a: number, b: number) => {
    if (a < 1 || b < 1) return;
    if (a * 3 < b || b * 3 < a) return;
    const higher = Math.max(a, b);
    const lower = Math.min(a, b);
    const key = `${higher}-${lower}`;
    if (seen.has(key)) return;
    seen.add(key);
    races.push({ higher, lower });
  };

  // Mirror FargoRate chart steps: R±i and the intermediate “half step”.
  for (let i = 0; ; i++) {
    const up = base + i;
    const down = base - i;
    if (down < 1 && i > 0) break;
    push(up, Math.max(1, down));
    if (i > 0) push(up, Math.max(1, down - 1));
    if (up > base * 2 || down < 1) break;
  }
  return races;
}

function pickRaceForDiff(
  ratingDiff: number,
  base: RaceChartBase,
  intensity: RaceChartIntensity,
): RacePair {
  const diff = Math.max(0, Math.abs(Math.round(ratingDiff)));
  const p = singleGameWinProb(diff);
  const target = INTENSITY_TARGET[intensity];
  const candidates = candidateRaces(base);

  let best: { race: RacePair; score: number } | null = null;
  for (const race of candidates) {
    const prob = raceWinProb(p, race.higher, race.lower);
    // Never favor the underdog (P(higher) must stay >= 50%).
    if (prob < 0.5 - 1e-9) continue;
    const score = Math.abs(prob - target);
    if (
      !best ||
      score < best.score - 1e-12 ||
      (Math.abs(score - best.score) < 1e-12 &&
        race.higher + race.lower < best.race.higher + best.race.lower)
    ) {
      best = { race, score };
    }
  }

  return best?.race ?? { higher: base, lower: base };
}

function buildComputedBands(
  base: RaceChartBase,
  intensity: RaceChartIntensity,
): RaceBand[] {
  const bands: RaceBand[] = [];
  let current: RacePair | null = null;
  let start = 0;

  for (let diff = 0; diff <= 400; diff++) {
    const race = pickRaceForDiff(diff, base, intensity);
    if (
      !current ||
      current.higher !== race.higher ||
      current.lower !== race.lower
    ) {
      if (current) {
        bands.push({
          minDiff: start,
          maxDiff: diff - 1,
          race: current,
        });
      }
      current = race;
      start = diff;
    }
  }

  if (current) {
    bands.push({
      minDiff: start,
      maxDiff: Number.POSITIVE_INFINITY,
      race: current,
    });
  }
  return bands;
}

const BAND_CACHE = new Map<RaceChartId, RaceBand[]>();

function bandsFor(chartId: RaceChartId): RaceBand[] {
  const official = OFFICIAL_BANDS[chartId];
  if (official) return official;
  const cached = BAND_CACHE.get(chartId);
  if (cached) return cached;
  const meta = raceChartMeta(chartId);
  const bands = buildComputedBands(meta.base, meta.intensity);
  BAND_CACHE.set(chartId, bands);
  return bands;
}

/** Rows for printing a race chart on a scoresheet. */
export function raceChartRows(
  chartId: RaceChartId = DEFAULT_RACE_CHART_ID,
): Array<{ ratingDiff: string; playThis: string }> {
  return bandsFor(chartId).map((band) => ({
    ratingDiff:
      band.maxDiff === Number.POSITIVE_INFINITY
        ? `${band.minDiff} & up`
        : `${band.minDiff} – ${band.maxDiff}`,
    playThis: formatRacePair(band.race),
  }));
}

/** @deprecated Prefer raceChartRows(chartId) */
export function r6HotChartRows(): Array<{ ratingDiff: string; playThis: string }> {
  return raceChartRows("r6-hot");
}

export function raceForRatingDiff(
  chartId: RaceChartId,
  ratingDiff: number,
): RacePair {
  const diff = Math.max(0, Math.abs(Math.round(ratingDiff)));
  const bands = bandsFor(parseRaceChartId(chartId));
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
  const id = parseRaceChartId(chartId);
  const diff = Math.abs(Math.round(ratingA) - Math.round(ratingB));
  const { higher, lower } = raceForRatingDiff(id, diff);
  if (ratingA === ratingB) return { raceA: higher, raceB: higher, diff };
  if (ratingA > ratingB) return { raceA: higher, raceB: lower, diff };
  return { raceA: lower, raceB: higher, diff };
}
