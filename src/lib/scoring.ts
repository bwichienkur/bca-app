import {
  buildDefaultFivePlayerFormat,
  calculateRoundBasedHandicaps,
  type ParsedMatchFormat,
  type RoundHandicapResult,
} from "./handicap";
import type { RosterPlayer } from "./types";

export type WinAdornment = "" | "BR" | "TR" | "WZ";

export type ScoringPlayer = {
  id: string;
  readableId: number | null;
  firstName: string;
  lastName: string;
  nickname: string | null;
  fargoRating: number | null;
  handicap: number | null;
  showOnRoster: boolean;
};

export type ScoringMatchSummary = {
  id: string;
  divisionId: string;
  divisionName: string;
  datePlayed: string;
  location: string;
  hasBeenPlayed: boolean;
  teamOneId: string;
  teamOneName: string;
  teamTwoId: string;
  teamTwoName: string;
  numberOfSets: number;
  minScore: number;
  maxScore: number;
  maxLosingScore: number;
  pointsForWin: number;
  isHandicapped: boolean;
  handicapPercentage: number;
  maximumAllowedHandicap: number;
  /** When true, overall points across all rounds count as an extra "round". */
  matchWinCountsAsRound: boolean;
  mySide: 1 | 2 | null;
};

export type FormatPlayerSlot = {
  identifier: string;
  index: number;
};

export type FormatGame = {
  gameType: string;
  playerOne: FormatPlayerSlot;
  playerTwo: FormatPlayerSlot;
  index: number;
  multiplier: number;
  breakingTeam: number;
  gameFormatType: number;
};

export type FormatRound = {
  roundNumber: number;
  games: FormatGame[];
};

export type ScoringMatchDetail = ScoringMatchSummary & {
  matchFormat: {
    matchType: number;
    teamOnePlayers: FormatPlayerSlot[];
    teamTwoPlayers: FormatPlayerSlot[];
    rounds: FormatRound[];
  } | null;
  teamOnePlayers: ScoringPlayer[];
  teamTwoPlayers: ScoringPlayer[];
};

export type GameScoreState = {
  teamOnePlayerId: string | null;
  teamTwoPlayerId: string | null;
  teamOneScore: number | null;
  teamTwoScore: number | null;
  winAdornment: WinAdornment;
  isWinZip: boolean;
  breakingTeam: 1 | 2;
  teamOneHandicap: number | null;
  teamTwoHandicap: number | null;
  /**
   * Per-side race-to targets (Fargo race charts). When set, completion uses
   * asymmetric race rules instead of fixed maxWin/maxLoss.
   */
  raceTargetOne?: number | null;
  raceTargetTwo?: number | null;
  /** LMS id of whoever last saved this game's result (discrepancy checks). */
  scoredBy?: string | null;
  /** Display name for scoredBy (best-effort). */
  scoredByName?: string | null;
};

export type ScoringDraft = {
  matchId: string;
  updatedAt: string;
  teamOneLineup: (string | null)[];
  teamTwoLineup: (string | null)[];
  /** key: `${roundNumber}-${gameIndex}` */
  games: Record<string, GameScoreState>;
};

export const SCORING_DRAFT_PREFIX = "tableside.scoring.draft.v1.";

export function playerDisplayName(player: ScoringPlayer | RosterPlayer): string {
  const first = "firstName" in player ? player.firstName : "";
  const last = "lastName" in player ? player.lastName : "";
  return `${first} ${last}`.trim() || "Player";
}

export function gameKey(roundNumber: number, gameIndex: number): string {
  return `${roundNumber}-${gameIndex}`;
}

/**
 * Sentinel round id for the overall match-points / totals bucket.
 * Not a played round — must not collide with real round numbers (1…N).
 * Historically labeled “R6” on 5-round Palm Beach sheets.
 */
export const MATCH_POINTS_ROUND = 100;

/** Short tab label for the overall match-points bucket. */
export const MATCH_POINTS_TAB_LABEL = "Tot";

export function emptyDraft(
  match: ScoringMatchDetail,
  preferMyTeamFirst = true,
): ScoringDraft {
  const slots =
    match.matchFormat?.teamOnePlayers.length ||
    match.numberOfSets ||
    5;

  const draft: ScoringDraft = {
    matchId: match.id,
    updatedAt: new Date().toISOString(),
    teamOneLineup: Array.from({ length: slots }, () => null),
    teamTwoLineup: Array.from({ length: slots }, () => null),
    games: {},
  };

  // Seed default lineups from roster order when possible.
  const one = match.teamOnePlayers.filter((p) => p.showOnRoster !== false);
  const two = match.teamTwoPlayers.filter((p) => p.showOnRoster !== false);
  for (let i = 0; i < slots; i += 1) {
    draft.teamOneLineup[i] = one[i]?.id ?? null;
    draft.teamTwoLineup[i] = two[i]?.id ?? null;
  }

  for (const round of match.matchFormat?.rounds ?? []) {
    for (const game of round.games) {
      draft.games[gameKey(round.roundNumber, game.index)] = {
        teamOnePlayerId:
          draft.teamOneLineup[(game.playerOne.index || 1) - 1] ?? null,
        teamTwoPlayerId:
          draft.teamTwoLineup[(game.playerTwo.index || 1) - 1] ?? null,
        teamOneScore: 0,
        teamTwoScore: 0,
        winAdornment: "",
        isWinZip: false,
        breakingTeam: (game.breakingTeam === 2 ? 2 : 1) as 1 | 2,
        teamOneHandicap: null,
        teamTwoHandicap: null,
      };
    }
  }

  void preferMyTeamFirst;
  return applyHandicapsToDraft(match, draft);
}

export function syncLineupToGames(
  draft: ScoringDraft,
  match: ScoringMatchDetail,
): ScoringDraft {
  const games: ScoringDraft["games"] = { ...draft.games };
  let changed = false;

  for (const round of match.matchFormat?.rounds ?? []) {
    for (const game of round.games) {
      const key = gameKey(round.roundNumber, game.index);
      const existing = games[key] ?? {
        teamOnePlayerId: null,
        teamTwoPlayerId: null,
        teamOneScore: 0,
        teamTwoScore: 0,
        winAdornment: "" as WinAdornment,
        isWinZip: false,
        breakingTeam: (game.breakingTeam === 2 ? 2 : 1) as 1 | 2,
        teamOneHandicap: null,
        teamTwoHandicap: null,
      };
      const teamOnePlayerId =
        draft.teamOneLineup[(game.playerOne.index || 1) - 1] ?? null;
      const teamTwoPlayerId =
        draft.teamTwoLineup[(game.playerTwo.index || 1) - 1] ?? null;
      const teamOneScore = existing.teamOneScore ?? 0;
      const teamTwoScore = existing.teamTwoScore ?? 0;
      if (
        !games[key] ||
        existing.teamOnePlayerId !== teamOnePlayerId ||
        existing.teamTwoPlayerId !== teamTwoPlayerId ||
        existing.teamOneScore !== teamOneScore ||
        existing.teamTwoScore !== teamTwoScore
      ) {
        games[key] = {
          ...existing,
          teamOneScore,
          teamTwoScore,
          teamOnePlayerId,
          teamTwoPlayerId,
        };
        changed = true;
      }
    }
  }

  const linedUp = changed ? { ...draft, games } : draft;
  const withHandicaps = applyHandicapsToDraft(match, linedUp);
  for (const key of Object.keys(withHandicaps.games)) {
    const before = draft.games[key];
    const after = withHandicaps.games[key];
    if (!before || !after) {
      changed = true;
      break;
    }
    if (
      before.teamOneHandicap !== after.teamOneHandicap ||
      before.teamTwoHandicap !== after.teamTwoHandicap ||
      before.teamOnePlayerId !== after.teamOnePlayerId ||
      before.teamTwoPlayerId !== after.teamTwoPlayerId
    ) {
      changed = true;
      break;
    }
  }

  if (!changed) return draft;
  return { ...withHandicaps, updatedAt: new Date().toISOString() };
}

/** Legal race scores for the score pad (no 8/9 — jump to race-to win). */
export const RACE_SCORE_OPTIONS = [0, 1, 2, 3, 4, 5, 6, 7, 10] as const;

export type GameWinnerOptions = {
  maxScore?: number;
  maxLosingScore?: number;
  raceTargetOne?: number | null;
  raceTargetTwo?: number | null;
};

function resolvedRaceTargets(
  game: GameScoreState | undefined,
  options?: GameWinnerOptions,
): { raceOne: number; raceTwo: number } | null {
  const raceOne = options?.raceTargetOne ?? game?.raceTargetOne;
  const raceTwo = options?.raceTargetTwo ?? game?.raceTargetTwo;
  if (
    raceOne == null ||
    raceTwo == null ||
    !Number.isFinite(raceOne) ||
    !Number.isFinite(raceTwo) ||
    raceOne <= 0 ||
    raceTwo <= 0
  ) {
    return null;
  }
  return { raceOne: Math.round(raceOne), raceTwo: Math.round(raceTwo) };
}

/**
 * A game is complete when one side reaches its race target.
 * Fixed-race nights use maxWin + maxLoss (e.g. 10 / 7). Chart races use
 * per-side raceTargetOne / raceTargetTwo (possibly asymmetric).
 */
export function gameWinner(
  game: GameScoreState | undefined,
  options?: GameWinnerOptions,
): 1 | 2 | null {
  if (!game) return null;
  if (game.teamOneScore == null || game.teamTwoScore == null) return null;
  const one = game.teamOneScore;
  const two = game.teamTwoScore;

  const race = resolvedRaceTargets(game, options);
  if (race) {
    if (one >= race.raceOne && two < race.raceTwo) return 1;
    if (two >= race.raceTwo && one < race.raceOne) return 2;
    return null;
  }

  const maxWin =
    options?.maxScore && options.maxScore > 0 ? options.maxScore : 10;
  const maxLoss =
    options?.maxLosingScore != null && options.maxLosingScore >= 0
      ? options.maxLosingScore
      : 7;
  if (one === maxWin && two <= maxLoss) return 1;
  if (two === maxWin && one <= maxLoss) return 2;
  return null;
}

export function isGameScored(
  game: GameScoreState | undefined,
  options?: GameWinnerOptions,
): boolean {
  return (
    gameWinner(game, {
      maxScore: options?.maxScore,
      maxLosingScore: options?.maxLosingScore,
      raceTargetOne: options?.raceTargetOne ?? game?.raceTargetOne,
      raceTargetTwo: options?.raceTargetTwo ?? game?.raceTargetTwo,
    }) != null
  );
}

export function normalizeDraftScores(draft: ScoringDraft): ScoringDraft {
  const games: ScoringDraft["games"] = {};
  for (const [key, game] of Object.entries(draft.games)) {
    games[key] = {
      ...game,
      teamOneScore: game.teamOneScore ?? 0,
      teamTwoScore: game.teamTwoScore ?? 0,
    };
  }
  return { ...draft, games };
}

export function tallyDraft(
  draft: ScoringDraft,
  options?: GameWinnerOptions,
): {
  teamOneWins: number;
  teamTwoWins: number;
  scored: number;
  total: number;
} {
  let teamOneWins = 0;
  let teamTwoWins = 0;
  let scored = 0;
  const games = Object.values(draft.games);
  for (const game of games) {
    const winner = gameWinner(game, {
      maxScore: options?.maxScore,
      maxLosingScore: options?.maxLosingScore,
      raceTargetOne: options?.raceTargetOne ?? game.raceTargetOne,
      raceTargetTwo: options?.raceTargetTwo ?? game.raceTargetTwo,
    });
    if (!winner) continue;
    scored += 1;
    if (winner === 1) teamOneWins += 1;
    if (winner === 2) teamTwoWins += 1;
  }
  return { teamOneWins, teamTwoWins, scored, total: games.length };
}

export type RoundGameWinsTally = {
  roundNumber: number;
  teamOneGameWins: number;
  teamTwoGameWins: number;
  gamesComplete: number;
  gamesTotal: number;
  gamesRemaining: number;
  roundComplete: boolean;
  /**
   * Winner by individual race/match wins (not raw race-score points).
   * Clinches when one side leads by more than games still unscored.
   */
  roundWinner: 1 | 2 | null;
};

/**
 * Per-round tally for match-win team scoring: each completed race is one
 * win, so asymmetric chart races (e.g. 7–4) are honored instead of summing
 * balls/games as round points.
 */
export function tallyRoundByGameWins(
  match: ScoringMatchDetail,
  draft: ScoringDraft,
  roundNumber: number,
  options?: GameWinnerOptions,
): RoundGameWinsTally {
  const round = match.matchFormat?.rounds.find(
    (item) => item.roundNumber === roundNumber,
  );
  const games = round?.games ?? [];
  const { maxWin, maxLoss } = scoreLimits(match);
  let teamOneGameWins = 0;
  let teamTwoGameWins = 0;
  let gamesComplete = 0;

  for (const game of games) {
    const state = draft.games[gameKey(roundNumber, game.index)];
    const winner = gameWinner(state, {
      maxScore: options?.maxScore ?? maxWin,
      maxLosingScore: options?.maxLosingScore ?? maxLoss,
      raceTargetOne: options?.raceTargetOne ?? state?.raceTargetOne,
      raceTargetTwo: options?.raceTargetTwo ?? state?.raceTargetTwo,
    });
    if (!winner) continue;
    gamesComplete += 1;
    if (winner === 1) teamOneGameWins += 1;
    if (winner === 2) teamTwoGameWins += 1;
  }

  const gamesRemaining = Math.max(0, games.length - gamesComplete);
  let roundWinner: 1 | 2 | null = null;
  if (teamOneGameWins > teamTwoGameWins + gamesRemaining) roundWinner = 1;
  else if (teamTwoGameWins > teamOneGameWins + gamesRemaining) roundWinner = 2;

  return {
    roundNumber,
    teamOneGameWins,
    teamTwoGameWins,
    gamesComplete,
    gamesTotal: games.length,
    gamesRemaining,
    roundComplete: games.length > 0 && gamesRemaining === 0,
    roundWinner,
  };
}

export function tallyAllRoundsByGameWins(
  match: ScoringMatchDetail,
  draft: ScoringDraft,
  options?: GameWinnerOptions,
): RoundGameWinsTally[] {
  return (match.matchFormat?.rounds ?? []).map((round) =>
    tallyRoundByGameWins(match, draft, round.roundNumber, options),
  );
}

type BoardRoundGame = {
  round: number;
  teamOneScore: number;
  teamTwoScore: number;
  winAdornment?: WinAdornment;
  teamOneHandicap?: number | null;
  teamTwoHandicap?: number | null;
};

export type BoardRoundTallyOptions = {
  /** Include overall match-points / totals round. Default true. */
  includeMatchPointsRound?: boolean;
  maxScore?: number;
  maxLosingScore?: number;
  /**
   * Use per-game handicap fields as round HC.
   * Disable for LMS-hydrated drafts where those fields may be Fargo ratings.
   */
  useGameHandicaps?: boolean;
};

function plausibleRoundHandicap(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) return 0;
  // Round HC is capped (typically ≤ 50). Fargo ratings are much larger.
  if (value < 0 || value > 50) return 0;
  return value;
}

/**
 * Board-level round tally from scored games.
 * Uses points + round HC with the same clinch rules as the scoresheet, and
 * optionally awards the final overall match-points / totals round.
 */
export function tallyBoardRoundWins(
  games: BoardRoundGame[],
  options: BoardRoundTallyOptions = {},
): {
  teamOneRoundWins: number;
  teamTwoRoundWins: number;
  roundsStarted: number;
  roundsDecided: number;
  matchPointsWinner: 1 | 2 | null;
} {
  const includeMatchPoints = options.includeMatchPointsRound !== false;
  const maxWin =
    options.maxScore && options.maxScore > 0 ? options.maxScore : 10;
  const maxLoss =
    options.maxLosingScore != null && options.maxLosingScore >= 0
      ? options.maxLosingScore
      : 7;
  const useHc = options.useGameHandicaps !== false;

  type RoundAcc = {
    onePts: number;
    twoPts: number;
    oneWins: number;
    twoWins: number;
    complete: number;
    total: number;
    oneHc: number;
    twoHc: number;
  };
  const byRound = new Map<number, RoundAcc>();

  for (const game of games) {
    // Skip synthetic match-points key if present (see MATCH_POINTS_ROUND).
    if (!Number.isFinite(game.round) || game.round === MATCH_POINTS_ROUND) {
      continue;
    }
    const row = byRound.get(game.round) ?? {
      onePts: 0,
      twoPts: 0,
      oneWins: 0,
      twoWins: 0,
      complete: 0,
      total: 0,
      oneHc: 0,
      twoHc: 0,
    };
    row.total += 1;
    row.onePts += game.teamOneScore ?? 0;
    row.twoPts += game.teamTwoScore ?? 0;
    if (useHc) {
      row.oneHc = Math.max(
        row.oneHc,
        plausibleRoundHandicap(game.teamOneHandicap),
      );
      row.twoHc = Math.max(
        row.twoHc,
        plausibleRoundHandicap(game.teamTwoHandicap),
      );
    }
    const winner = gameWinner({
      teamOnePlayerId: null,
      teamTwoPlayerId: null,
      teamOneScore: game.teamOneScore,
      teamTwoScore: game.teamTwoScore,
      winAdornment: game.winAdornment ?? "",
      isWinZip: (game.winAdornment ?? "") === "WZ",
      breakingTeam: 1,
      teamOneHandicap: null,
      teamTwoHandicap: null,
    }, { maxScore: maxWin, maxLosingScore: maxLoss });
    if (winner) {
      row.complete += 1;
      if (winner === 1) row.oneWins += 1;
      else row.twoWins += 1;
    }
    byRound.set(game.round, row);
  }

  let teamOneRoundWins = 0;
  let teamTwoRoundWins = 0;
  let roundsDecided = 0;
  let matchOnePts = 0;
  let matchTwoPts = 0;
  let matchOneWins = 0;
  let matchTwoWins = 0;
  let matchComplete = 0;
  let matchTotal = 0;

  for (const row of byRound.values()) {
    const oneTotal = row.onePts + row.oneHc;
    const twoTotal = row.twoPts + row.twoHc;
    const remaining = Math.max(0, row.total - row.complete);
    const winner = clinchRoundWinner({
      teamOnePoints: oneTotal,
      teamTwoPoints: twoTotal,
      teamOneGameWins: row.oneWins,
      teamTwoGameWins: row.twoWins,
      gamesRemaining: remaining,
      maxWin,
      maxLoss,
    });
    if (winner === 1) {
      teamOneRoundWins += 1;
      roundsDecided += 1;
    } else if (winner === 2) {
      teamTwoRoundWins += 1;
      roundsDecided += 1;
    }
    matchOnePts += oneTotal;
    matchTwoPts += twoTotal;
    matchOneWins += row.oneWins;
    matchTwoWins += row.twoWins;
    matchComplete += row.complete;
    matchTotal += row.total;
  }

  let matchPointsWinner: 1 | 2 | null = null;
  if (includeMatchPoints && matchTotal > 0) {
    matchPointsWinner = clinchRoundWinner({
      teamOnePoints: matchOnePts,
      teamTwoPoints: matchTwoPts,
      teamOneGameWins: matchOneWins,
      teamTwoGameWins: matchTwoWins,
      gamesRemaining: Math.max(0, matchTotal - matchComplete),
      maxWin,
      maxLoss,
    });
    if (matchPointsWinner === 1) teamOneRoundWins += 1;
    if (matchPointsWinner === 2) teamTwoRoundWins += 1;
    if (matchPointsWinner) roundsDecided += 1;
  }

  return {
    teamOneRoundWins,
    teamTwoRoundWins,
    roundsStarted: byRound.size + (matchPointsWinner ? 1 : 0),
    roundsDecided,
    matchPointsWinner,
  };
}

/**
 * Board-level round tally from draft game keys (`${round}-${gameIndex}`).
 * Includes the final match-points round when decided.
 */
export function tallyDraftRounds(
  draft: ScoringDraft,
  options: BoardRoundTallyOptions = {},
): {
  teamOneRoundWins: number;
  teamTwoRoundWins: number;
  roundsStarted: number;
  roundsDecided: number;
} {
  const games: BoardRoundGame[] = [];
  for (const [key, game] of Object.entries(draft.games)) {
    const round = Number(key.split("-")[0]);
    if (!Number.isFinite(round)) continue;
    games.push({
      round,
      teamOneScore: game.teamOneScore ?? 0,
      teamTwoScore: game.teamTwoScore ?? 0,
      winAdornment: game.winAdornment,
      teamOneHandicap: game.teamOneHandicap,
      teamTwoHandicap: game.teamTwoHandicap,
    });
  }
  return tallyBoardRoundWins(games, {
    useGameHandicaps: true,
    ...options,
  });
}

export type DraftBoardSummary = {
  matchId: string;
  teamOneGameWins: number;
  teamTwoGameWins: number;
  teamOneRoundWins: number;
  teamTwoRoundWins: number;
  gamesScored: number;
  /** Games with any points entered or a decided winner. */
  gamesStarted: number;
  roundsStarted: number;
  updatedAt: string;
  submittedAt: string | null;
  status: "in_progress" | "submitted";
};

/**
 * First-to team race winner from matchup-win totals (Beyond Teams race to 9).
 * Remaining unscored matchups do not count once a side hits the target.
 */
export function teamRaceWinnerSide(
  homeWins: number,
  awayWins: number,
  teamRaceTo: number | null | undefined,
): 1 | 2 | null {
  if (teamRaceTo == null || teamRaceTo <= 0) return null;
  const oneHit = homeWins >= teamRaceTo;
  const twoHit = awayWins >= teamRaceTo;
  if (oneHit && !twoHit) return 1;
  if (twoHit && !oneHit) return 2;
  if (oneHit && twoHit && homeWins !== awayWins) {
    return homeWins > awayWins ? 1 : 2;
  }
  return null;
}

/** True when any game has points or a winner (used for night-board Live). */
export function draftHasStartedPlay(
  draft: ScoringDraft | null | undefined,
  options?: GameWinnerOptions,
): boolean {
  if (!draft) return false;
  return Object.values(draft.games).some(
    (game) => gamePlayStatus(game, options) !== "not-started",
  );
}

export type SummarizeDraftOptions = {
  /** When "match-win", team points = individual match wins (no R6). */
  teamPointMode?: "round-points" | "match-win";
  includeMatchPointsRound?: boolean;
  /** Format race limits so win/lose (1–0) matchups count without stamped targets. */
  maxScore?: number;
  maxLosingScore?: number;
};

export function summarizeDraftForBoard(
  draft: ScoringDraft,
  submittedAt: string | null = null,
  options: SummarizeDraftOptions = {},
): DraftBoardSummary {
  const winnerOpts: GameWinnerOptions = {
    maxScore: options.maxScore,
    maxLosingScore: options.maxLosingScore,
  };
  const games = tallyDraft(draft, winnerOpts);
  const gamesStarted = Object.values(draft.games).filter(
    (game) => gamePlayStatus(game, winnerOpts) !== "not-started",
  ).length;

  if (options.teamPointMode === "match-win") {
    return {
      matchId: draft.matchId,
      teamOneGameWins: games.teamOneWins,
      teamTwoGameWins: games.teamTwoWins,
      teamOneRoundWins: games.teamOneWins,
      teamTwoRoundWins: games.teamTwoWins,
      gamesScored: games.scored,
      gamesStarted,
      roundsStarted: games.scored,
      updatedAt: draft.updatedAt,
      submittedAt,
      status: submittedAt ? "submitted" : "in_progress",
    };
  }

  const rounds = tallyDraftRounds(draft, {
    includeMatchPointsRound: options.includeMatchPointsRound,
  });
  return {
    matchId: draft.matchId,
    teamOneGameWins: games.teamOneWins,
    teamTwoGameWins: games.teamTwoWins,
    teamOneRoundWins: rounds.teamOneRoundWins,
    teamTwoRoundWins: rounds.teamTwoRoundWins,
    gamesScored: games.scored,
    gamesStarted,
    roundsStarted: rounds.roundsStarted,
    updatedAt: draft.updatedAt,
    submittedAt,
    status: submittedAt ? "submitted" : "in_progress",
  };
}

export type RoundPointsTally = {
  roundNumber: number;
  teamOneGamePoints: number;
  teamTwoGamePoints: number;
  teamOneHandicap: number;
  teamTwoHandicap: number;
  teamOneTotal: number;
  teamTwoTotal: number;
  teamOneGameWins: number;
  teamTwoGameWins: number;
  gamesComplete: number;
  gamesTotal: number;
  gamesRemaining: number;
  roundComplete: boolean;
  /** Winner when clinched early or after all games (points, then game wins). */
  roundWinner: 1 | 2 | null;
  /** True when the winner was decided before every game was scored. */
  clinchedEarly: boolean;
  /** Points still needed from remaining games to win; null if decided/N/A. */
  pointsNeeded: { teamOne: number | null; teamTwo: number | null };
  /** False when the opponent has already clinched (HC included in totals). */
  canCatchUp: { teamOne: boolean; teamTwo: boolean };
  maxWinPoints: number;
  maxLossPoints: number;
};

export function scoreLimits(
  match: Pick<ScoringMatchSummary, "maxScore" | "maxLosingScore">,
): { maxWin: number; maxLoss: number } {
  return {
    maxWin: match.maxScore > 0 ? match.maxScore : 10,
    maxLoss: match.maxLosingScore >= 0 ? match.maxLosingScore : 7,
  };
}

/** Points first; if tied, majority of game wins; else true tie. */
export function decideByPointsThenGames(
  teamOnePoints: number,
  teamTwoPoints: number,
  teamOneGameWins: number,
  teamTwoGameWins: number,
): 1 | 2 | null {
  if (teamOnePoints > teamTwoPoints) return 1;
  if (teamTwoPoints > teamOnePoints) return 2;
  if (teamOneGameWins > teamTwoGameWins) return 1;
  if (teamTwoGameWins > teamOneGameWins) return 2;
  return null;
}

type ClinchArgs = {
  /** Current totals — must already include round handicap. */
  teamOnePoints: number;
  teamTwoPoints: number;
  teamOneGameWins: number;
  teamTwoGameWins: number;
  gamesRemaining: number;
  maxWin: number;
  maxLoss: number;
};

/**
 * Side has clinched when even their worst remaining case (lose all at 0 pts)
 * still beats the opponent's best case (win all at maxWin, us at 0).
 * Totals should already include handicap so HC leads are respected.
 */
export function hasClinchedRound(args: ClinchArgs & { side: 1 | 2 }): boolean {
  const rem = Math.max(0, args.gamesRemaining);
  let onePts = args.teamOnePoints;
  let twoPts = args.teamTwoPoints;
  let oneWins = args.teamOneGameWins;
  let twoWins = args.teamTwoGameWins;

  if (rem > 0) {
    if (args.side === 1) {
      // Worst for us: we take 0; opponent sweeps remaining at maxWin.
      twoPts += args.maxWin * rem;
      twoWins += rem;
    } else {
      onePts += args.maxWin * rem;
      oneWins += rem;
    }
  }

  return (
    decideByPointsThenGames(onePts, twoPts, oneWins, twoWins) === args.side
  );
}

export function clinchRoundWinner(args: ClinchArgs): 1 | 2 | null {
  if (hasClinchedRound({ ...args, side: 1 })) return 1;
  if (hasClinchedRound({ ...args, side: 2 })) return 2;
  return null;
}

/**
 * True when this side can still win by sweeping every remaining game at
 * maxWin–0 (opponent adds 0 pts). Example: 14–32 with 2 games left can still
 * become 34–32. Uses HC-inclusive current totals.
 */
export function canCatchUpRound(args: ClinchArgs & { side: 1 | 2 }): boolean {
  const rem = Math.max(0, args.gamesRemaining);
  let onePts = args.teamOnePoints;
  let twoPts = args.teamTwoPoints;
  let oneWins = args.teamOneGameWins;
  let twoWins = args.teamTwoGameWins;

  if (rem > 0) {
    if (args.side === 1) {
      onePts += args.maxWin * rem;
      oneWins += rem;
      // Best catch-up path: we win each remaining game  maxWin–0.
    } else {
      twoPts += args.maxWin * rem;
      twoWins += rem;
    }
  }

  return (
    decideByPointsThenGames(onePts, twoPts, oneWins, twoWins) === args.side
  );
}

/**
 * Chase number assuming we sweep remaining games maxWin–0 (opponent adds 0).
 * Current point totals must include handicap.
 */
export function pointsNeededFromRemaining(
  args: ClinchArgs & { side: 1 | 2 },
): number | null {
  const rem = args.gamesRemaining;
  if (rem <= 0) return null;
  if (!canCatchUpRound(args)) return null;
  if (clinchRoundWinner(args) != null) return null;

  const ourPts =
    args.side === 1 ? args.teamOnePoints : args.teamTwoPoints;
  const oppPts =
    args.side === 1 ? args.teamTwoPoints : args.teamOnePoints;
  const ourWins =
    args.side === 1 ? args.teamOneGameWins : args.teamTwoGameWins;
  const oppWins =
    args.side === 1 ? args.teamTwoGameWins : args.teamOneGameWins;

  // Best path: opponent stays flat while we bank remaining wins.
  const oppIfWeWinOut = oppPts;
  const canWinOnPointsTie = ourWins + rem > oppWins;
  const needed = canWinOnPointsTie
    ? oppIfWeWinOut - ourPts
    : oppIfWeWinOut - ourPts + 1;

  return Math.max(0, needed);
}

/** Card status for a game in the round list. */
export function gamePlayStatus(
  game: GameScoreState | undefined,
  options?: GameWinnerOptions,
): "complete" | "in-progress" | "not-started" {
  if (
    gameWinner(game, {
      maxScore: options?.maxScore,
      maxLosingScore: options?.maxLosingScore,
      raceTargetOne: options?.raceTargetOne ?? game?.raceTargetOne,
      raceTargetTwo: options?.raceTargetTwo ?? game?.raceTargetTwo,
    })
  ) {
    return "complete";
  }
  const one = game?.teamOneScore ?? 0;
  const two = game?.teamTwoScore ?? 0;
  if (one > 0 || two > 0) return "in-progress";
  return "not-started";
}

function buildRoundDecision(args: ClinchArgs): {
  roundWinner: 1 | 2 | null;
  clinchedEarly: boolean;
  pointsNeeded: { teamOne: number | null; teamTwo: number | null };
  canCatchUp: { teamOne: boolean; teamTwo: boolean };
} {
  const roundComplete = args.gamesRemaining <= 0;
  const roundWinner = clinchRoundWinner(args);
  return {
    roundWinner,
    clinchedEarly: roundWinner != null && !roundComplete,
    pointsNeeded: {
      teamOne: pointsNeededFromRemaining({ ...args, side: 1 }),
      teamTwo: pointsNeededFromRemaining({ ...args, side: 2 }),
    },
    canCatchUp: {
      teamOne: canCatchUpRound({ ...args, side: 1 }),
      teamTwo: canCatchUpRound({ ...args, side: 2 }),
    },
  };
}

/**
 * Sum race/game points for a round, then add that round's handicap
 * to the underdog team's total. Declares a winner when clinched early
 * or when all games are done (points, then game-win tiebreak).
 */
export function tallyRoundPoints(args: {
  match: ScoringMatchDetail;
  draft: ScoringDraft;
  roundNumber: number;
  handicaps?: RoundHandicapResult[];
}): RoundPointsTally {
  const { match, draft, roundNumber } = args;
  const round = match.matchFormat?.rounds.find(
    (item) => item.roundNumber === roundNumber,
  );
  const games = round?.games ?? [];
  const { maxWin, maxLoss } = scoreLimits(match);
  let teamOneGamePoints = 0;
  let teamTwoGamePoints = 0;
  let teamOneGameWins = 0;
  let teamTwoGameWins = 0;
  let gamesComplete = 0;

  for (const game of games) {
    const state = draft.games[gameKey(roundNumber, game.index)];
    teamOneGamePoints += state?.teamOneScore ?? 0;
    teamTwoGamePoints += state?.teamTwoScore ?? 0;
    const winner = gameWinner(state, {
      maxScore: maxWin,
      maxLosingScore: maxLoss,
      raceTargetOne: state?.raceTargetOne,
      raceTargetTwo: state?.raceTargetTwo,
    });
    if (winner) {
      gamesComplete += 1;
      if (winner === 1) teamOneGameWins += 1;
      if (winner === 2) teamTwoGameWins += 1;
    }
  }

  const handicap =
    (args.handicaps ?? computeMatchHandicaps(match, draft)).find(
      (item) => item.round === roundNumber,
    ) ?? null;
  const teamOneHandicap = handicap?.teamOne ?? 0;
  const teamTwoHandicap = handicap?.teamTwo ?? 0;
  const teamOneTotal = teamOneGamePoints + teamOneHandicap;
  const teamTwoTotal = teamTwoGamePoints + teamTwoHandicap;
  const gamesRemaining = Math.max(0, games.length - gamesComplete);
  const roundComplete = games.length > 0 && gamesRemaining === 0;
  const decision = buildRoundDecision({
    teamOnePoints: teamOneTotal,
    teamTwoPoints: teamTwoTotal,
    teamOneGameWins,
    teamTwoGameWins,
    gamesRemaining,
    maxWin,
    maxLoss,
  });

  return {
    roundNumber,
    teamOneGamePoints,
    teamTwoGamePoints,
    teamOneHandicap,
    teamTwoHandicap,
    teamOneTotal,
    teamTwoTotal,
    teamOneGameWins,
    teamTwoGameWins,
    gamesComplete,
    gamesTotal: games.length,
    gamesRemaining,
    roundComplete,
    roundWinner: decision.roundWinner,
    clinchedEarly: decision.clinchedEarly,
    pointsNeeded: decision.pointsNeeded,
    canCatchUp: decision.canCatchUp,
    maxWinPoints: maxWin,
    maxLossPoints: maxLoss,
  };
}

export function tallyAllRoundPoints(
  match: ScoringMatchDetail,
  draft: ScoringDraft,
  handicaps?: RoundHandicapResult[],
): RoundPointsTally[] {
  const resolved = handicaps ?? computeMatchHandicaps(match, draft);
  return (match.matchFormat?.rounds ?? []).map((round) =>
    tallyRoundPoints({
      match,
      draft,
      roundNumber: round.roundNumber,
      handicaps: resolved,
    }),
  );
}

/**
 * Overall points round: live sum of every round's totals (game points + HC).
 * Awarded only when the opponent can no longer catch up on remaining points
 * (same clinch + game-win tiebreak rules as base rounds).
 */
export function tallyMatchPointsRound(args: {
  match: ScoringMatchDetail;
  draft: ScoringDraft;
  roundTallies?: RoundPointsTally[];
}): RoundPointsTally {
  const tallies =
    args.roundTallies ?? tallyAllRoundPoints(args.match, args.draft);
  const { maxWin, maxLoss } = scoreLimits(args.match);
  const teamOneGamePoints = tallies.reduce(
    (sum, round) => sum + round.teamOneGamePoints,
    0,
  );
  const teamTwoGamePoints = tallies.reduce(
    (sum, round) => sum + round.teamTwoGamePoints,
    0,
  );
  const teamOneHandicap = tallies.reduce(
    (sum, round) => sum + round.teamOneHandicap,
    0,
  );
  const teamTwoHandicap = tallies.reduce(
    (sum, round) => sum + round.teamTwoHandicap,
    0,
  );
  const teamOneGameWins = tallies.reduce(
    (sum, round) => sum + round.teamOneGameWins,
    0,
  );
  const teamTwoGameWins = tallies.reduce(
    (sum, round) => sum + round.teamTwoGameWins,
    0,
  );
  const gamesComplete = tallies.reduce(
    (sum, round) => sum + round.gamesComplete,
    0,
  );
  const gamesTotal = tallies.reduce((sum, round) => sum + round.gamesTotal, 0);
  const gamesRemaining = Math.max(0, gamesTotal - gamesComplete);
  const roundComplete = gamesTotal > 0 && gamesRemaining === 0;
  const teamOneTotal = teamOneGamePoints + teamOneHandicap;
  const teamTwoTotal = teamTwoGamePoints + teamTwoHandicap;
  const decision = buildRoundDecision({
    teamOnePoints: teamOneTotal,
    teamTwoPoints: teamTwoTotal,
    teamOneGameWins,
    teamTwoGameWins,
    gamesRemaining,
    maxWin,
    maxLoss,
  });

  return {
    roundNumber: MATCH_POINTS_ROUND,
    teamOneGamePoints,
    teamTwoGamePoints,
    teamOneHandicap,
    teamTwoHandicap,
    teamOneTotal,
    teamTwoTotal,
    teamOneGameWins,
    teamTwoGameWins,
    gamesComplete,
    gamesTotal,
    gamesRemaining,
    roundComplete,
    roundWinner: decision.roundWinner,
    clinchedEarly: decision.clinchedEarly,
    pointsNeeded: decision.pointsNeeded,
    canCatchUp: decision.canCatchUp,
    maxWinPoints: maxWin,
    maxLossPoints: maxLoss,
  };
}

export function parsedFormatFromMatch(
  match: ScoringMatchDetail,
): ParsedMatchFormat {
  const rounds = match.matchFormat?.rounds;
  if (!rounds?.length) {
    return buildDefaultFivePlayerFormat(
      match.numberOfSets || 5,
      match.numberOfSets || 5,
    );
  }
  return {
    numOfPlayers: match.matchFormat?.teamOnePlayers.length || 5,
    rounds: rounds.map((round) => ({
      roundNumber: round.roundNumber,
      games: round.games.map((game) => ({
        homePlayers: [game.playerOne.index],
        awayPlayers: [game.playerTwo.index],
        gameType: game.gameType === "SINGLES" ? "S" : game.gameType,
      })),
    })),
  };
}

function lineupRatings(
  lineup: (string | null)[],
  players: ScoringPlayer[],
): number[] {
  return lineup.map((id) => ratingForPlayer(players, id));
}

/** LMS HDCP column / `teamOneHandicaps` expects the player's Fargo rating. */
export function ratingForPlayer(
  players: ScoringPlayer[],
  id: string | null | undefined,
): number {
  if (!id) return 0;
  const player = players.find((entry) => entry.id === id);
  if (!player) return 0;
  const rating = player.fargoRating ?? player.handicap;
  return rating != null && Number.isFinite(rating) ? Number(rating) : 0;
}

export function computeMatchHandicaps(
  match: ScoringMatchDetail,
  draft: ScoringDraft,
): RoundHandicapResult[] {
  if (!match.isHandicapped) return [];
  return calculateRoundBasedHandicaps({
    format: parsedFormatFromMatch(match),
    teamOneRatings: lineupRatings(draft.teamOneLineup, match.teamOnePlayers),
    teamTwoRatings: lineupRatings(draft.teamTwoLineup, match.teamTwoPlayers),
    pointSystem: String(match.pointsForWin || 10),
    handicapPercent: match.handicapPercentage ?? 1,
    handicapCap: match.maximumAllowedHandicap ?? 50,
  });
}

/**
 * Mirror LMS scoresheet HDCP cells: each game stores the assigned player's
 * Fargo. Round-points handicap is computed separately via
 * `computeMatchHandicaps` and must not be written here.
 */
export function applyHandicapsToDraft(
  match: ScoringMatchDetail,
  draft: ScoringDraft,
): ScoringDraft {
  const games: ScoringDraft["games"] = { ...draft.games };

  for (const round of match.matchFormat?.rounds ?? []) {
    for (const game of round.games) {
      const key = gameKey(round.roundNumber, game.index);
      const existing = games[key];
      if (!existing) continue;
      const teamOnePlayerId =
        existing.teamOnePlayerId ??
        draft.teamOneLineup[(game.playerOne.index || 1) - 1] ??
        null;
      const teamTwoPlayerId =
        existing.teamTwoPlayerId ??
        draft.teamTwoLineup[(game.playerTwo.index || 1) - 1] ??
        null;
      games[key] = {
        ...existing,
        teamOneHandicap: ratingForPlayer(match.teamOnePlayers, teamOnePlayerId),
        teamTwoHandicap: ratingForPlayer(match.teamTwoPlayers, teamTwoPlayerId),
      };
    }
  }

  return { ...draft, games };
}

export function loadDraft(matchId: string): ScoringDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SCORING_DRAFT_PREFIX + matchId);
    if (!raw) return null;
    return JSON.parse(raw) as ScoringDraft;
  } catch {
    return null;
  }
}

export function saveDraft(draft: ScoringDraft): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    SCORING_DRAFT_PREFIX + draft.matchId,
    JSON.stringify({
      ...draft,
      updatedAt: draft.updatedAt || new Date().toISOString(),
    }),
  );
}

export function clearDraft(matchId: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SCORING_DRAFT_PREFIX + matchId);
}

/**
 * Build the LMS verticalmatch payload.
 * Field names follow the official BCAPL app / web scoresheet models.
 *
 * `teamOneHandicaps` / `teamTwoHandicaps` are the players' Fargo ratings (LMS
 * HDCP column). Do not send calculated round-points HC there, and keep
 * `*RoundsBonus` at 0 — those are Operator Bonus fields; LMS awards round HC
 * from the Fargos (e.g. the +4 under the round total).
 */
export function buildVerticalMatchPayload(args: {
  match: ScoringMatchDetail;
  draft: ScoringDraft;
  scoreKeeper: string;
  dateScored?: string;
}): Record<string, unknown> {
  const { match, draft, scoreKeeper } = args;

  const rounds = (match.matchFormat?.rounds ?? []).map((round) => {
    const games = round.games.map((game) => {
      const state = draft.games[gameKey(round.roundNumber, game.index)];
      const teamOnePlayerId =
        state?.teamOnePlayerId ??
        draft.teamOneLineup[(game.playerOne.index || 1) - 1] ??
        null;
      const teamTwoPlayerId =
        state?.teamTwoPlayerId ??
        draft.teamTwoLineup[(game.playerTwo.index || 1) - 1] ??
        null;

      const teamOneScore = state?.teamOneScore ?? 0;
      const teamTwoScore = state?.teamTwoScore ?? 0;
      const winAdornment = state?.winAdornment ?? "";
      const isWinZip =
        state?.isWinZip ||
        winAdornment.toUpperCase().startsWith("WZ") ||
        false;

      return {
        gameType: game.gameType,
        gameIndex: game.index,
        breakingTeam: state?.breakingTeam ?? game.breakingTeam ?? 1,
        gameFormatType: game.gameFormatType,
        multiplier: game.multiplier,
        playerOne: teamOnePlayerId,
        playerTwo: teamTwoPlayerId,
        teamOnePlayers: teamOnePlayerId ? [teamOnePlayerId] : [],
        teamTwoPlayers: teamTwoPlayerId ? [teamTwoPlayerId] : [],
        teamOnePlayerIndexes: [game.playerOne.index],
        teamTwoPlayerIndexes: [game.playerTwo.index],
        teamOneScore,
        teamTwoScore,
        winAdornment,
        isWinZip,
        teamOneHandicaps: [ratingForPlayer(match.teamOnePlayers, teamOnePlayerId)],
        teamTwoHandicaps: [ratingForPlayer(match.teamTwoPlayers, teamTwoPlayerId)],
      };
    });

    return {
      roundNumber: round.roundNumber,
      roundIndex: round.roundNumber,
      games,
    };
  });

  return {
    matchId: match.id,
    MatchId: match.id,
    dateScored: args.dateScored ?? new Date().toISOString(),
    DateScored: args.dateScored ?? new Date().toISOString(),
    scoreKeeper,
    ScoreKeeper: scoreKeeper,
    rounds,
    Rounds: rounds,
    teamOneRoundsBonus: 0,
    teamTwoRoundsBonus: 0,
    teamOneGamesBonus: 0,
    teamTwoGamesBonus: 0,
    createHandoff: false,
  };
}

export function applyQuickWin(
  game: GameScoreState,
  winner: 1 | 2,
  options: {
    maxScore: number;
    maxLosingScore: number;
    adornment?: WinAdornment;
    raceTargetOne?: number | null;
    raceTargetTwo?: number | null;
  },
): GameScoreState {
  const adornment = options.adornment ?? "";
  const race = resolvedRaceTargets(game, options);
  const winScore =
    race != null
      ? winner === 1
        ? race.raceOne
        : race.raceTwo
      : options.maxScore;
  const maxLoserScore =
    race != null
      ? winner === 1
        ? Math.max(0, race.raceTwo - 1)
        : Math.max(0, race.raceOne - 1)
      : options.maxLosingScore;
  const currentLoser =
    winner === 1 ? (game.teamTwoScore ?? 0) : (game.teamOneScore ?? 0);
  const loseScore =
    adornment === "WZ"
      ? 0
      : Math.min(Math.max(0, currentLoser), maxLoserScore);
  return {
    ...game,
    teamOneScore: winner === 1 ? winScore : loseScore,
    teamTwoScore: winner === 2 ? winScore : loseScore,
    winAdornment: adornment,
    isWinZip: adornment === "WZ",
    raceTargetOne: options.raceTargetOne ?? game.raceTargetOne,
    raceTargetTwo: options.raceTargetTwo ?? game.raceTargetTwo,
  };
}

/** Clamp a side's score selection into legal race options. */
export function applyRaceScore(
  game: GameScoreState,
  side: 1 | 2,
  value: number,
  options: {
    maxScore: number;
    maxLosingScore: number;
    raceTargetOne?: number | null;
    raceTargetTwo?: number | null;
    allowedScores?: readonly number[];
  },
): GameScoreState {
  const race = resolvedRaceTargets(game, options);
  const maxWin = options.maxScore > 0 ? options.maxScore : 10;
  const maxLoss = options.maxLosingScore >= 0 ? options.maxLosingScore : 7;
  const allowed = new Set<number>(
    options.allowedScores ??
      (race
        ? Array.from(
            {
              length:
                (side === 1 ? race.raceOne : race.raceTwo) + 1,
            },
            (_, i) => i,
          )
        : RACE_SCORE_OPTIONS),
  );
  const picked = allowed.has(value) ? value : 0;

  let teamOneScore = game.teamOneScore ?? 0;
  let teamTwoScore = game.teamTwoScore ?? 0;

  if (race) {
    if (side === 1) {
      teamOneScore = Math.min(picked, race.raceOne);
      if (teamOneScore >= race.raceOne) {
        teamTwoScore = Math.min(teamTwoScore, Math.max(0, race.raceTwo - 1));
      } else if (teamTwoScore >= race.raceTwo) {
        teamOneScore = Math.min(teamOneScore, Math.max(0, race.raceOne - 1));
      }
    } else {
      teamTwoScore = Math.min(picked, race.raceTwo);
      if (teamTwoScore >= race.raceTwo) {
        teamOneScore = Math.min(teamOneScore, Math.max(0, race.raceOne - 1));
      } else if (teamOneScore >= race.raceOne) {
        teamTwoScore = Math.min(teamTwoScore, Math.max(0, race.raceTwo - 1));
      }
    }
  } else if (side === 1) {
    teamOneScore = picked;
    if (picked === maxWin) {
      teamTwoScore = Math.min(teamTwoScore, maxLoss);
    } else if (teamTwoScore === maxWin) {
      teamOneScore = Math.min(picked, maxLoss);
    }
  } else {
    teamTwoScore = picked;
    if (picked === maxWin) {
      teamOneScore = Math.min(teamOneScore, maxLoss);
    } else if (teamOneScore === maxWin) {
      teamTwoScore = Math.min(picked, maxLoss);
    }
  }

  const next: GameScoreState = {
    ...game,
    teamOneScore,
    teamTwoScore,
    raceTargetOne: options.raceTargetOne ?? game.raceTargetOne,
    raceTargetTwo: options.raceTargetTwo ?? game.raceTargetTwo,
  };
  if (
    !gameWinner(next, {
      maxScore: maxWin,
      maxLosingScore: maxLoss,
      raceTargetOne: next.raceTargetOne,
      raceTargetTwo: next.raceTargetTwo,
    })
  ) {
    next.winAdornment = "";
    next.isWinZip = false;
  }
  return next;
}

export function normalizeScoringPlayer(raw: Record<string, unknown>): ScoringPlayer {
  const rating = raw.fargoRating;
  const handicap = raw.handicap;
  return {
    id: String(raw.id ?? ""),
    readableId:
      typeof raw.readableId === "number"
        ? raw.readableId
        : raw.readableId
          ? Number(raw.readableId)
          : null,
    firstName: String(raw.firstName ?? ""),
    lastName: String(raw.lastName ?? ""),
    nickname: raw.nickname ? String(raw.nickname) : null,
    fargoRating:
      rating == null || rating === ""
        ? null
        : Number(rating),
    handicap:
      handicap == null || handicap === ""
        ? null
        : Number(handicap),
    showOnRoster: raw.showOnRoster !== false,
  };
}
