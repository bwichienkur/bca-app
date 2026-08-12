/**
 * Live night standing contribution for a linked division pair.
 * Computes STANDING points from Score drafts / board summaries using the
 * link’s standing metrics + multipliers (e.g. SETS×1 + RDS×2).
 */

import {
  comboPartLabel,
  comboRoleForDivisionName,
  type DivisionComboRole,
} from "./division-combos";
import type {
  DivisionLinkConfig,
  DivisionLinkStandingSide,
  StandingScoreMetric,
} from "./division-link-config";
import {
  standingMetricColumnLabel,
  standingSideForDivision,
} from "./division-link-config";
import type { DraftBoardSummary, ScoringMatchSummary } from "./scoring";

export type NightHalfStatus =
  | "missing"
  | "not_started"
  | "in_progress"
  | "complete";

export type NightHalfContribution = {
  role: DivisionComboRole;
  partLabel: string;
  matchId: string | null;
  divisionId: string | null;
  divisionName: string;
  metric: StandingScoreMetric;
  metricLabel: string;
  multiplier: number;
  maxNightPoints: number;
  /** Raw LMS-style value (sets won, or 0/1/0.5 round win). */
  raw: number | null;
  /** Typical max for the raw metric this night (e.g. 3 sets, 1 round). */
  rawMax: number;
  /** raw × multiplier (0 when raw is null). */
  standingPts: number;
  opponentName: string | null;
  status: NightHalfStatus;
  /** Scoreboard race/game wins for display (not always the standing metric). */
  myScore: number;
  oppScore: number;
};

export type NightStandingSummary = {
  halves: NightHalfContribution[];
  standingPts: number;
  standingMax: number;
  /** e.g. "2/3 SETS ×1 + 0/1 RDS ×2 = 2" */
  line: string;
  /** Short headline e.g. "2 / 5 standing pts" */
  headline: string;
};

function roleLabel(role: DivisionComboRole): string {
  return role === "singles" ? "Singles" : "Teams";
}

function rawMaxForSide(side: DivisionLinkStandingSide): number {
  if (side.multiplier > 0) {
    const fromCap = side.maxNightPoints / side.multiplier;
    if (Number.isFinite(fromCap) && fromCap > 0) return fromCap;
  }
  if (side.metric === "rds") return 1;
  if (side.metric === "sets") return side.maxNightPoints || 3;
  return side.maxNightPoints || 0;
}

/**
 * Match-win / round contribution for RDS-style metrics.
 * Ties count as 0.5 when the half is complete (LMS UseHalfForTiedRound).
 *
 * When `teamRaceTo` is set (Beyond Teams), RDS is awarded only after a side
 * reaches that many matchup wins — not on the first lead in the race.
 */
export function matchRoundRaw(args: {
  myWins: number;
  oppWins: number;
  complete: boolean;
  started: boolean;
  /** First-to matchup-win target for the sheet (e.g. 9). */
  teamRaceTo?: number | null;
}): number | null {
  const { myWins, oppWins, complete, started, teamRaceTo } = args;
  if (!started && !complete) return null;

  if (teamRaceTo != null && teamRaceTo > 0) {
    const myHit = myWins >= teamRaceTo;
    const oppHit = oppWins >= teamRaceTo;
    if (myHit && !oppHit) return 1;
    if (oppHit && !myHit) return 0;
    if (myHit && oppHit) {
      if (myWins > oppWins) return 1;
      if (oppWins > myWins) return 0;
      return complete ? 0.5 : null;
    }
    if (complete) {
      if (myWins > oppWins) return 1;
      if (oppWins > myWins) return 0;
      return 0.5;
    }
    return null;
  }

  if (myWins > oppWins) return 1;
  if (oppWins > myWins) return 0;
  if (complete) return 0.5;
  return null;
}

function formatRaw(value: number | null): string {
  if (value == null) return "–";
  if (Number.isInteger(value)) return String(value);
  return String(Math.round(value * 10) / 10);
}

function halfLine(half: NightHalfContribution): string {
  const rawBit = `${formatRaw(half.raw)}/${formatRaw(half.rawMax)} ${half.metricLabel}`;
  if (half.multiplier === 1) return rawBit;
  return `${rawBit} ×${half.multiplier}`;
}

export function formatNightStandingLine(halves: NightHalfContribution[]): string {
  const parts = halves.map(halfLine);
  const total = halves.reduce((sum, half) => sum + half.standingPts, 0);
  const totalLabel = Number.isInteger(total)
    ? String(total)
    : String(Math.round(total * 10) / 10);
  return `${parts.join(" + ")} = ${totalLabel}`;
}

function resolveStandingSide(
  config: DivisionLinkConfig,
  match: ScoringMatchSummary,
  link: {
    primaryDivisionId: string;
    linkedDivisionId: string;
  },
): DivisionLinkStandingSide {
  const fromId = standingSideForDivision(config, {
    divisionId: match.divisionId,
    primaryDivisionId: link.primaryDivisionId,
    linkedDivisionId: link.linkedDivisionId,
  });
  const role =
    comboRoleForDivisionName(match.divisionName) ?? fromId.role;
  if (role === fromId.role) return fromId;
  // Prefer role inferred from LMS name when link sides were swapped.
  const other =
    config.standing.primary.role === role
      ? config.standing.primary
      : config.standing.linked.role === role
        ? config.standing.linked
        : fromId;
  return other;
}

function contributionForHalf(args: {
  side: DivisionLinkStandingSide;
  match: ScoringMatchSummary | null;
  summary: DraftBoardSummary | null;
  status: NightHalfStatus;
  /** Beyond Teams: only award RDS after race-to-N matchup wins. */
  teamRaceTo?: number | null;
}): NightHalfContribution {
  const { side, match, summary, status, teamRaceTo } = args;
  const rawMax = rawMaxForSide(side);
  const mySide = match?.mySide ?? null;
  const myScore =
    mySide === 1
      ? (summary?.teamOneRoundWins ?? 0)
      : mySide === 2
        ? (summary?.teamTwoRoundWins ?? 0)
        : 0;
  const oppScore =
    mySide === 1
      ? (summary?.teamTwoRoundWins ?? 0)
      : mySide === 2
        ? (summary?.teamOneRoundWins ?? 0)
        : 0;
  const started =
    status === "in_progress" ||
    status === "complete" ||
    (summary != null &&
      ((summary.gamesStarted ?? 0) > 0 || summary.gamesScored > 0));
  const complete = status === "complete" || match?.hasBeenPlayed === true;

  let raw: number | null = null;
  if (side.metric === "sets" || side.metric === "pts") {
    if (started || complete) raw = myScore;
    else raw = null;
  } else {
    // rds — sheet/round win for the half (race-to-N when configured)
    raw = matchRoundRaw({
      myWins: myScore,
      oppWins: oppScore,
      complete,
      started,
      teamRaceTo: side.role === "teams" ? teamRaceTo : null,
    });
  }

  const standingPts =
    raw == null ? 0 : Math.round(raw * side.multiplier * 100) / 100;

  const opponentName = match
    ? mySide === 1
      ? match.teamTwoName
      : mySide === 2
        ? match.teamOneName
        : null
    : null;

  return {
    role: side.role,
    partLabel: roleLabel(side.role),
    matchId: match?.id ?? null,
    divisionId: match?.divisionId ?? null,
    divisionName: match?.divisionName ?? roleLabel(side.role),
    metric: side.metric,
    metricLabel: standingMetricColumnLabel(side.metric),
    multiplier: side.multiplier,
    maxNightPoints: side.maxNightPoints,
    raw,
    rawMax,
    standingPts,
    opponentName,
    status: match ? status : "missing",
    myScore,
    oppScore,
  };
}

/**
 * Build my-team night standing from the two link halves + live board data.
 * Expects only matches where mySide != null for this night.
 */
export function computeNightStanding(args: {
  config: DivisionLinkConfig;
  primaryDivisionId: string;
  linkedDivisionId: string;
  myMatches: ScoringMatchSummary[];
  summaryFor: (matchId: string) => DraftBoardSummary | null;
  statusFor: (match: ScoringMatchSummary) => NightHalfStatus;
  /** Teams half race-to target (Beyond Monday = 9). */
  teamsRaceTo?: number | null;
}): NightStandingSummary {
  const sides = [
    args.config.standing.primary,
    args.config.standing.linked,
  ];

  // Dedupe by role — prefer the match whose division maps to that role.
  const halves = sides.map((side) => {
    const match =
      args.myMatches.find((item) => {
        const resolved = resolveStandingSide(args.config, item, {
          primaryDivisionId: args.primaryDivisionId,
          linkedDivisionId: args.linkedDivisionId,
        });
        return resolved.role === side.role;
      }) ??
      args.myMatches.find((item) => {
        const label = (comboPartLabel(item.divisionName) ?? "").toLowerCase();
        return label === side.role;
      }) ??
      null;
    const summary = match ? args.summaryFor(match.id) : null;
    const status = match ? args.statusFor(match) : "missing";
    // Use the side from config (canonical multipliers) but keep role.
    return contributionForHalf({
      side,
      match,
      summary,
      status,
      teamRaceTo: args.teamsRaceTo ?? 9,
    });
  });

  const standingPts =
    Math.round(halves.reduce((sum, half) => sum + half.standingPts, 0) * 100) /
    100;
  const standingMax = halves.reduce(
    (sum, half) => sum + half.maxNightPoints,
    0,
  );
  const line = formatNightStandingLine(halves);
  const ptsLabel = Number.isInteger(standingPts)
    ? String(standingPts)
    : String(standingPts);
  const maxLabel = Number.isInteger(standingMax)
    ? String(standingMax)
    : String(standingMax);

  return {
    halves,
    standingPts,
    standingMax,
    line,
    headline: `${ptsLabel} / ${maxLabel} standing pts`,
  };
}
