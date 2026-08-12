/**
 * Configurable league night scoring formats.
 *
 * LMS still owns live match payloads; these presets describe how *this app*
 * should interpret a division’s night (lineup size, race model, how team
 * points are earned). Pick a preset per division in preferences later, or
 * match by division name heuristics.
 */

import type { RaceChartId } from "./race-charts";

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
 * Beyond Monday teams half: 3-man round-robin race on one scoresheet.
 * LMS awards 1 match point; Tableside combined standings count it as 2 night pts.
 */
export const FORMAT_BEYOND_TEAMS: LeagueScoringFormat = {
  id: "beyond-teams",
  label: "Beyond Teams (RR race)",
  description:
    "Team round-robin race. LMS match win = 1; combined Beyond night awards 2 pts.",
  playersPerTeam: 3,
  matchesPerNight: 1,
  teamPointMode: "match-win",
  pointsPerMatchWin: 2,
  raceMode: "fixed-race",
  fixedRaceWin: 9,
  fixedRaceMaxLoss: 9,
  matchPointsRound: false,
  pointSystem: "1",
};

export const LEAGUE_SCORING_FORMATS: LeagueScoringFormat[] = [
  FORMAT_PALM_BEACH_5,
  FORMAT_TUESDAY_9BALL_R6_HOT,
  FORMAT_BEYOND_SINGLES,
  FORMAT_BEYOND_TEAMS,
];

export function getScoringFormat(id: string | null | undefined): LeagueScoringFormat {
  return (
    LEAGUE_SCORING_FORMATS.find((f) => f.id === id) ?? FORMAT_PALM_BEACH_5
  );
}

/**
 * Lightweight name heuristic until divisions store an explicit format id.
 * Prefer explicit prefs when wired.
 */
export function inferScoringFormatFromDivisionName(
  divisionName: string | null | undefined,
): LeagueScoringFormat {
  const name = (divisionName ?? "").toLowerCase();
  if (name.includes("beyond")) {
    if (/\bsingles?\b/.test(name)) return FORMAT_BEYOND_SINGLES;
    if (/\bteams?\b/.test(name)) return FORMAT_BEYOND_TEAMS;
  }
  if (
    name.includes("9-ball") ||
    name.includes("9 ball") ||
    name.includes("9ball")
  ) {
    if (name.includes("tuesday") || name.includes("tue")) {
      return FORMAT_TUESDAY_9BALL_R6_HOT;
    }
  }
  return FORMAT_PALM_BEACH_5;
}
