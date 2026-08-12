/**
 * Resolve how a division night should be scored/handicapped.
 *
 * Priority: explicit prefs → LMS match signals → division-name heuristic → Palm Beach default.
 */

import {
  FORMAT_PALM_BEACH_5,
  FORMAT_TUESDAY_9BALL_R6_HOT,
  getScoringFormat,
  inferScoringFormatFromDivisionName,
  type LeagueScoringFormat,
} from "@/lib/scoring-formats";
import {
  raceChartMeta,
  raceTargetsForPlayers,
  type RaceChartId,
} from "@/lib/race-charts";
import type {
  ScoringDraft,
  ScoringMatchDetail,
  ScoringPlayer,
} from "@/lib/scoring";
import { gameKey } from "@/lib/scoring";

export type ResolveScoringFormatInput = {
  prefsFormatId?: string | null;
  divisionName?: string | null;
  /** LMS players-per-team when known from format template / NumberOfPlayers. */
  playersPerTeam?: number | null;
  /** LMS points-for-win when known. */
  pointsForWin?: number | null;
  /** LMS matchWinCountsAsRound when known. */
  matchWinCountsAsRound?: boolean | null;
  /**
   * Link-level scoring format override for this half (wins over prefs when set).
   * Used so a combined Beyond night can score Singles as Hot 5 and Teams as RR.
   */
  linkFormatId?: string | null;
  /** Link-level race-chart override. */
  linkRaceChartId?: RaceChartId | null;
};

/**
 * Pick the app scoring preset that best matches prefs + LMS signals.
 * LMS match payload still wins for live structure; this drives race pad /
 * team-point mode / whether to show the synthetic match-points round.
 */
export function resolveScoringFormat(
  input: ResolveScoringFormatInput,
): LeagueScoringFormat {
  // Link half override beats account prefs so Singles/Teams can differ.
  if (input.linkFormatId) {
    const linked = getScoringFormat(input.linkFormatId);
    return applyRaceChartOverride(linked, input.linkRaceChartId);
  }

  if (input.prefsFormatId) {
    return applyRaceChartOverride(
      getScoringFormat(input.prefsFormatId),
      input.linkRaceChartId,
    );
  }

  const inferred = inferScoringFormatFromDivisionName(input.divisionName);

  // Strengthen inference from LMS numeric signals when name is ambiguous.
  const players = input.playersPerTeam;
  const pointsForWin = input.pointsForWin;
  const matchPointsRound = input.matchWinCountsAsRound;

  let resolved: LeagueScoringFormat = inferred;

  if (
    inferred.id === FORMAT_TUESDAY_9BALL_R6_HOT.id ||
    (players != null &&
      players > 0 &&
      players <= 4 &&
      pointsForWin === 1 &&
      matchPointsRound === false &&
      !inferred.id.startsWith("beyond-"))
  ) {
    resolved = {
      ...FORMAT_TUESDAY_9BALL_R6_HOT,
      playersPerTeam: players && players > 0 ? players : FORMAT_TUESDAY_9BALL_R6_HOT.playersPerTeam,
      matchesPerNight: players && players > 0 ? players : FORMAT_TUESDAY_9BALL_R6_HOT.matchesPerNight,
    };
  } else if (players != null && players > 0 && players !== FORMAT_PALM_BEACH_5.playersPerTeam) {
    resolved = {
      ...inferred,
      playersPerTeam: players,
      matchesPerNight: players,
      matchPointsRound:
        matchPointsRound == null
          ? inferred.matchPointsRound
          : Boolean(matchPointsRound),
      pointSystem:
        pointsForWin === 1
          ? "1"
          : pointsForWin === 17
            ? "17"
            : inferred.pointSystem,
    };
  } else if (matchPointsRound != null || pointsForWin != null) {
    resolved = {
      ...inferred,
      matchPointsRound:
        matchPointsRound == null
          ? inferred.matchPointsRound
          : Boolean(matchPointsRound),
      pointSystem:
        pointsForWin === 1
          ? "1"
          : pointsForWin === 17
            ? "17"
            : inferred.pointSystem,
    };
  }

  return applyRaceChartOverride(resolved, input.linkRaceChartId);
}

function applyRaceChartOverride(
  format: LeagueScoringFormat,
  raceChartId: RaceChartId | null | undefined,
): LeagueScoringFormat {
  if (!raceChartId) return format;
  return {
    ...format,
    raceMode: "fargo-race-chart",
    raceChartId,
  };
}

/** Legal score chips for a race-to target (0 … target). */
export function raceScoreOptions(raceTo: number): number[] {
  const max = Math.max(1, Math.min(30, Math.round(raceTo)));
  return Array.from({ length: max + 1 }, (_, i) => i);
}

export function chartRaceTargets(
  chartId: RaceChartId,
  ratingOne: number | null | undefined,
  ratingTwo: number | null | undefined,
): { raceOne: number; raceTwo: number; diff: number } {
  const a = ratingOne != null && Number.isFinite(ratingOne) ? ratingOne : 500;
  const b = ratingTwo != null && Number.isFinite(ratingTwo) ? ratingTwo : 500;
  const { raceA, raceB, diff } = raceTargetsForPlayers(chartId, a, b);
  return { raceOne: raceA, raceTwo: raceB, diff };
}

export function formatScoringSummary(format: LeagueScoringFormat): string {
  const race =
    format.raceMode === "fargo-race-chart"
      ? `${raceChartMeta(format.raceChartId ?? "r6-hot").label} race chart`
      : (format.fixedRaceWin ?? 10) <= 1
        ? "single-game matchups"
        : `race to ${format.fixedRaceWin ?? 10}`;
  const team =
    format.teamPointMode === "match-win"
      ? format.teamRaceTo
        ? `team race to ${format.teamRaceTo}`
        : "1 pt per match win"
      : format.matchPointsRound
        ? "round pts + match-points round"
        : "round points";
  return `${format.playersPerTeam}/side · ${race} · ${team}`;
}

function playerRating(
  players: ScoringPlayer[],
  id: string | null | undefined,
): number | null {
  if (!id) return null;
  return players.find((player) => player.id === id)?.fargoRating ?? null;
}

/**
 * Stamp per-game race targets from the active scoring format onto a draft.
 * Chart formats get asymmetric Fargo race-chart targets; fixed-race clears them so
 * maxWin/maxLoss rules apply.
 */
export function applyFormatRaceTargets(
  match: ScoringMatchDetail,
  draft: ScoringDraft,
  format: LeagueScoringFormat,
): ScoringDraft {
  const games: ScoringDraft["games"] = { ...draft.games };
  let changed = false;

  for (const round of match.matchFormat?.rounds ?? []) {
    for (const game of round.games) {
      const key = gameKey(round.roundNumber, game.index);
      const existing = games[key];
      if (!existing) continue;

      let raceTargetOne: number | null = null;
      let raceTargetTwo: number | null = null;

      if (format.raceMode === "fargo-race-chart" && format.raceChartId) {
        const ratingOne = playerRating(
          match.teamOnePlayers,
          existing.teamOnePlayerId,
        );
        const ratingTwo = playerRating(
          match.teamTwoPlayers,
          existing.teamTwoPlayerId,
        );
        const targets = chartRaceTargets(
          format.raceChartId,
          ratingOne,
          ratingTwo,
        );
        raceTargetOne = targets.raceOne;
        raceTargetTwo = targets.raceTwo;
      }

      if (
        (existing.raceTargetOne ?? null) !== raceTargetOne ||
        (existing.raceTargetTwo ?? null) !== raceTargetTwo
      ) {
        games[key] = {
          ...existing,
          raceTargetOne,
          raceTargetTwo,
        };
        changed = true;
      }
    }
  }

  if (!changed) return draft;
  return { ...draft, games };
}

/** Effective race limits for the score pad for one game. */
export function padRaceLimits(
  format: LeagueScoringFormat,
  match: Pick<ScoringMatchDetail, "maxScore" | "maxLosingScore">,
  raceTargetOne?: number | null,
  raceTargetTwo?: number | null,
): {
  maxWin: number;
  maxLoss: number;
  raceTargetOne: number | null;
  raceTargetTwo: number | null;
  chartMode: boolean;
} {
  if (
    format.raceMode === "fargo-race-chart" &&
    raceTargetOne != null &&
    raceTargetTwo != null
  ) {
    return {
      maxWin: Math.max(raceTargetOne, raceTargetTwo),
      maxLoss: Math.max(0, Math.min(raceTargetOne, raceTargetTwo) - 1),
      raceTargetOne,
      raceTargetTwo,
      chartMode: true,
    };
  }

  const fixedWin =
    format.fixedRaceWin && format.fixedRaceWin > 0
      ? format.fixedRaceWin
      : match.maxScore > 0
        ? match.maxScore
        : 10;
  const fixedLoss =
    format.fixedRaceMaxLoss != null && format.fixedRaceMaxLoss >= 0
      ? format.fixedRaceMaxLoss
      : match.maxLosingScore >= 0
        ? match.maxLosingScore
        : 7;

  return {
    maxWin: fixedWin,
    maxLoss: fixedLoss,
    raceTargetOne: null,
    raceTargetTwo: null,
    chartMode: false,
  };
}
