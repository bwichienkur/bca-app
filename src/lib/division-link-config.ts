/**
 * Tableside overrides for a linked division pair.
 * LMS still owns each half’s live sheet; these settings control how Tableside
 * combines standings and how race handicaps are applied on Score.
 */

import type { RaceChartId } from "./race-charts";
import { isRaceChartId } from "./race-charts";

export type DivisionComboRole = "singles" | "teams";

/** LMS standings column used as that half’s night contribution. */
export type StandingScoreMetric = "sets" | "rds" | "pts";

function roleFromDivisionName(
  name: string | null | undefined,
): DivisionComboRole | null {
  const n = (name ?? "").toLowerCase();
  if (!n) return null;
  if (/\bsingles?\b/.test(n)) return "singles";
  if (/\bteams?\b/.test(n)) return "teams";
  return null;
}

export type DivisionLinkStandingSide = {
  role: DivisionComboRole;
  /** Which LMS column feeds the combined night total. */
  metric: StandingScoreMetric;
  /** Multiplier applied to that metric (e.g. Teams rounds × 2). */
  multiplier: number;
  /** Soft cap used in night-hint copy. */
  maxNightPoints: number;
};

export type DivisionLinkScoringSide = {
  /**
   * Tableside scoring format override for this half.
   * null/undefined = infer from role / division name.
   */
  scoringFormatId?: string | null;
  /**
   * Race-chart override when the format uses fargo-race-chart.
   * null/undefined = use the format’s default chart.
   */
  raceChartId?: RaceChartId | null;
};

export type DivisionLinkConfig = {
  standing: {
    primary: DivisionLinkStandingSide;
    linked: DivisionLinkStandingSide;
  };
  scoring: {
    primary: DivisionLinkScoringSide;
    linked: DivisionLinkScoringSide;
  };
};

export const STANDING_METRIC_OPTIONS: Array<{
  id: StandingScoreMetric;
  label: string;
  hint: string;
}> = [
  {
    id: "sets",
    label: "Sets",
    hint: "LMS SETS — race/set wins (Beyond Singles)",
  },
  {
    id: "rds",
    label: "Rounds",
    hint: "LMS RDS — round wins (Beyond Teams)",
  },
  {
    id: "pts",
    label: "Points",
    hint: "LMS PTS — usually games won, not night points",
  },
];

export function defaultStandingSide(
  role: DivisionComboRole,
): DivisionLinkStandingSide {
  if (role === "singles") {
    return {
      role: "singles",
      metric: "sets",
      multiplier: 1,
      maxNightPoints: 3,
    };
  }
  return {
    role: "teams",
    metric: "rds",
    multiplier: 2,
    maxNightPoints: 2,
  };
}

export function defaultScoringSide(
  role: DivisionComboRole,
): DivisionLinkScoringSide {
  if (role === "singles") {
    return {
      scoringFormatId: "beyond-singles",
      raceChartId: "r5-hot",
    };
  }
  return {
    scoringFormatId: "beyond-teams",
    raceChartId: null,
  };
}

export function inferRoleFromDivisionName(
  name: string | null | undefined,
  fallback: DivisionComboRole,
): DivisionComboRole {
  return roleFromDivisionName(name) ?? fallback;
}

/** Build Beyond-style defaults from the two LMS division names. */
export function defaultDivisionLinkConfig(
  primaryName: string,
  linkedName: string,
): DivisionLinkConfig {
  const primaryRole = inferRoleFromDivisionName(primaryName, "singles");
  const linkedRole =
    roleFromDivisionName(linkedName) ??
    (primaryRole === "singles" ? "teams" : "singles");
  return {
    standing: {
      primary: defaultStandingSide(primaryRole),
      linked: defaultStandingSide(linkedRole),
    },
    scoring: {
      primary: defaultScoringSide(primaryRole),
      linked: defaultScoringSide(linkedRole),
    },
  };
}

function clampMultiplier(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.round(n * 100) / 100;
}

function clampMax(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.round(n);
}

function parseMetric(
  value: unknown,
  fallback: StandingScoreMetric,
): StandingScoreMetric {
  if (value === "sets" || value === "rds" || value === "pts") return value;
  return fallback;
}

function parseRole(
  value: unknown,
  fallback: DivisionComboRole,
): DivisionComboRole {
  if (value === "singles" || value === "teams") return value;
  return fallback;
}

function parseRaceChartId(value: unknown): RaceChartId | null {
  if (value == null || value === "" || value === "none") return null;
  return isRaceChartId(String(value)) ? (value as RaceChartId) : null;
}

function normalizeStandingSide(
  raw: Partial<DivisionLinkStandingSide> | null | undefined,
  fallback: DivisionLinkStandingSide,
): DivisionLinkStandingSide {
  return {
    role: parseRole(raw?.role, fallback.role),
    metric: parseMetric(raw?.metric, fallback.metric),
    multiplier: clampMultiplier(raw?.multiplier, fallback.multiplier),
    maxNightPoints: clampMax(raw?.maxNightPoints, fallback.maxNightPoints),
  };
}

function normalizeScoringSide(
  raw: Partial<DivisionLinkScoringSide> | null | undefined,
  fallback: DivisionLinkScoringSide,
): DivisionLinkScoringSide {
  const formatId =
    typeof raw?.scoringFormatId === "string" && raw.scoringFormatId.trim()
      ? raw.scoringFormatId.trim()
      : (fallback.scoringFormatId ?? null);
  return {
    scoringFormatId: formatId,
    raceChartId:
      raw && "raceChartId" in raw
        ? parseRaceChartId(raw.raceChartId)
        : (fallback.raceChartId ?? null),
  };
}

/** Fill missing/legacy link config with inferred Beyond defaults. */
export function normalizeDivisionLinkConfig(
  raw: Partial<DivisionLinkConfig> | null | undefined,
  primaryName: string,
  linkedName: string,
): DivisionLinkConfig {
  const defaults = defaultDivisionLinkConfig(primaryName, linkedName);
  return {
    standing: {
      primary: normalizeStandingSide(
        raw?.standing?.primary,
        defaults.standing.primary,
      ),
      linked: normalizeStandingSide(
        raw?.standing?.linked,
        defaults.standing.linked,
      ),
    },
    scoring: {
      primary: normalizeScoringSide(
        raw?.scoring?.primary,
        defaults.scoring.primary,
      ),
      linked: normalizeScoringSide(
        raw?.scoring?.linked,
        defaults.scoring.linked,
      ),
    },
  };
}

export function standingSideForDivision(
  config: DivisionLinkConfig,
  args: {
    divisionId: string;
    primaryDivisionId: string;
    linkedDivisionId: string;
  },
): DivisionLinkStandingSide {
  if (args.divisionId === args.linkedDivisionId) {
    return config.standing.linked;
  }
  return config.standing.primary;
}

export function scoringSideForDivision(
  config: DivisionLinkConfig,
  args: {
    divisionId: string;
    primaryDivisionId: string;
    linkedDivisionId: string;
  },
): DivisionLinkScoringSide {
  if (args.divisionId === args.linkedDivisionId) {
    return config.scoring.linked;
  }
  return config.scoring.primary;
}

export function standingMetricColumnLabel(
  metric: StandingScoreMetric,
): string {
  if (metric === "sets") return "SETS";
  if (metric === "rds") return "RDS";
  return "PTS";
}

/** Headers for the two raw LMS metric columns (disambiguate if identical). */
export function standingRawColumnHeaders(
  primary: DivisionLinkStandingSide,
  linked: DivisionLinkStandingSide,
): [string, string] {
  const a = standingMetricColumnLabel(primary.metric);
  const b = standingMetricColumnLabel(linked.metric);
  if (a !== b) return [a, b];
  const prefix = (side: DivisionLinkStandingSide) =>
    side.role === "singles" ? "S" : "T";
  return [`${prefix(primary)}-${a}`, `${prefix(linked)}-${b}`];
}

/** STANDING = metricA×multA + metricB×multB */
export function linkConfigStandingFormula(config: DivisionLinkConfig): string {
  const a = config.standing.primary;
  const b = config.standing.linked;
  const [colA, colB] = standingRawColumnHeaders(a, b);
  const term = (col: string, side: DivisionLinkStandingSide) =>
    side.multiplier === 1 ? col : `${col}×${side.multiplier}`;
  return `STANDING = ${term(colA, a)} + ${term(colB, b)}`;
}

export function linkConfigNightHint(config: DivisionLinkConfig): string {
  const a = config.standing.primary;
  const b = config.standing.linked;
  const total = a.maxNightPoints + b.maxNightPoints;
  return `${linkConfigStandingFormula(config)} (${a.maxNightPoints}+${b.maxNightPoints}=${total} pts/night max). Score each LMS sheet separately.`;
}
