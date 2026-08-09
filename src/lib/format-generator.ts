/**
 * Configurable scoring + handicap format generator.
 *
 * Axes are independent (structure × game × race × Fargo HC × team scoring).
 * “Night styles” like Tuesday / matrix are just common presets of those axes.
 */

import { formatScoringSummary } from "@/lib/division-scoring-config";
import {
  serializeFormatTemplate,
  type FormatGameKind,
  type FormatTemplateModel,
} from "@/lib/lms-format-template";
import {
  buildDoublesRaceTemplate,
  buildRoundRobinTemplate,
  buildTuesdayRacesTemplate,
} from "@/lib/lms-scoresheet-presets";
import type { LeagueScoringFormat } from "@/lib/scoring-formats";
import type { FargoHandicapType, PointSystem } from "@/lib/handicap";

/** How lineup slots become matchups. */
export type MatchStructure = "slot-races" | "round-robin" | "doubles";

/** Per-game race model (independent of Fargo expected-points HC). */
export type RaceModel = "none" | "fixed" | "r6-hot";

/** FargoRate expected-points handicap (LMS / calculator). */
export type FargoHcMode = "none" | FargoHandicapType;

/** How individual results become team night points. */
export type TeamScoringMode = "match-win" | "round-points";

export type FormatGeneratorPicks = {
  playersPerTeam: number;
  /** Defaults to playersPerTeam for round-robin / slot-races. */
  rounds?: number;
  structure: MatchStructure;
  gameKind: FormatGameKind;
  gameBall: "8" | "9" | "10" | "any";
  raceModel: RaceModel;
  /** Used when raceModel === "fixed". */
  fixedRaceTo: number;
  fargoHc: FargoHcMode;
  /** LMS FargoHandicapType: 0 = Fargo Rating, 1 = Effective Rating */
  fargoRatingBasis: "0" | "1";
  handicapPercent: number;
  handicapCap: number;
  teamScoring: TeamScoringMode;
  pointSystem: PointSystem;
  matchPointsRound: boolean;
};

export type DivisionFormatHints = {
  NumberOfPlayers: string;
  NumberOfRounds: string;
  PointsForWin: string;
  UseHandicap: string;
  HandicapMode: string;
  FargoHandicapType: string;
  HandicapPercentage: string;
  MaximumAllowedHandicap: string;
  MatchWinForRound: string;
  AllScoresRequired: string;
  FormatTemplate: string;
  /** App-facing fargoRateHandicapType string for /format API consumers. */
  fargoRateHandicapType: string;
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
  warnings: string[];
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

export const STRUCTURE_OPTIONS: Array<{
  id: MatchStructure;
  label: string;
  description: string;
}> = [
  {
    id: "slot-races",
    label: "Slot matches",
    description: "One match per lineup slot (Home1 vs Away1, …)",
  },
  {
    id: "round-robin",
    label: "Round-robin",
    description: "Every home slot plays every away slot",
  },
  {
    id: "doubles",
    label: "Doubles",
    description: "Home pair vs visitor pair (2 per side)",
  },
];

export const GAME_KIND_OPTIONS: Array<{
  id: FormatGameKind;
  label: string;
  description: string;
}> = [
  {
    id: "S",
    label: "Singles (points)",
    description: "Score pad / points per game",
  },
  {
    id: "R",
    label: "Race",
    description: "Race-to target (fixed or chart)",
  },
  {
    id: "D",
    label: "Scotch / doubles game",
    description: "Two players per side on a game",
  },
];

export const RACE_MODEL_OPTIONS: Array<{
  id: RaceModel;
  label: string;
  description: string;
}> = [
  {
    id: "none",
    label: "No race chart",
    description: "Points games, or race length unused",
  },
  {
    id: "fixed",
    label: "Fixed race-to",
    description: "Same race length for everyone (set below)",
  },
  {
    id: "r6-hot",
    label: "R6 Hot chart",
    description: "Asymmetric race from Fargo difference",
  },
];

export const FARGO_HC_OPTIONS: Array<{
  id: FargoHcMode;
  label: string;
  description: string;
}> = [
  {
    id: "none",
    label: "No Fargo HC games",
    description: "No expected-points games awarded",
  },
  {
    id: "RoundBased",
    label: "Round-based",
    description: "HC calculated each round from matchups",
  },
  {
    id: "MatchBased",
    label: "Match-based",
    description: "HC per individual scoresheet game",
  },
  {
    id: "FullMatchBased",
    label: "Full-match",
    description: "One HC for the whole night",
  },
];

export const TEAM_SCORING_OPTIONS: Array<{
  id: TeamScoringMode;
  label: string;
  description: string;
}> = [
  {
    id: "match-win",
    label: "1 pt per match win",
    description: "Individual match winner earns a team point",
  },
  {
    id: "round-points",
    label: "Round points",
    description: "Round wins (+ optional match-points round)",
  },
];

/** Common bundles — optional shortcuts, not separate systems. */
export type FormatPresetId =
  | "tuesday-r6"
  | "matrix-round-hc"
  | "team-race-fixed"
  | "doubles-race";

export const FORMAT_PRESETS: Array<{
  id: FormatPresetId;
  label: string;
  description: string;
  picks: Partial<FormatGeneratorPicks>;
}> = [
  {
    id: "tuesday-r6",
    label: "Tuesday 9-Ball",
    description: "Slot races · R6 Hot · match wins",
    picks: {
      playersPerTeam: 4,
      structure: "slot-races",
      gameKind: "R",
      gameBall: "9",
      raceModel: "r6-hot",
      fargoHc: "none",
      teamScoring: "match-win",
      pointSystem: "1",
      matchPointsRound: false,
    },
  },
  {
    id: "matrix-round-hc",
    label: "Matrix + round HC",
    description: "Round-robin · points · round-based Fargo HC",
    picks: {
      playersPerTeam: 5,
      structure: "round-robin",
      gameKind: "S",
      gameBall: "8",
      raceModel: "fixed",
      fixedRaceTo: 10,
      fargoHc: "RoundBased",
      teamScoring: "round-points",
      pointSystem: "10",
      matchPointsRound: true,
    },
  },
  {
    id: "team-race-fixed",
    label: "Team race",
    description: "Full RR races · fixed race-to · match wins",
    picks: {
      playersPerTeam: 5,
      structure: "round-robin",
      gameKind: "R",
      gameBall: "any",
      raceModel: "fixed",
      fixedRaceTo: 13,
      fargoHc: "none",
      teamScoring: "match-win",
      pointSystem: "1",
      matchPointsRound: false,
    },
  },
  {
    id: "doubles-race",
    label: "Doubles",
    description: "Pair vs pair · fixed race",
    picks: {
      playersPerTeam: 2,
      structure: "doubles",
      gameKind: "R",
      gameBall: "9",
      raceModel: "fixed",
      fixedRaceTo: 17,
      fargoHc: "none",
      teamScoring: "match-win",
      pointSystem: "1",
      matchPointsRound: false,
    },
  },
];

export function defaultFormatPicks(): FormatGeneratorPicks {
  return {
    playersPerTeam: 4,
    structure: "slot-races",
    gameKind: "R",
    gameBall: "9",
    raceModel: "r6-hot",
    fixedRaceTo: 7,
    fargoHc: "none",
    fargoRatingBasis: "0",
    handicapPercent: 100,
    handicapCap: 50,
    teamScoring: "match-win",
    pointSystem: "1",
    matchPointsRound: false,
  };
}

function normalizePicks(picks: FormatGeneratorPicks): FormatGeneratorPicks {
  const structure = picks.structure;
  let players =
    structure === "doubles"
      ? 2
      : Math.min(10, Math.max(2, Math.round(picks.playersPerTeam) || 4));

  let gameKind = picks.gameKind;
  if (structure === "doubles" && gameKind === "S") {
    gameKind = "R";
  }

  let raceModel = picks.raceModel;
  if (gameKind === "S" && raceModel === "r6-hot") {
    // Chart races need race games; keep selection but warn — still allow fixed for pad.
    raceModel = picks.raceModel;
  }

  const rounds = Math.min(
    10,
    Math.max(1, Math.round(picks.rounds ?? players) || players),
  );

  return {
    ...picks,
    playersPerTeam: players,
    rounds: structure === "doubles" ? 1 : rounds,
    gameKind,
    raceModel,
    fixedRaceTo: Math.min(21, Math.max(1, Math.round(picks.fixedRaceTo) || 7)),
    handicapPercent: Math.min(
      100,
      Math.max(50, Math.round(picks.handicapPercent) || 100),
    ),
    handicapCap: Math.min(
      100,
      Math.max(0, Math.round(picks.handicapCap) || 50),
    ),
  };
}

function collectWarnings(picks: FormatGeneratorPicks): string[] {
  const warnings: string[] = [];
  if (picks.gameKind === "S" && picks.raceModel === "r6-hot") {
    warnings.push(
      "R6 Hot is a race chart — works best with Race games. Points games will still use a fixed score pad unless you switch game kind to Race.",
    );
  }
  if (picks.raceModel === "r6-hot" && picks.fargoHc !== "none") {
    warnings.push(
      "Using R6 Hot and Fargo HC games together is unusual — chart already handicaps via race-to. Double-check you want both.",
    );
  }
  if (picks.gameKind === "R" && picks.teamScoring === "round-points") {
    warnings.push(
      "Race nights usually use 1 pt per match win; round-points is more common for points pads.",
    );
  }
  if (picks.fargoHc !== "none" && picks.pointSystem === "1" && picks.gameKind === "S") {
    warnings.push(
      "Round/match HC with point system 1 is weak for points pads — consider 10 or 17.",
    );
  }
  return warnings;
}

function gameTypeToken(ball: FormatGeneratorPicks["gameBall"]): string {
  if (ball === "8") return "8";
  if (ball === "9") return "9";
  if (ball === "10") return "10";
  return "0";
}

function buildModel(picks: FormatGeneratorPicks): FormatTemplateModel {
  const n = picks.playersPerTeam;
  const rounds = picks.rounds ?? n;
  const gt = gameTypeToken(picks.gameBall);
  const raceLength = String(
    picks.raceModel === "fixed"
      ? picks.fixedRaceTo
      : picks.raceModel === "r6-hot"
        ? 6
        : picks.fixedRaceTo,
  );

  if (picks.structure === "doubles") {
    return buildDoublesRaceTemplate(raceLength);
  }

  if (picks.structure === "slot-races") {
    const model = buildTuesdayRacesTemplate(n);
    // Apply kind / ball / race length to each game.
    return {
      ...model,
      rounds: model.rounds.map((round) => ({
        ...round,
        games: round.games.map((game) => ({
          ...game,
          kind: picks.gameKind === "D" ? "R" : picks.gameKind,
          gameType: gt,
          raceLength:
            picks.gameKind === "R" || picks.raceModel !== "none"
              ? raceLength
              : game.raceLength,
        })),
      })),
    };
  }

  // round-robin
  return buildRoundRobinTemplate({
    players: n,
    rounds,
    kind: picks.gameKind === "D" ? "S" : picks.gameKind,
    raceSheetBreaks: picks.gameKind === "R",
    gameType: gt,
    raceLength,
  });
}

function buildScoringFormat(picks: FormatGeneratorPicks): LeagueScoringFormat {
  const n = picks.playersPerTeam;
  const games =
    picks.structure === "doubles"
      ? 1
      : picks.structure === "slot-races"
        ? n
        : n * (picks.rounds ?? n);

  const chartRace = picks.raceModel === "r6-hot";

  return {
    id: `gen-${picks.structure}-${picks.gameKind}-${picks.raceModel}-${picks.fargoHc}-${n}`,
    label: `${n}-player ${picks.structure}`,
    description: "Generated from Format tab picks.",
    playersPerTeam: n,
    matchesPerNight: Math.max(1, games),
    teamPointMode: picks.teamScoring,
    pointsPerMatchWin: 1,
    raceMode: chartRace ? "fargo-race-chart" : "fixed-race",
    raceChartId: chartRace ? "r6-hot" : undefined,
    fixedRaceWin: chartRace ? undefined : picks.fixedRaceTo,
    fixedRaceMaxLoss:
      !chartRace && picks.gameKind === "S"
        ? Math.max(1, picks.fixedRaceTo - 3)
        : undefined,
    matchPointsRound:
      picks.teamScoring === "round-points" ? picks.matchPointsRound : false,
    pointSystem: picks.pointSystem === "TRIOS" ? "10" : picks.pointSystem,
  };
}

function lmsHandicapMode(picks: FormatGeneratorPicks): string {
  if (picks.fargoHc === "none") return "0";
  if (picks.fargoHc === "RoundBased") return "2";
  if (picks.fargoHc === "MatchBased") return "1";
  if (picks.fargoHc === "FullMatchBased") return "1";
  return "0";
}

function buildDivisionHints(
  picks: FormatGeneratorPicks,
  model: FormatTemplateModel,
  dsl: string,
  scoring: LeagueScoringFormat,
): DivisionFormatHints {
  const useHc = picks.fargoHc === "none" ? "0" : "1";
  const notes: string[] = [];

  if (picks.raceModel === "r6-hot") {
    notes.push(
      "App applies R6 Hot race targets from Fargo at score time. Template RL is a placeholder — LMS UseHandicap stays off unless you also pick Fargo HC games.",
    );
  }
  if (picks.fargoHc !== "none") {
    notes.push(
      `Fargo expected-points HC: ${picks.fargoHc}. Rating basis ${picks.fargoRatingBasis === "1" ? "Effective" : "Fargo"}, ${picks.handicapPercent}%, cap ${picks.handicapCap}.`,
    );
  }
  if (picks.raceModel === "fixed" && picks.gameKind === "R") {
    notes.push(`Fixed race-to ${picks.fixedRaceTo} written into GAME RL tokens.`);
  }
  if (picks.fargoHc === "FullMatchBased") {
    notes.push(
      "LMS HandicapMode has no dedicated Full-match value — hints use “by match”; app scoring uses FullMatchBased.",
    );
  }

  return {
    NumberOfPlayers: String(model.playerCount),
    NumberOfRounds: String(model.rounds.length),
    PointsForWin: scoring.pointSystem,
    UseHandicap: useHc,
    HandicapMode: lmsHandicapMode(picks),
    FargoHandicapType: picks.fargoRatingBasis,
    HandicapPercentage: `${picks.handicapPercent}%`,
    MaximumAllowedHandicap: String(picks.handicapCap),
    MatchWinForRound: scoring.teamPointMode === "match-win" ? "0" : "1",
    AllScoresRequired: "1",
    FormatTemplate: dsl,
    fargoRateHandicapType:
      picks.fargoHc === "none" ? "RoundBased" : picks.fargoHc,
    notes,
  };
}

function matchupLabel(
  game: FormatTemplateModel["rounds"][number]["games"][number],
): string {
  const home = game.breakTeam === 1 ? game.breakPlayers : game.otherPlayers;
  const away = game.breakTeam === 1 ? game.otherPlayers : game.breakPlayers;
  const fmt = (refs: typeof home) =>
    refs
      .map((r) => `${r.side === "H" ? "Home" : "Away"}${r.index}`)
      .join("/");
  return `${fmt(home)} vs ${fmt(away)}`;
}

function titleFor(picks: FormatGeneratorPicks): string {
  const structure =
    STRUCTURE_OPTIONS.find((o) => o.id === picks.structure)?.label ??
    picks.structure;
  const race =
    RACE_MODEL_OPTIONS.find((o) => o.id === picks.raceModel)?.label ??
    picks.raceModel;
  const hc =
    FARGO_HC_OPTIONS.find((o) => o.id === picks.fargoHc)?.label ?? picks.fargoHc;
  return `${structure} · ${race} · ${hc}`;
}

export function generateLeagueFormat(
  picks: FormatGeneratorPicks,
): FormatGeneratorResult {
  const normalized = normalizePicks(picks);
  const model = buildModel(normalized);
  const dsl = serializeFormatTemplate(model);
  const scoringFormat = buildScoringFormat(normalized);
  const divisionHints = buildDivisionHints(
    normalized,
    model,
    dsl,
    scoringFormat,
  );
  const warnings = collectWarnings(normalized);

  const raceLabel =
    normalized.raceModel === "fixed"
      ? `Fixed race-to ${normalized.fixedRaceTo}`
      : RACE_MODEL_OPTIONS.find((o) => o.id === normalized.raceModel)?.label;

  const bullets = [
    `${normalized.playersPerTeam} players per side · ${model.rounds.length} rounds · ${model.rounds.reduce((s, r) => s + r.games.length, 0)} games`,
    `Structure: ${STRUCTURE_OPTIONS.find((o) => o.id === normalized.structure)?.label}`,
    `Games: ${GAME_KIND_OPTIONS.find((o) => o.id === normalized.gameKind)?.label} · ${normalized.gameBall === "any" ? "any ball" : `${normalized.gameBall}-ball`}`,
    `Race: ${raceLabel}`,
    `Fargo HC: ${FARGO_HC_OPTIONS.find((o) => o.id === normalized.fargoHc)?.label}`,
    `Team scoring: ${TEAM_SCORING_OPTIONS.find((o) => o.id === normalized.teamScoring)?.label} · points system ${normalized.pointSystem}`,
    `App scoring: ${formatScoringSummary(scoringFormat)}`,
    ...divisionHints.notes,
  ];

  return {
    picks: normalized,
    model,
    dsl,
    scoringFormat,
    scoringSummary: formatScoringSummary(scoringFormat),
    divisionHints,
    title: titleFor(normalized),
    bullets,
    warnings,
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

export function applyFormatPreset(
  id: FormatPresetId,
  base: FormatGeneratorPicks = defaultFormatPicks(),
): FormatGeneratorPicks {
  const preset = FORMAT_PRESETS.find((row) => row.id === id);
  if (!preset) return base;
  return normalizePicks({ ...base, ...preset.picks });
}
