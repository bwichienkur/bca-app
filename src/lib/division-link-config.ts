/**
 * Tableside Night Format config for linked LMS divisions ("legs").
 * LMS still owns each leg’s live sheet; these settings control how Tableside
 * combines standings and how race handicaps are applied on Score.
 */

import type { RaceChartId } from "./race-charts";
import { isRaceChartId } from "./race-charts";

export type DivisionComboRole = "singles" | "teams";

/** LMS standings column used as that leg’s night contribution. */
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

/** Standing contribution for one night leg. */
export type DivisionLinkStandingSide = {
  /** Optional Beyond-style role hint (singles/teams). */
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
   * Tableside scoring format override for this leg.
   * null/undefined = infer from role / division name.
   */
  scoringFormatId?: string | null;
  /**
   * Race-chart override when the format uses fargo-race-chart.
   * null/undefined = use the format’s default chart.
   */
  raceChartId?: RaceChartId | null;
};

/**
 * One scored LMS division inside a Night Format.
 * A night can have 1..N legs (Beyond uses 2).
 */
export type NightLeg = {
  /** Stable id within the night (e.g. "singles", "teams", "leg-3"). */
  id: string;
  /** Player-facing tab / badge label. */
  label: string;
  divisionId: string;
  divisionName: string;
  standing: DivisionLinkStandingSide;
  scoring: DivisionLinkScoringSide;
};

/**
 * Legacy 2-side config shape (primary + linked).
 * Still filled from legs[0]/legs[1] for older readers.
 */
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

export function legLabelForRole(role: DivisionComboRole): string {
  return role === "singles" ? "Singles" : "Teams";
}

export function slugifyLegId(label: string, fallbackIndex: number): string {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || `leg-${fallbackIndex + 1}`;
}

/** Build a night leg from an LMS division name (Beyond-aware defaults). */
export function defaultNightLeg(args: {
  divisionId: string;
  divisionName: string;
  index: number;
  usedRoles?: Set<DivisionComboRole>;
}): NightLeg {
  const inferred = roleFromDivisionName(args.divisionName);
  let role: DivisionComboRole =
    inferred ?? (args.index === 0 ? "singles" : "teams");
  if (args.usedRoles?.has(role)) {
    role = role === "singles" ? "teams" : "singles";
  }
  const label = inferred
    ? legLabelForRole(inferred)
    : args.divisionName.trim() || legLabelForRole(role);
  return {
    id: slugifyLegId(label, args.index),
    label,
    divisionId: args.divisionId,
    divisionName: args.divisionName,
    standing: defaultStandingSide(role),
    scoring: defaultScoringSide(role),
  };
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

export function defaultLegsFromPair(
  primaryId: string,
  primaryName: string,
  linkedId: string,
  linkedName: string,
): NightLeg[] {
  const used = new Set<DivisionComboRole>();
  const first = defaultNightLeg({
    divisionId: primaryId,
    divisionName: primaryName,
    index: 0,
    usedRoles: used,
  });
  used.add(first.standing.role);
  const second = defaultNightLeg({
    divisionId: linkedId,
    divisionName: linkedName,
    index: 1,
    usedRoles: used,
  });
  // Ensure unique ids
  if (second.id === first.id) {
    second.id = `${second.id}-2`;
  }
  return [first, second];
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

export function normalizeNightLeg(
  raw: Partial<NightLeg> | null | undefined,
  index: number,
  fallbackDivisionName = "",
): NightLeg | null {
  const divisionId = String(raw?.divisionId ?? "").trim();
  if (!divisionId) return null;
  const divisionName =
    String(raw?.divisionName ?? "").trim() || fallbackDivisionName || divisionId;
  const role = parseRole(
    raw?.standing?.role ?? roleFromDivisionName(divisionName),
    index === 0 ? "singles" : "teams",
  );
  const defaults = defaultNightLeg({
    divisionId,
    divisionName,
    index,
  });
  const label =
    String(raw?.label ?? "").trim() ||
    defaults.label ||
    legLabelForRole(role);
  const id =
    String(raw?.id ?? "").trim() || slugifyLegId(label, index);
  return {
    id,
    label,
    divisionId,
    divisionName,
    standing: normalizeStandingSide(raw?.standing, {
      ...defaults.standing,
      role,
    }),
    scoring: normalizeScoringSide(raw?.scoring, defaults.scoring),
  };
}

/** Normalize a legs array; ensure unique ids. */
export function normalizeNightLegs(
  raw: Array<Partial<NightLeg>> | null | undefined,
): NightLeg[] {
  const legs: NightLeg[] = [];
  const usedIds = new Set<string>();
  for (let i = 0; i < (raw?.length ?? 0); i += 1) {
    const leg = normalizeNightLeg(raw![i], i);
    if (!leg) continue;
    let id = leg.id;
    if (usedIds.has(id)) id = `${id}-${i + 1}`;
    usedIds.add(id);
    legs.push({ ...leg, id });
  }
  return legs;
}

/** Build legacy primary/linked config mirrors from legs. */
export function configFromLegs(legs: NightLeg[]): DivisionLinkConfig {
  const a = legs[0];
  const b = legs[1];
  if (!a) {
    return defaultDivisionLinkConfig("Singles", "Teams");
  }
  if (!b) {
    const otherRole = a.standing.role === "singles" ? "teams" : "singles";
    return {
      standing: {
        primary: a.standing,
        linked: defaultStandingSide(otherRole),
      },
      scoring: {
        primary: a.scoring,
        linked: defaultScoringSide(otherRole),
      },
    };
  }
  return {
    standing: { primary: a.standing, linked: b.standing },
    scoring: { primary: a.scoring, linked: b.scoring },
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

/** Look up standing/scoring for a division id from legs (preferred). */
export function legForDivision(
  legs: NightLeg[],
  divisionId: string | null | undefined,
): NightLeg | null {
  if (!divisionId) return null;
  return legs.find((leg) => leg.divisionId === divisionId) ?? null;
}

export function standingMetricColumnLabel(
  metric: StandingScoreMetric,
): string {
  if (metric === "sets") return "SETS";
  if (metric === "rds") return "RDS";
  return "PTS";
}

/** Headers for raw LMS metric columns (disambiguate duplicates). */
export function standingRawColumnHeadersForLegs(legs: NightLeg[]): string[] {
  const labels = legs.map((leg) => standingMetricColumnLabel(leg.standing.metric));
  return labels.map((label, index) => {
    const dup = labels.filter((l) => l === label).length > 1;
    if (!dup) return label;
    const prefix =
      legs[index]!.standing.role === "singles"
        ? "S"
        : legs[index]!.standing.role === "teams"
          ? "T"
          : `L${index + 1}`;
    return `${prefix}-${label}`;
  });
}

/** Headers for the two raw LMS metric columns (disambiguate if identical). */
export function standingRawColumnHeaders(
  primary: DivisionLinkStandingSide,
  linked: DivisionLinkStandingSide,
): [string, string] {
  const headers = standingRawColumnHeadersForLegs([
    {
      id: "primary",
      label: legLabelForRole(primary.role),
      divisionId: "primary",
      divisionName: "",
      standing: primary,
      scoring: {},
    },
    {
      id: "linked",
      label: legLabelForRole(linked.role),
      divisionId: "linked",
      divisionName: "",
      standing: linked,
      scoring: {},
    },
  ]);
  return [headers[0]!, headers[1]!];
}

function standingTerm(col: string, side: DivisionLinkStandingSide): string {
  return side.multiplier === 1 ? col : `${col}×${side.multiplier}`;
}

/** STANDING = Σ (metric × multiplier) across legs. */
export function legsStandingFormula(legs: NightLeg[]): string {
  if (legs.length === 0) return "STANDING = —";
  const headers = standingRawColumnHeadersForLegs(legs);
  const terms = legs.map((leg, i) =>
    standingTerm(headers[i]!, leg.standing),
  );
  return `STANDING = ${terms.join(" + ")}`;
}

/** STANDING = metricA×multA + metricB×multB */
export function linkConfigStandingFormula(config: DivisionLinkConfig): string {
  return legsStandingFormula([
    {
      id: "primary",
      label: legLabelForRole(config.standing.primary.role),
      divisionId: "primary",
      divisionName: "",
      standing: config.standing.primary,
      scoring: config.scoring.primary,
    },
    {
      id: "linked",
      label: legLabelForRole(config.standing.linked.role),
      divisionId: "linked",
      divisionName: "",
      standing: config.standing.linked,
      scoring: config.scoring.linked,
    },
  ]);
}

export function legsNightHint(legs: NightLeg[]): string {
  if (legs.length === 0) return "No legs configured.";
  const caps = legs.map((leg) => leg.standing.maxNightPoints);
  const total = caps.reduce((sum, n) => sum + n, 0);
  const capText = caps.join("+") + `=${total}`;
  return `${legsStandingFormula(legs)} (${capText} pts/night max). Score each LMS sheet separately.`;
}

export function linkConfigNightHint(config: DivisionLinkConfig): string {
  return legsNightHint([
    {
      id: "primary",
      label: legLabelForRole(config.standing.primary.role),
      divisionId: "primary",
      divisionName: "",
      standing: config.standing.primary,
      scoring: config.scoring.primary,
    },
    {
      id: "linked",
      label: legLabelForRole(config.standing.linked.role),
      divisionId: "linked",
      divisionName: "",
      standing: config.standing.linked,
      scoring: config.scoring.linked,
    },
  ]);
}

export function nightStandingMax(legs: NightLeg[]): number {
  return legs.reduce((sum, leg) => sum + leg.standing.maxNightPoints, 0);
}
