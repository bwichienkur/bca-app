/**
 * Bridge Format generator picks → a synthetic ScoringMatchDetail for the
 * Format tab score sandbox (local-only, no LMS).
 */

import {
  calculateDivisionHandicaps,
  handicapTypeLabel,
  type RoundHandicapResult,
} from "@/lib/handicap";
import type { FormatGeneratorPicks, FormatGeneratorResult } from "@/lib/format-generator";
import type { FormatTemplateModel } from "@/lib/lms-format-template";
import {
  emptyDraft,
  gameKey,
  parsedFormatFromMatch,
  type FormatGame,
  type FormatPlayerSlot,
  type FormatRound,
  type ScoringDraft,
  type ScoringMatchDetail,
  type ScoringPlayer,
} from "@/lib/scoring";
import {
  applyFormatRaceTargets,
} from "@/lib/division-scoring-config";
import type { LeagueScoringFormat } from "@/lib/scoring-formats";

const DEFAULT_HOME_RATINGS = [620, 580, 540, 500, 460, 420];
const DEFAULT_AWAY_RATINGS = [600, 560, 520, 480, 440, 400];

export function makePreviewPlayer(
  side: "H" | "A",
  index: number,
  fargoRating: number,
): ScoringPlayer {
  const label = side === "H" ? "Home" : "Away";
  return {
    id: `${side.toLowerCase()}-${index}`,
    readableId: index,
    firstName: label,
    lastName: String(index),
    nickname: null,
    fargoRating,
    handicap: null,
    showOnRoster: true,
  };
}

export function defaultPreviewRatings(count: number): {
  home: number[];
  away: number[];
} {
  return {
    home: Array.from(
      { length: count },
      (_, i) => DEFAULT_HOME_RATINGS[i] ?? 500 - i * 20,
    ),
    away: Array.from(
      { length: count },
      (_, i) => DEFAULT_AWAY_RATINGS[i] ?? 490 - i * 20,
    ),
  };
}

function slot(side: "H" | "A", index: number): FormatPlayerSlot {
  return {
    identifier: `${side}${index}`,
    index,
  };
}

function templateGameToScoringGame(
  game: FormatTemplateModel["rounds"][number]["games"][number],
  index: number,
): FormatGame {
  const homeRefs =
    game.breakTeam === 1 ? game.breakPlayers : game.otherPlayers;
  const awayRefs =
    game.breakTeam === 1 ? game.otherPlayers : game.breakPlayers;
  const homeIndex = homeRefs[0]?.index ?? 1;
  const awayIndex = awayRefs[0]?.index ?? 1;

  return {
    gameType: game.kind === "R" ? "R" : game.kind === "D" ? "D" : "S",
    playerOne: slot("H", homeIndex),
    playerTwo: slot("A", awayIndex),
    index,
    multiplier: Number(game.multiplier) || 1,
    breakingTeam: game.breakTeam === 2 ? 2 : 1,
    gameFormatType: 0,
  };
}

export function formatModelToMatchFormat(
  model: FormatTemplateModel,
): NonNullable<ScoringMatchDetail["matchFormat"]> {
  const playerCount = Math.max(1, model.playerCount);
  const rounds: FormatRound[] = model.rounds.map((round, roundIndex) => ({
    roundNumber: roundIndex + 1,
    games: round.games.map((game, gameIndex) =>
      templateGameToScoringGame(game, gameIndex + 1),
    ),
  }));

  return {
    matchType: 0,
    teamOnePlayers: Array.from({ length: playerCount }, (_, i) =>
      slot("H", i + 1),
    ),
    teamTwoPlayers: Array.from({ length: playerCount }, (_, i) =>
      slot("A", i + 1),
    ),
    rounds,
  };
}

/** LMS % (50–100) → calculator multiplier (0.5–1). */
export function handicapPercentMultiplier(percent: number): number {
  if (!Number.isFinite(percent)) return 1;
  if (percent > 1) return Math.min(1, Math.max(0, percent / 100));
  return Math.min(1, Math.max(0, percent));
}

export function buildPreviewMatch(args: {
  picks: FormatGeneratorPicks;
  result: FormatGeneratorResult;
  homeRatings: number[];
  awayRatings: number[];
}): ScoringMatchDetail {
  const { picks, result, homeRatings, awayRatings } = args;
  const n = result.model.playerCount;
  const scoring = result.scoringFormat;
  const fixedWin = scoring.fixedRaceWin ?? picks.fixedRaceTo ?? 10;
  const fixedLoss =
    scoring.fixedRaceMaxLoss ?? Math.max(1, fixedWin - 3);
  const handicapped = picks.fargoHc !== "none";

  const teamOnePlayers = Array.from({ length: n }, (_, i) =>
    makePreviewPlayer("H", i + 1, homeRatings[i] ?? 500),
  );
  const teamTwoPlayers = Array.from({ length: n }, (_, i) =>
    makePreviewPlayer("A", i + 1, awayRatings[i] ?? 500),
  );

  return {
    id: `format-preview-${scoring.id}`,
    divisionId: "format-preview",
    divisionName: result.title,
    datePlayed: new Date().toISOString().slice(0, 10),
    location: "Format sandbox",
    hasBeenPlayed: false,
    teamOneId: "home",
    teamOneName: "Home",
    teamTwoId: "away",
    teamTwoName: "Away",
    numberOfSets: n,
    minScore: 0,
    maxScore: fixedWin,
    maxLosingScore: fixedLoss,
    pointsForWin: Number(scoring.pointSystem) || 10,
    isHandicapped: handicapped,
    handicapPercentage: handicapPercentMultiplier(picks.handicapPercent),
    maximumAllowedHandicap: picks.handicapCap,
    matchWinCountsAsRound: scoring.matchPointsRound,
    mySide: null,
    matchFormat: formatModelToMatchFormat(result.model),
    teamOnePlayers,
    teamTwoPlayers,
  };
}

export function buildPreviewDraft(
  match: ScoringMatchDetail,
  scoringFormat: LeagueScoringFormat,
): ScoringDraft {
  let draft = emptyDraft(match, false);
  draft = applyFormatRaceTargets(match, draft, scoringFormat);

  // Stamp even race targets for fixed-race nights so gameWinner() (and
  // match-win tallies) honor race-to values other than the 10/7 default.
  if (scoringFormat.raceMode !== "fargo-race-chart") {
    const win =
      scoringFormat.fixedRaceWin && scoringFormat.fixedRaceWin > 0
        ? scoringFormat.fixedRaceWin
        : match.maxScore > 0
          ? match.maxScore
          : 10;
    const games: ScoringDraft["games"] = { ...draft.games };
    for (const [key, game] of Object.entries(games)) {
      games[key] = {
        ...game,
        raceTargetOne: win,
        raceTargetTwo: win,
      };
    }
    draft = { ...draft, games };
  }

  return draft;
}

export function previewHandicaps(
  match: ScoringMatchDetail,
  draft: ScoringDraft,
  fargoHc: FormatGeneratorPicks["fargoHc"],
): RoundHandicapResult[] {
  if (!match.isHandicapped || fargoHc === "none") return [];
  return calculateDivisionHandicaps({
    format: parsedFormatFromMatch(match),
    teamOneRatings: draft.teamOneLineup.map((id) => {
      if (!id) return 0;
      return (
        match.teamOnePlayers.find((player) => player.id === id)?.fargoRating ??
        0
      );
    }),
    teamTwoRatings: draft.teamTwoLineup.map((id) => {
      if (!id) return 0;
      return (
        match.teamTwoPlayers.find((player) => player.id === id)?.fargoRating ??
        0
      );
    }),
    pointSystem: String(match.pointsForWin || 10),
    handicapPercent: match.handicapPercentage ?? 1,
    handicapCap: match.maximumAllowedHandicap ?? 50,
    fargoRateHandicapType: fargoHc,
  });
}

export function previewHandicapLabel(
  fargoHc: FormatGeneratorPicks["fargoHc"],
): string {
  if (fargoHc === "none") return "No Fargo HC";
  return handicapTypeLabel(fargoHc);
}

/** Stable key so the sandbox can reset when the night shape changes. */
export function previewFormatSignature(
  picks: FormatGeneratorPicks,
  result: FormatGeneratorResult,
): string {
  return [
    result.dsl,
    picks.fargoHc,
    picks.handicapPercent,
    picks.handicapCap,
    picks.raceModel,
    picks.raceChartId,
    picks.fixedRaceTo,
    picks.teamScoring,
    picks.matchPointsRound,
    picks.pointSystem,
  ].join("|");
}

export function gameSlotLabel(
  match: ScoringMatchDetail,
  roundNumber: number,
  gameIndex: number,
): { homeSlot: string; awaySlot: string } {
  const game = match.matchFormat?.rounds
    .find((round) => round.roundNumber === roundNumber)
    ?.games.find((item) => item.index === gameIndex);
  return {
    homeSlot: game ? `H${game.playerOne.index}` : "H?",
    awaySlot: game ? `A${game.playerTwo.index}` : "A?",
  };
}

export { gameKey };
