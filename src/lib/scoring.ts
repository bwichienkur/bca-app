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
        teamOneScore: null,
        teamTwoScore: null,
        winAdornment: "",
        isWinZip: false,
        breakingTeam: (game.breakingTeam === 2 ? 2 : 1) as 1 | 2,
        teamOneHandicap: null,
        teamTwoHandicap: null,
      };
    }
  }

  void preferMyTeamFirst;
  return draft;
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
        teamOneScore: null,
        teamTwoScore: null,
        winAdornment: "" as WinAdornment,
        isWinZip: false,
        breakingTeam: (game.breakingTeam === 2 ? 2 : 1) as 1 | 2,
        teamOneHandicap: null,
        teamTwoHandicap: null,
      };
      next.games[key] = {
        ...existing,
        teamOnePlayerId:
          next.teamOneLineup[(game.playerOne.index || 1) - 1] ?? null,
        teamTwoPlayerId:
          next.teamTwoLineup[(game.playerTwo.index || 1) - 1] ?? null,
      };
    }
  }
  return next;
}

export function isGameScored(game: GameScoreState | undefined): boolean {
  if (!game) return false;
  return game.teamOneScore != null && game.teamTwoScore != null;
}

export function gameWinner(game: GameScoreState): 1 | 2 | null {
  if (!isGameScored(game)) return null;
  if ((game.teamOneScore ?? 0) === (game.teamTwoScore ?? 0)) return null;
  return (game.teamOneScore ?? 0) > (game.teamTwoScore ?? 0) ? 1 : 2;
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
    if (!isGameScored(game)) continue;
    scored += 1;
    const winner = gameWinner(game);
    if (winner === 1) teamOneWins += 1;
    if (winner === 2) teamTwoWins += 1;
  }
  return { teamOneWins, teamTwoWins, scored, total: games.length };
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
