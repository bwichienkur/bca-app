/**
 * League night scoring format presets.
 *
 * Built-ins live here. Per-league overrides and custom presets are stored in
 * Redis (see scoring-formats-store) and merged at read time. Pin a preset id
 * on a Night Format leg (preferred) or in account prefs. Name helpers only
 * seed the Night Format operator form.
 */

import { isRaceChartId, type RaceChartId } from "./race-charts";

/** How a completed singles race contributes to the team night score. */
export type TeamPointMode =
  /** Current Palm Beach style: each clinched round (+ optional R6 total-points) scores. */
  | "round-points"
  /** Sheet style: each individual match win = 1 team point; no synthetic R6 points round. */
  | "match-win";

/** How individual game races are determined. */
export type RaceMode =
  /** Fixed race-to (e.g. win 10 / max loss 7) — current 8-ball / points pad. */
  | "fixed-race"
  /** Race-to from a Fargo chart (e.g. R6 Hot); each game won advances one in the race. */
  | "fargo-race-chart";

export type LeagueScoringFormat = {
  id: string;
  label: string;
  description: string;
  /** Players who play a singles match for their team. */
  playersPerTeam: number;
  /** Individual matches / rounds on the night (usually = playersPerTeam). */
  matchesPerNight: number;
  teamPointMode: TeamPointMode;
  /** Points awarded to the team for one won individual match. */
  pointsPerMatchWin: number;
  raceMode: RaceMode;
  /** Used when raceMode === "fixed-race". */
  fixedRaceWin?: number;
  fixedRaceMaxLoss?: number;
  /** Used when raceMode === "fargo-race-chart". */
  raceChartId?: RaceChartId;
  /**
   * Optional first-to team match-point target (e.g. team race to 13).
   * Only meaningful with teamPointMode === "match-win". Individual
   * matchups still use fixedRaceWin / the race chart.
   */
  teamRaceTo?: number;
  /**
   * When true (round-points mode), award a synthetic “match points” round
   * from total game points — current R6 behavior.
   */
  matchPointsRound: boolean;
  /** Handicap expected-points system when using RoundBased HC. */
  pointSystem: "1" | "10" | "17";
};

/** Current app default — 5-player nights, race-to-10 pad, R1–R5 + R6 match pts. */
export const FORMAT_PALM_BEACH_5: LeagueScoringFormat = {
  id: "palm-beach-5",
  label: "Palm Beach 5-player",
  description:
    "Five singles matches. Race to 10 (max loss 7). Round wins plus R6 match-points from total points.",
  playersPerTeam: 5,
  matchesPerNight: 5,
  teamPointMode: "round-points",
  pointsPerMatchWin: 1,
  raceMode: "fixed-race",
  fixedRaceWin: 10,
  fixedRaceMaxLoss: 7,
  matchPointsRound: true,
  pointSystem: "10",
};

/**
 * Tuesday 9-Ball sheet style: 4 individual matches, R6 Hot race chart,
 * each match win = 1 team point (no points-per-game team scoring).
 */
export const FORMAT_TUESDAY_9BALL_R6_HOT: LeagueScoringFormat = {
  id: "tuesday-9ball-r6-hot",
  label: "Tuesday 9-Ball (R6 Hot)",
  description:
    "Four singles matches. Race from the R6 Hot chart (each 9-ball game = one race game). Match winner earns 1 team point.",
  playersPerTeam: 4,
  matchesPerNight: 4,
  teamPointMode: "match-win",
  pointsPerMatchWin: 1,
  raceMode: "fargo-race-chart",
  raceChartId: "r6-hot",
  matchPointsRound: false,
  pointSystem: "1",
};

/**
 * Beyond Monday singles half: 3 players, each race win = 1 team (set) point.
 * Race-tos come from the official Fargo Hot 5 chart (LMS fair-match).
 * RL17 on the LMS sheet is scoresheet capacity, not race-to 17.
 */
export const FORMAT_BEYOND_SINGLES: LeagueScoringFormat = {
  id: "beyond-singles",
  label: "Beyond Singles (Hot 5)",
  description:
    "Three singles races from the Fargo Hot 5 chart. Each race win = 1 set toward the 5-pt Beyond night.",
  playersPerTeam: 3,
  matchesPerNight: 3,
  teamPointMode: "match-win",
  pointsPerMatchWin: 1,
  raceMode: "fargo-race-chart",
  raceChartId: "r5-hot",
  matchPointsRound: false,
  pointSystem: "17",
};

/**
 * Beyond Monday teams half (LMS TEAMS 2026.2): 3-man round-robin sheet.
 * Each GAME S matchup is win/lose (LMS PointsForWin=1 toward the race).
 * First team to 9 matchup wins takes the round (LMS RDS). Combined night
 * standings award that RDS × 2 = 2 standing match points. Remaining
 * matchups need not be scored (AllScoresRequired=0).
 */
export const FORMAT_BEYOND_TEAMS: LeagueScoringFormat = {
  id: "beyond-teams",
  label: "Beyond Teams (race to 9)",
  description:
    "3-man round robin. First to 9 matchup wins takes the round (2 standing match pts).",
  playersPerTeam: 3,
  matchesPerNight: 1,
  teamPointMode: "match-win",
  pointsPerMatchWin: 1,
  raceMode: "fixed-race",
  /** Each matchup is a single game (0/1) — not a race to 9 itself. */
  fixedRaceWin: 1,
  fixedRaceMaxLoss: 0,
  /** Team race: first to this many matchup wins wins the round (RDS). */
  teamRaceTo: 9,
  matchPointsRound: false,
  pointSystem: "1",
};

export const LEAGUE_SCORING_FORMATS: LeagueScoringFormat[] = [
  FORMAT_PALM_BEACH_5,
  FORMAT_TUESDAY_9BALL_R6_HOT,
  FORMAT_BEYOND_SINGLES,
  FORMAT_BEYOND_TEAMS,
];

export const BUILT_IN_SCORING_FORMAT_IDS = new Set(
  LEAGUE_SCORING_FORMATS.map((format) => format.id),
);

export type ScoringFormatSource = "built-in" | "override" | "custom";

export type ScoringFormatListItem = LeagueScoringFormat & {
  source: ScoringFormatSource;
};

/**
 * Merge built-ins with league-stored rows. Same id replaces the built-in
 * (league override). Unknown ids append after built-ins.
 */
export function mergeScoringFormatCatalog(
  custom: readonly LeagueScoringFormat[],
): LeagueScoringFormat[] {
  const byId = new Map(
    LEAGUE_SCORING_FORMATS.map((format) => [format.id, format]),
  );
  for (const format of custom) {
    const normalized = normalizeScoringFormat(format);
    if (normalized) byId.set(normalized.id, normalized);
  }
  const result = LEAGUE_SCORING_FORMATS.map(
    (builtIn) => byId.get(builtIn.id) ?? builtIn,
  );
  for (const format of custom) {
    const id = format.id?.trim();
    if (!id || BUILT_IN_SCORING_FORMAT_IDS.has(id)) continue;
    const normalized = normalizeScoringFormat(format);
    if (normalized) result.push(normalized);
  }
  return result;
}

export function getScoringFormat(
  id: string | null | undefined,
  catalog: readonly LeagueScoringFormat[] = LEAGUE_SCORING_FORMATS,
): LeagueScoringFormat {
  const key = id?.trim();
  if (key) {
    const found = catalog.find((format) => format.id === key);
    if (found) return found;
  }
  const palm =
    catalog.find((format) => format.id === FORMAT_PALM_BEACH_5.id) ??
    FORMAT_PALM_BEACH_5;
  return palm;
}

function asPositiveInt(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.round(n);
}

function asNonNegInt(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.round(n);
}

function parseTeamPointMode(
  value: unknown,
  fallback: TeamPointMode,
): TeamPointMode {
  return value === "match-win" || value === "round-points"
    ? value
    : fallback;
}

function parseRaceMode(value: unknown, fallback: RaceMode): RaceMode {
  return value === "fargo-race-chart" || value === "fixed-race"
    ? value
    : fallback;
}

function parsePointSystem(
  value: unknown,
  fallback: LeagueScoringFormat["pointSystem"],
): LeagueScoringFormat["pointSystem"] {
  return value === "1" || value === "10" || value === "17" ? value : fallback;
}

function slugIdFromLabel(label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug || `sf_${Date.now().toString(36)}`;
}

/**
 * Coerce a partial / stored row into a valid format.
 * Returns null when label (or fallback) cannot produce a usable preset.
 */
export function normalizeScoringFormat(
  raw: Partial<LeagueScoringFormat> | null | undefined,
  fallback: LeagueScoringFormat = FORMAT_PALM_BEACH_5,
): LeagueScoringFormat | null {
  if (!raw || typeof raw !== "object") return null;

  const label =
    typeof raw.label === "string" && raw.label.trim()
      ? raw.label.trim()
      : fallback.label.trim();
  if (!label) return null;

  const idRaw =
    typeof raw.id === "string" && raw.id.trim()
      ? raw.id.trim()
      : fallback.id !== "draft"
        ? fallback.id
        : slugIdFromLabel(label);
  const id = idRaw.slice(0, 64);
  if (!id) return null;

  const raceMode = parseRaceMode(raw.raceMode, fallback.raceMode);
  const teamPointMode = parseTeamPointMode(
    raw.teamPointMode,
    fallback.teamPointMode,
  );
  const playersPerTeam = asPositiveInt(
    raw.playersPerTeam,
    fallback.playersPerTeam,
  );
  const matchesPerNight = asPositiveInt(
    raw.matchesPerNight,
    fallback.matchesPerNight || playersPerTeam,
  );

  const chartCandidate =
    typeof raw.raceChartId === "string" ? raw.raceChartId : fallback.raceChartId;
  const raceChartId =
    raceMode === "fargo-race-chart" && isRaceChartId(chartCandidate)
      ? chartCandidate
      : raceMode === "fargo-race-chart"
        ? (fallback.raceChartId ?? "r6-hot")
        : undefined;

  const fixedRaceWin =
    raceMode === "fixed-race"
      ? asPositiveInt(raw.fixedRaceWin, fallback.fixedRaceWin ?? 10)
      : undefined;
  const fixedRaceMaxLoss =
    raceMode === "fixed-race"
      ? asNonNegInt(raw.fixedRaceMaxLoss, fallback.fixedRaceMaxLoss ?? 0)
      : undefined;

  const teamRaceToRaw =
    raw.teamRaceTo === null || raw.teamRaceTo === undefined
      ? fallback.teamRaceTo
      : raw.teamRaceTo;
  const teamRaceTo =
    teamRaceToRaw === null || teamRaceToRaw === undefined
      ? undefined
      : asPositiveInt(teamRaceToRaw, 0) || undefined;

  return {
    id,
    label,
    description:
      typeof raw.description === "string"
        ? raw.description.trim()
        : fallback.description,
    playersPerTeam,
    matchesPerNight,
    teamPointMode,
    pointsPerMatchWin: asPositiveInt(
      raw.pointsPerMatchWin,
      fallback.pointsPerMatchWin,
    ),
    raceMode,
    ...(fixedRaceWin != null ? { fixedRaceWin } : {}),
    ...(fixedRaceMaxLoss != null ? { fixedRaceMaxLoss } : {}),
    ...(raceChartId ? { raceChartId } : {}),
    ...(teamRaceTo != null ? { teamRaceTo } : {}),
    matchPointsRound: Boolean(
      raw.matchPointsRound ?? fallback.matchPointsRound,
    ),
    pointSystem: parsePointSystem(raw.pointSystem, fallback.pointSystem),
  };
}

/**
 * Name hints used when seeding a Night Format leg in the operator form.
 * Score does not call this — pin play style on the Night Format (or prefs).
 */
export function inferScoringFormatFromDivisionName(
  divisionName: string | null | undefined,
  catalog: readonly LeagueScoringFormat[] = LEAGUE_SCORING_FORMATS,
): LeagueScoringFormat {
  const name = (divisionName ?? "").toLowerCase();
  if (name.includes("beyond")) {
    if (/\bsingles?\b/.test(name)) {
      return getScoringFormat(FORMAT_BEYOND_SINGLES.id, catalog);
    }
    if (/\bteams?\b/.test(name)) {
      return getScoringFormat(FORMAT_BEYOND_TEAMS.id, catalog);
    }
  }
  const nine =
    name.includes("9-ball") ||
    name.includes("9 ball") ||
    name.includes("9ball");
  // Tuesday / FairMatch / "Test Bright 9Ball" style race sheets for form defaults.
  if (
    nine &&
    !/\bmatrix\b/.test(name) &&
    (name.includes("tuesday") ||
      name.includes("tue") ||
      name.includes("fairmatch") ||
      name.includes("9ball"))
  ) {
    return getScoringFormat(FORMAT_TUESDAY_9BALL_R6_HOT.id, catalog);
  }
  return getScoringFormat(FORMAT_PALM_BEACH_5.id, catalog);
}
