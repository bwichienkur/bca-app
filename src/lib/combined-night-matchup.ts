/**
 * Pair linked-division Singles + Teams halves into one night matchup.
 * Schedule and Score show one card; standing points come from link config.
 */

import {
  canonicalizeTeamKey,
  comboPartLabel,
  comboRoleForDivisionName,
  type DivisionComboRole,
} from "./division-combos";
import type {
  DivisionLinkConfig,
  DivisionLinkStandingSide,
} from "./division-link-config";
import { standingMetricColumnLabel } from "./division-link-config";
import { matchRoundRaw, type NightHalfStatus } from "./night-standing";
import type { DraftBoardSummary, ScoringMatchSummary } from "./scoring";
import type { ScheduleMatch } from "./types";

export type CombinedHalfKind = "singles" | "teams";

export type CombinedScheduleHalf = {
  kind: CombinedHalfKind;
  match: ScheduleMatch;
};

export type CombinedScheduleMatchup = {
  key: string;
  date: string;
  homeName: string;
  awayName: string;
  location: string | null;
  halves: CombinedScheduleHalf[];
  /** True when both Singles and Teams sheets are present. */
  completePair: boolean;
};

export type CombinedScoreHalf = {
  kind: CombinedHalfKind;
  match: ScoringMatchSummary;
};

export type CombinedScoreMatchup = {
  key: string;
  nightKey: string;
  homeName: string;
  awayName: string;
  location: string | null;
  halves: CombinedScoreHalf[];
  completePair: boolean;
  isMyMatch: boolean;
  mySide: 1 | 2 | null;
};

export type MatchupStandingScores = {
  homeStanding: number;
  awayStanding: number;
  standingMax: number;
  status: NightHalfStatus;
  line: string;
  homeBreakdown: string;
  awayBreakdown: string;
};

function displayTeamName(name: string): string {
  return name.replace(/^\((H|A)\)\s*/i, "").trim();
}

function pairKey(teamA: string, teamB: string): string {
  const a = canonicalizeTeamKey(teamA);
  const b = canonicalizeTeamKey(teamB);
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function halfKindFromDivisionName(
  divisionName: string | null | undefined,
  partLabel?: string | null,
): CombinedHalfKind | null {
  const fromLabel = (partLabel ?? "").toLowerCase();
  if (fromLabel === "singles") return "singles";
  if (fromLabel === "teams") return "teams";
  const role = comboRoleForDivisionName(divisionName);
  if (role === "singles" || role === "teams") return role;
  const fromPart = (comboPartLabel(divisionName) ?? "").toLowerCase();
  if (fromPart === "singles") return "singles";
  if (fromPart === "teams") return "teams";
  return null;
}

function standingSideForKind(
  config: DivisionLinkConfig,
  kind: CombinedHalfKind,
): DivisionLinkStandingSide {
  if (config.standing.primary.role === kind) return config.standing.primary;
  if (config.standing.linked.role === kind) return config.standing.linked;
  return kind === "singles"
    ? config.standing.primary
    : config.standing.linked;
}

function formatPts(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return String(Math.round(value * 10) / 10);
}

/**
 * Collapse schedule rows for one date into combined matchups when linked.
 */
export function combineScheduleMatchupsForDay(args: {
  date: string;
  matches: ScheduleMatch[];
  linked: boolean;
}): CombinedScheduleMatchup[] {
  if (!args.linked) {
    return args.matches.map((match, index) => ({
      key: `${args.date}:solo:${match.matchId ?? index}`,
      date: args.date,
      homeName: displayTeamName(match.home),
      awayName: displayTeamName(match.away),
      location: match.location?.trim() || null,
      halves: [
        {
          kind: halfKindFromDivisionName(match.divisionName, match.partLabel) ?? "singles",
          match,
        },
      ],
      completePair: false,
    }));
  }

  const byPair = new Map<string, ScheduleMatch[]>();
  for (const match of args.matches) {
    if (/bye/i.test(`${match.home} ${match.away}`)) {
      // Keep bye rows as solo cards so they don't pair oddly.
      const key = `${args.date}:bye:${canonicalizeTeamKey(match.home)}:${canonicalizeTeamKey(match.away)}:${match.divisionId ?? ""}`;
      byPair.set(key, [...(byPair.get(key) ?? []), match]);
      continue;
    }
    const key = `${args.date}:${pairKey(match.home, match.away)}`;
    byPair.set(key, [...(byPair.get(key) ?? []), match]);
  }

  const rows: CombinedScheduleMatchup[] = [];
  for (const [key, matches] of byPair) {
    const halves: CombinedScheduleHalf[] = [];
    for (const match of matches) {
      const kind = halfKindFromDivisionName(match.divisionName, match.partLabel);
      if (!kind) continue;
      if (!halves.some((half) => half.kind === kind)) {
        halves.push({ kind, match });
      }
    }
    halves.sort((a, b) => (a.kind === "singles" ? 0 : 1) - (b.kind === "singles" ? 0 : 1));
    const anchor = halves.find((h) => h.kind === "singles")?.match ?? matches[0]!;
    // Orient home/away by the singles sheet when present.
    const homeName = displayTeamName(anchor.home);
    const awayName = displayTeamName(anchor.away);
    rows.push({
      key,
      date: args.date,
      homeName,
      awayName,
      location:
        halves.map((h) => h.match.location?.trim()).find(Boolean) ?? null,
      halves,
      completePair:
        halves.some((h) => h.kind === "singles") &&
        halves.some((h) => h.kind === "teams"),
    });
  }

  return rows.sort(
    (a, b) =>
      a.homeName.localeCompare(b.homeName) || a.awayName.localeCompare(b.awayName),
  );
}

/**
 * Collapse scoring matches for one night into combined matchups.
 */
export function combineScoreMatchupsForNight(args: {
  nightKey: string;
  matches: ScoringMatchSummary[];
  linked: boolean;
}): CombinedScoreMatchup[] {
  if (!args.linked) {
    return args.matches.map((match) => ({
      key: `${args.nightKey}:solo:${match.id}`,
      nightKey: args.nightKey,
      homeName: displayTeamName(match.teamOneName),
      awayName: displayTeamName(match.teamTwoName),
      location: match.location?.trim() || null,
      halves: [
        {
          kind:
            halfKindFromDivisionName(match.divisionName) ??
            ("singles" as const),
          match,
        },
      ],
      completePair: false,
      isMyMatch: match.mySide != null,
      mySide: match.mySide,
    }));
  }

  const byPair = new Map<string, ScoringMatchSummary[]>();
  for (const match of args.matches) {
    if (/bye/i.test(`${match.teamOneName} ${match.teamTwoName}`)) {
      const key = `${args.nightKey}:bye:${match.id}`;
      byPair.set(key, [match]);
      continue;
    }
    const key = `${args.nightKey}:${pairKey(match.teamOneName, match.teamTwoName)}`;
    byPair.set(key, [...(byPair.get(key) ?? []), match]);
  }

  const rows: CombinedScoreMatchup[] = [];
  for (const [key, matches] of byPair) {
    const halves: CombinedScoreHalf[] = [];
    for (const match of matches) {
      const kind = halfKindFromDivisionName(match.divisionName);
      if (!kind) continue;
      if (!halves.some((half) => half.kind === kind)) {
        halves.push({ kind, match });
      }
    }
    halves.sort((a, b) => (a.kind === "singles" ? 0 : 1) - (b.kind === "singles" ? 0 : 1));
    const anchor = halves.find((h) => h.kind === "singles")?.match ?? matches[0]!;
    const homeName = displayTeamName(anchor.teamOneName);
    const awayName = displayTeamName(anchor.teamTwoName);
    const homeKey = canonicalizeTeamKey(homeName);
    const mySide = (() => {
      for (const half of halves) {
        if (half.match.mySide == null) continue;
        const myName =
          half.match.mySide === 1
            ? displayTeamName(half.match.teamOneName)
            : displayTeamName(half.match.teamTwoName);
        return canonicalizeTeamKey(myName) === homeKey ? 1 : 2;
      }
      return null;
    })();

    rows.push({
      key,
      nightKey: args.nightKey,
      homeName,
      awayName,
      location:
        halves.map((h) => h.match.location?.trim()).find(Boolean) ?? null,
      halves,
      completePair:
        halves.some((h) => h.kind === "singles") &&
        halves.some((h) => h.kind === "teams"),
      isMyMatch: mySide != null,
      mySide,
    });
  }

  return rows.sort((a, b) => {
    if (a.isMyMatch !== b.isMyMatch) return a.isMyMatch ? -1 : 1;
    const aDone = a.halves.every((h) => h.match.hasBeenPlayed);
    const bDone = b.halves.every((h) => h.match.hasBeenPlayed);
    if (aDone !== bDone) return aDone ? 1 : -1;
    return a.homeName.localeCompare(b.homeName);
  });
}

function halfStandingForTeam(args: {
  side: DivisionLinkStandingSide;
  teamOneWins: number;
  teamTwoWins: number;
  team: 1 | 2;
  started: boolean;
  complete: boolean;
  teamRaceTo?: number | null;
}): { raw: number | null; pts: number; label: string } {
  const {
    side,
    teamOneWins,
    teamTwoWins,
    team,
    started,
    complete,
    teamRaceTo,
  } = args;
  const myWins = team === 1 ? teamOneWins : teamTwoWins;
  const oppWins = team === 1 ? teamTwoWins : teamOneWins;
  let raw: number | null = null;
  if (side.metric === "sets" || side.metric === "pts") {
    raw = started || complete ? myWins : null;
  } else {
    raw = matchRoundRaw({
      myWins,
      oppWins,
      complete,
      started,
      teamRaceTo: side.role === "teams" ? (teamRaceTo ?? 9) : null,
    });
  }
  const pts = raw == null ? 0 : Math.round(raw * side.multiplier * 100) / 100;
  const metric = standingMetricColumnLabel(side.metric);
  const label =
    side.multiplier === 1
      ? `${formatPts(raw ?? 0)} ${metric}`
      : `${formatPts(raw ?? 0)} ${metric}×${side.multiplier}`;
  return { raw, pts, label };
}

function orientWinsToMatchupHome(args: {
  matchupHomeKey: string;
  match: ScoringMatchSummary;
  summary: DraftBoardSummary | null;
}): { teamOneWins: number; teamTwoWins: number } {
  const matchHomeKey = canonicalizeTeamKey(args.match.teamOneName);
  const one = args.summary?.teamOneRoundWins ?? 0;
  const two = args.summary?.teamTwoRoundWins ?? 0;
  if (matchHomeKey === args.matchupHomeKey) {
    return { teamOneWins: one, teamTwoWins: two };
  }
  // Sheets can flip home/away vs the singles anchor.
  return { teamOneWins: two, teamTwoWins: one };
}

/**
 * Standing points for both teams in a combined matchup (link metrics×multipliers).
 */
export function computeMatchupStandingScores(args: {
  config: DivisionLinkConfig;
  matchup: CombinedScoreMatchup;
  summaryFor: (matchId: string) => DraftBoardSummary | null;
  statusFor: (match: ScoringMatchSummary) => NightHalfStatus;
}): MatchupStandingScores {
  const homeKey = canonicalizeTeamKey(args.matchup.homeName);
  let homeStanding = 0;
  let awayStanding = 0;
  const homeBits: string[] = [];
  const awayBits: string[] = [];
  let anyStarted = false;
  let allComplete = args.matchup.halves.length > 0;

  for (const kind of ["singles", "teams"] as CombinedHalfKind[]) {
    const side = standingSideForKind(args.config, kind);
    const half = args.matchup.halves.find((row) => row.kind === kind) ?? null;
    if (!half) {
      allComplete = false;
      continue;
    }
    const status = args.statusFor(half.match);
    const summary = args.summaryFor(half.match.id);
    const started =
      status === "in_progress" ||
      status === "complete" ||
      (summary != null &&
        ((summary.gamesStarted ?? 0) > 0 || summary.gamesScored > 0));
    const complete = status === "complete" || half.match.hasBeenPlayed;
    if (started) anyStarted = true;
    if (!complete) allComplete = false;

    const oriented = orientWinsToMatchupHome({
      matchupHomeKey: homeKey,
      match: half.match,
      summary,
    });
    const teamRaceTo = kind === "teams" ? 9 : null;
    const home = halfStandingForTeam({
      side,
      ...oriented,
      team: 1,
      started,
      complete,
      teamRaceTo,
    });
    const away = halfStandingForTeam({
      side,
      ...oriented,
      team: 2,
      started,
      complete,
      teamRaceTo,
    });
    homeStanding += home.pts;
    awayStanding += away.pts;
    homeBits.push(home.label);
    awayBits.push(away.label);
  }

  const standingMax =
    args.config.standing.primary.maxNightPoints +
    args.config.standing.linked.maxNightPoints;

  homeStanding = Math.round(homeStanding * 100) / 100;
  awayStanding = Math.round(awayStanding * 100) / 100;

  const status: NightHalfStatus = allComplete
    ? "complete"
    : anyStarted
      ? "in_progress"
      : "not_started";

  return {
    homeStanding,
    awayStanding,
    standingMax,
    status,
    line: `${formatPts(homeStanding)}–${formatPts(awayStanding)} standing pts (max ${formatPts(standingMax)})`,
    homeBreakdown: homeBits.join(" + ") || "–",
    awayBreakdown: awayBits.join(" + ") || "–",
  };
}

export function combinedMatchupPrimaryMatchId(
  matchup: CombinedScoreMatchup,
): string | null {
  return (
    matchup.halves.find((h) => h.kind === "singles")?.match.id ??
    matchup.halves[0]?.match.id ??
    null
  );
}

export function roleLabel(role: DivisionComboRole): string {
  return role === "singles" ? "Singles" : "Teams";
}
