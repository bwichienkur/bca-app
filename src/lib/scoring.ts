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
  const next: ScoringDraft = {
    ...draft,
    updatedAt: new Date().toISOString(),
    games: { ...draft.games },
  };

  for (const round of match.matchFormat?.rounds ?? []) {
    for (const game of round.games) {
      const key = gameKey(round.roundNumber, game.index);
      const existing = next.games[key] ?? {
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
      next.games[key] = {
        ...existing,
        teamOneScore: existing.teamOneScore ?? 0,
        teamTwoScore: existing.teamTwoScore ?? 0,
        teamOnePlayerId:
          next.teamOneLineup[(game.playerOne.index || 1) - 1] ?? null,
        teamTwoPlayerId:
          next.teamTwoLineup[(game.playerTwo.index || 1) - 1] ?? null,
      };
    }
  }
  return applyHandicapsToDraft(match, next);
}

/** A game is complete only when one side has a higher score (a winner). */
export function gameWinner(game: GameScoreState | undefined): 1 | 2 | null {
  if (!game) return null;
  if (game.teamOneScore == null || game.teamTwoScore == null) return null;
  if (game.teamOneScore === game.teamTwoScore) return null;
  return game.teamOneScore > game.teamTwoScore ? 1 : 2;
}

export function isGameScored(game: GameScoreState | undefined): boolean {
  return gameWinner(game) != null;
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

export function tallyDraft(draft: ScoringDraft): {
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
    const winner = gameWinner(game);
    if (!winner) continue;
    scored += 1;
    if (winner === 1) teamOneWins += 1;
    if (winner === 2) teamTwoWins += 1;
  }
  return { teamOneWins, teamTwoWins, scored, total: games.length };
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
  teamOnePoints: number;
  teamTwoPoints: number;
  teamOneGameWins: number;
  teamTwoGameWins: number;
  gamesRemaining: number;
  maxWin: number;
};

/**
 * Side has clinched when even their worst remaining case (lose all at 0 pts)
 * still beats the opponent's best case (win all at maxWin), using the
 * points-then-game-wins tiebreak.
 */
export function hasClinchedRound(args: ClinchArgs & { side: 1 | 2 }): boolean {
  const rem = Math.max(0, args.gamesRemaining);
  let onePts = args.teamOnePoints;
  let twoPts = args.teamTwoPoints;
  let oneWins = args.teamOneGameWins;
  let twoWins = args.teamTwoGameWins;

  if (rem > 0) {
    if (args.side === 1) {
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
 * Chase number: points `side` still needs from remaining games to beat the
 * opponent's ceiling (opp current + rem×maxWin), with game-win tiebreak
 * available if they can still win enough remaining games.
 */
export function pointsNeededFromRemaining(
  args: ClinchArgs & { side: 1 | 2 },
): number | null {
  const rem = args.gamesRemaining;
  if (rem <= 0) return null;
  if (clinchRoundWinner(args) != null) return null;

  const ourPts =
    args.side === 1 ? args.teamOnePoints : args.teamTwoPoints;
  const oppPts =
    args.side === 1 ? args.teamTwoPoints : args.teamOnePoints;
  const ourWins =
    args.side === 1 ? args.teamOneGameWins : args.teamTwoGameWins;
  const oppWins =
    args.side === 1 ? args.teamTwoGameWins : args.teamOneGameWins;

  const oppCeiling = oppPts + args.maxWin * rem;
  // Best case for tiebreak: we take every remaining game win.
  const canWinOnPointsTie = ourWins + rem > oppWins;
  const needed = canWinOnPointsTie
    ? oppCeiling - ourPts
    : oppCeiling - ourPts + 1;

  return Math.max(0, needed);
}

function buildRoundDecision(args: ClinchArgs): {
  roundWinner: 1 | 2 | null;
  clinchedEarly: boolean;
  pointsNeeded: { teamOne: number | null; teamTwo: number | null };
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
    const winner = gameWinner(state);
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

/** Synthetic round number for overall match-points (R6). */
export const MATCH_POINTS_ROUND = 6;

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
  return lineup.map((id) => {
    if (!id) return 0;
    return players.find((player) => player.id === id)?.fargoRating ?? 0;
  });
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

export function applyHandicapsToDraft(
  match: ScoringMatchDetail,
  draft: ScoringDraft,
): ScoringDraft {
  const results = computeMatchHandicaps(match, draft);
  if (!results.length) return draft;

  const byRound = new Map(results.map((result) => [result.round, result]));
  const games: ScoringDraft["games"] = { ...draft.games };

  for (const round of match.matchFormat?.rounds ?? []) {
    const result = byRound.get(round.roundNumber);
    if (!result) continue;
    for (const game of round.games) {
      const key = gameKey(round.roundNumber, game.index);
      const existing = games[key];
      if (!existing) continue;
      games[key] = {
        ...existing,
        teamOneHandicap: result.teamOne,
        teamTwoHandicap: result.teamTwo,
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
    JSON.stringify({ ...draft, updatedAt: new Date().toISOString() }),
  );
}

export function clearDraft(matchId: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SCORING_DRAFT_PREFIX + matchId);
}

/**
 * Build the LMS verticalmatch payload.
 * Field names follow the official BCAPL app / web scoresheet models.
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
        teamOneHandicaps: [state?.teamOneHandicap ?? 0],
        teamTwoHandicaps: [state?.teamTwoHandicap ?? 0],
      };
    });

    return {
      roundNumber: round.roundNumber,
      roundIndex: round.roundNumber,
      games,
    };
  });

  const roundHandicaps = computeMatchHandicaps(match, draft);
  return {
    matchId: match.id,
    MatchId: match.id,
    dateScored: args.dateScored ?? new Date().toISOString(),
    DateScored: args.dateScored ?? new Date().toISOString(),
    scoreKeeper,
    ScoreKeeper: scoreKeeper,
    rounds,
    Rounds: rounds,
    teamOneRoundsBonus: roundHandicaps.reduce(
      (sum, round) => sum + round.teamOne,
      0,
    ),
    teamTwoRoundsBonus: roundHandicaps.reduce(
      (sum, round) => sum + round.teamTwo,
      0,
    ),
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
  },
): GameScoreState {
  const adornment = options.adornment ?? "";
  const winScore = options.maxScore;
  const loseScore = adornment === "WZ" ? 0 : 0;
  return {
    ...game,
    teamOneScore: winner === 1 ? winScore : loseScore,
    teamTwoScore: winner === 2 ? winScore : loseScore,
    winAdornment: adornment,
    isWinZip: adornment === "WZ",
  };
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
