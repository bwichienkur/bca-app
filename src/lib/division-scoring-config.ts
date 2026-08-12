/**
 * Resolve how a division night should be scored/handicapped.
 *
 * Priority: Night Format leg override → account prefs → Palm Beach default.
 * LMS match payload still drives live sheet structure; format presets only
 * control race pad / team-point mode / match-points round. Do not guess
 * Tuesday R6 Hot or Beyond from division names or LMS numeric signals —
 * pin those on a Night Format leg (or prefs).
 */

import {
  FORMAT_PALM_BEACH_5,
  getScoringFormat,
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
   * Night Format leg scoring format override (wins over prefs when set).
   */
  linkFormatId?: string | null;
  /** Night Format leg race-chart override. */
  linkRaceChartId?: RaceChartId | null;
};

/**
 * Pick the app scoring preset from Night Format / prefs, else Palm Beach.
 * Optional LMS numeric fields only tweak the resolved preset’s size/points —
 * they never switch the preset itself (no Tuesday / Beyond auto-detect).
 */
export function resolveScoringFormat(
  input: ResolveScoringFormatInput,
): LeagueScoringFormat {
  // Night Format leg beats account prefs so Singles/Teams (or Tuesday) can differ.
  if (input.linkFormatId) {
    const linked = getScoringFormat(input.linkFormatId);
    return applyLmsStructureTweaks(
      applyRaceChartOverride(linked, input.linkRaceChartId),
      input,
    );
  }

  if (input.prefsFormatId) {
    return applyLmsStructureTweaks(
      applyRaceChartOverride(
        getScoringFormat(input.prefsFormatId),
        input.linkRaceChartId,
      ),
      input,
    );
  }

  return applyLmsStructureTweaks(
    applyRaceChartOverride(FORMAT_PALM_BEACH_5, input.linkRaceChartId),
    input,
  );
}

/** Apply lineup size / point-system hints without changing the format preset. */
function applyLmsStructureTweaks(
  format: LeagueScoringFormat,
  input: ResolveScoringFormatInput,
): LeagueScoringFormat {
  const players = input.playersPerTeam;
  const pointsForWin = input.pointsForWin;
  const matchPointsRound = input.matchWinCountsAsRound;

  let next = format;
  if (players != null && players > 0 && players !== format.playersPerTeam) {
    next = {
      ...next,
      playersPerTeam: players,
      matchesPerNight: players,
    };
  }
  if (matchPointsRound != null) {
    next = { ...next, matchPointsRound: Boolean(matchPointsRound) };
  }
  if (pointsForWin === 1 || pointsForWin === 17 || pointsForWin === 10) {
    next = {
      ...next,
      pointSystem: String(pointsForWin) as "1" | "10" | "17",
    };
  }
  return next;
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
      ? format.teamRaceTo && format.fixedRaceWin === 1
        ? `RR race to ${format.teamRaceTo} · round win = standing match pts`
        : format.teamRaceTo
          ? `1 pt per matchup · team race to ${format.teamRaceTo}`
          : `${format.pointsPerMatchWin} pt${format.pointsPerMatchWin === 1 ? "" : "s"} per match win`
      : format.matchPointsRound
        ? "round pts + match-points round"
        : "round points";
  const raceLabel =
    format.teamPointMode === "match-win" &&
    format.teamRaceTo &&
    format.fixedRaceWin === 1
      ? "round-robin matchups"
      : race;
  return `${format.playersPerTeam}/side · ${raceLabel} · ${team}`;
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
 * Chart formats get asymmetric Fargo race-chart targets.
 * Win/lose matchups (fixedRaceWin === 1) stamp race-to-1 so tallies recognize
 * 1–0 / 0–1 without the default 10/7 race rules.
 * Other fixed-race formats clear targets so maxWin/maxLoss (e.g. 10/7) applies.
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
      } else if (format.fixedRaceWin === 1) {
        // Single-game matchups (Beyond Teams): stamp so 1–0 counts as complete.
        raceTargetOne = 1;
        raceTargetTwo = 1;
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

  // Win/lose matchups expose race-to-1 targets so saves + tallies agree.
  const stampWinLose = fixedWin === 1;
  return {
    maxWin: fixedWin,
    maxLoss: fixedLoss,
    raceTargetOne: stampWinLose ? 1 : null,
    raceTargetTwo: stampWinLose ? 1 : null,
    chartMode: false,
  };
}

/** True when the format uses scratch win/lose matchups (no round HC). */
export function formatUsesWinLoseMatchups(format: LeagueScoringFormat): boolean {
  return format.teamPointMode === "match-win" && format.fixedRaceWin === 1;
}
