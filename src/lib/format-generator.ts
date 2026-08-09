/**
 * Easy in-app scoring + handicap format generator.
 * Maps a few picks → LMS FormatTemplate DSL + app LeagueScoringFormat + division hints.
 */

import { formatScoringSummary } from "@/lib/division-scoring-config";
import {
  serializeFormatTemplate,
  type FormatTemplateModel,
} from "@/lib/lms-format-template";
import {
  buildDoublesRaceTemplate,
  buildRoundRobinTemplate,
  buildTuesdayRacesTemplate,
} from "@/lib/lms-scoresheet-presets";
import {
  FORMAT_PALM_BEACH_5,
  FORMAT_TUESDAY_9BALL_R6_HOT,
  type LeagueScoringFormat,
} from "@/lib/scoring-formats";

export type NightStyle = "tuesday-races" | "matrix" | "team-race" | "doubles";
export type HandicapMode = "r6-hot" | "round-hc" | "none";

export type FormatGeneratorPicks = {
  playersPerTeam: number;
  nightStyle: NightStyle;
  handicapMode: HandicapMode;
  /** 8 or 9 for matrix nights; ignored otherwise. */
  gameBall?: "8" | "9";
};

export type DivisionFormatHints = {
  NumberOfPlayers: string;
  NumberOfRounds: string;
  PointsForWin: string;
  UseHandicap: string;
  HandicapMode: string;
  MatchWinForRound: string;
  AllScoresRequired: string;
  FormatTemplate: string;
  /** Human-readable LMS field guidance. */
  notes: string[];
};

export type FormatGeneratorResult = {
  picks: FormatGeneratorPicks;
  model: FormatTemplateModel;
  dsl: string;
  scoringFormat: LeagueScoringFormat;
  scoringSummary: string;
  divisionHints: DivisionFormatHints;
  title: string;
  bullets: string[];
  matchups: Array<{
    round: number;
    games: Array<{
      label: string;
      homeBreaks: boolean;
      kind: string;
      raceLength?: string | null;
    }>;
  }>;
};

export const NIGHT_STYLE_OPTIONS: Array<{
  id: NightStyle;
  label: string;
  description: string;
}> = [
  {
    id: "tuesday-races",
    label: "Singles races",
    description: "One race match per lineup slot (Tue 9-Ball style)",
  },
  {
    id: "matrix",
    label: "Round-robin matrix",
    description: "Everyone plays everyone · points per game/round",
  },
  {
    id: "team-race",
    label: "Team race night",
    description: "Full round-robin of race matches",
  },
  {
    id: "doubles",
    label: "Doubles race",
    description: "Home pair vs visitor pair",
  },
];

export const HANDICAP_MODE_OPTIONS: Array<{
  id: HandicapMode;
  label: string;
  description: string;
}> = [
  {
    id: "r6-hot",
    label: "R6 Hot chart",
    description: "Asymmetric race-to from Fargo difference",
  },
  {
    id: "round-hc",
    label: "Round handicap",
    description: "Expected-points HC games awarded per round",
  },
  {
    id: "none",
    label: "No handicap",
    description: "Even races / no HC games",
  },
];

function buildScoringFormat(picks: FormatGeneratorPicks): LeagueScoringFormat {
  const n = picks.playersPerTeam;

  if (picks.nightStyle === "tuesday-races" || picks.handicapMode === "r6-hot") {
    if (picks.nightStyle === "tuesday-races" || picks.nightStyle === "team-race") {
      return {
        ...FORMAT_TUESDAY_9BALL_R6_HOT,
        id: `gen-r6-${n}`,
        label: `R6 Hot ${n}-player`,
        description: `${n} singles races. Race from R6 Hot. 1 team point per match win.`,
        playersPerTeam: n,
        matchesPerNight: n,
        raceMode:
          picks.handicapMode === "none" ? "fixed-race" : "fargo-race-chart",
        raceChartId: picks.handicapMode === "none" ? undefined : "r6-hot",
        fixedRaceWin: picks.handicapMode === "none" ? 6 : undefined,
        teamPointMode: "match-win",
        matchPointsRound: false,
        pointSystem: "1",
      };
    }
  }

  if (picks.nightStyle === "doubles") {
    return {
      id: "gen-doubles-race",
      label: "Doubles race",
      description: "Home pair vs visitor pair. Fixed or chart race.",
      playersPerTeam: 2,
      matchesPerNight: 1,
      teamPointMode: "match-win",
      pointsPerMatchWin: 1,
      raceMode:
        picks.handicapMode === "r6-hot" ? "fargo-race-chart" : "fixed-race",
      raceChartId: picks.handicapMode === "r6-hot" ? "r6-hot" : undefined,
      fixedRaceWin: picks.handicapMode === "r6-hot" ? undefined : 17,
      matchPointsRound: false,
      pointSystem: "1",
    };
  }

  if (picks.nightStyle === "team-race") {
    return {
      id: `gen-team-race-${n}`,
      label: `Team race ${n}-player`,
      description: `${n}×${n} race matches. Match wins count for the team.`,
      playersPerTeam: n,
      matchesPerNight: n * n,
      teamPointMode: "match-win",
      pointsPerMatchWin: 1,
      raceMode:
        picks.handicapMode === "r6-hot" ? "fargo-race-chart" : "fixed-race",
      raceChartId: picks.handicapMode === "r6-hot" ? "r6-hot" : undefined,
      fixedRaceWin: picks.handicapMode === "r6-hot" ? undefined : 13,
      matchPointsRound: false,
      pointSystem: "1",
    };
  }

  // Matrix points night (Palm Beach–like)
  return {
    ...FORMAT_PALM_BEACH_5,
    id: `gen-matrix-${n}`,
    label: `Matrix ${n}-player`,
    description: `${n}-player round-robin. Points pad with round wins${
      picks.handicapMode === "round-hc" ? " and round HC" : ""
    }.`,
    playersPerTeam: n,
    matchesPerNight: n,
    teamPointMode: "round-points",
    raceMode: "fixed-race",
    fixedRaceWin: 10,
    fixedRaceMaxLoss: 7,
    matchPointsRound: true,
    pointSystem: picks.handicapMode === "none" ? "10" : "10",
  };
}

function buildModel(picks: FormatGeneratorPicks): FormatTemplateModel {
  const n = picks.playersPerTeam;
  const ball = picks.gameBall ?? "9";

  switch (picks.nightStyle) {
    case "tuesday-races":
      return buildTuesdayRacesTemplate(n);
    case "doubles":
      return buildDoublesRaceTemplate(
        picks.handicapMode === "r6-hot" ? "6" : "17",
      );
    case "team-race":
      return buildRoundRobinTemplate({
        players: n,
        rounds: n,
        kind: "R",
        raceSheetBreaks: true,
        gameType: ball,
        raceLength: picks.handicapMode === "r6-hot" ? "6" : "13",
      });
    case "matrix":
    default:
      return buildRoundRobinTemplate({
        players: n,
        rounds: n,
        kind: "S",
        gameType: ball,
      });
  }
}

function buildDivisionHints(
  picks: FormatGeneratorPicks,
  model: FormatTemplateModel,
  dsl: string,
  scoring: LeagueScoringFormat,
): DivisionFormatHints {
  const useHc = picks.handicapMode === "none" ? "0" : "1";
  // LMS: 0 Fixed, 1 by match, 2 by round (Fargo)
  const hcMode =
    picks.handicapMode === "round-hc"
      ? "2"
      : picks.handicapMode === "r6-hot"
        ? "0"
        : "0";
  const matchWin =
    scoring.teamPointMode === "match-win" ? "0" : "1";
  const pointsForWin = scoring.pointSystem;

  const notes: string[] = [];
  if (picks.handicapMode === "r6-hot") {
    notes.push(
      "App uses R6 Hot race targets from Fargo. LMS Race Length in the template is a placeholder — chart wins at score time.",
    );
    notes.push("Set division scoring so match wins count (not round points).");
  } else if (picks.handicapMode === "round-hc") {
    notes.push(
      "Set Handicap mode to “Calculated by round (Fargo)” and Use handicap = Yes.",
    );
    notes.push(
      `Points for game win ≈ ${pointsForWin} to match expected-points HC.`,
    );
  } else {
    notes.push("Use handicap = No for even play.");
  }

  return {
    NumberOfPlayers: String(model.playerCount),
    NumberOfRounds: String(model.rounds.length),
    PointsForWin: pointsForWin,
    UseHandicap: useHc,
    HandicapMode: hcMode,
    MatchWinForRound: matchWin,
    AllScoresRequired: "1",
    FormatTemplate: dsl,
    notes,
  };
}

function matchupLabel(game: FormatTemplateModel["rounds"][number]["games"][number]): string {
  const home =
    game.breakTeam === 1 ? game.breakPlayers : game.otherPlayers;
  const away =
    game.breakTeam === 1 ? game.otherPlayers : game.breakPlayers;
  const fmt = (refs: typeof home) =>
    refs
      .map((r) => `${r.side === "H" ? "Home" : "Away"}${r.index}`)
      .join("/");
  return `${fmt(home)} vs ${fmt(away)}`;
}

export function generateLeagueFormat(
  picks: FormatGeneratorPicks,
): FormatGeneratorResult {
  const normalized: FormatGeneratorPicks = {
    ...picks,
    playersPerTeam:
      picks.nightStyle === "doubles"
        ? 2
        : Math.min(10, Math.max(2, Math.round(picks.playersPerTeam) || 5)),
  };

  const model = buildModel(normalized);
  const dsl = serializeFormatTemplate(model);
  const scoringFormat = buildScoringFormat(normalized);
  const divisionHints = buildDivisionHints(
    normalized,
    model,
    dsl,
    scoringFormat,
  );

  const styleLabel =
    NIGHT_STYLE_OPTIONS.find((o) => o.id === normalized.nightStyle)?.label ??
    normalized.nightStyle;
  const hcLabel =
    HANDICAP_MODE_OPTIONS.find((o) => o.id === normalized.handicapMode)
      ?.label ?? normalized.handicapMode;

  const bullets = [
    `${normalized.playersPerTeam} players per side`,
    `${model.rounds.length} rounds · ${model.rounds.reduce((s, r) => s + r.games.length, 0)} games`,
    `Scoring: ${formatScoringSummary(scoringFormat)}`,
    `Handicap: ${hcLabel}`,
    ...divisionHints.notes,
  ];

  return {
    picks: normalized,
    model,
    dsl,
    scoringFormat,
    scoringSummary: formatScoringSummary(scoringFormat),
    divisionHints,
    title: `${styleLabel} · ${hcLabel}`,
    bullets,
    matchups: model.rounds.map((round, index) => ({
      round: index + 1,
      games: round.games.map((game) => ({
        label: matchupLabel(game),
        homeBreaks: game.breakTeam === 1,
        kind:
          game.kind === "R"
            ? "Race"
            : game.kind === "D"
              ? "Scotch"
              : "Singles",
        raceLength: game.kind === "R" ? game.raceLength : null,
      })),
    })),
  };
}

export function defaultFormatPicks(): FormatGeneratorPicks {
  return {
    playersPerTeam: 4,
    nightStyle: "tuesday-races",
    handicapMode: "r6-hot",
    gameBall: "9",
  };
}
