/**
 * FargoRate league handicap math ported from
 * https://leaguecalc.fargorate.com/ (RaceCalcController).
 *
 * Docs:
 * https://www.playcsipool.com/csinews/all-new-fargorate-league-handicap-calculator-explained
 */

export type PointSystem = "1" | "10" | "17" | "TRIOS";

export type FargoHandicapType =
  | "RoundBased"
  | "FullMatchBased"
  | "MatchBased";

export type ParsedGame = {
  homePlayers: number[]; // 1-based indexes into lineup
  awayPlayers: number[];
  gameType: "S" | "D" | "R" | string;
  /** Race length from `RL` token when present (GAME R). */
  raceLength?: number | null;
};

export type ParsedRound = {
  roundNumber: number;
  games: ParsedGame[];
};

export type ParsedMatchFormat = {
  numOfPlayers: number;
  rounds: ParsedRound[];
};

export type DivisionFormat = {
  template: string;
  pointSystem: PointSystem | string;
  fargoRateHandicapType: FargoHandicapType | string;
  handicapCap: number;
  handicapPercent: number;
};

export type RoundHandicapMatchup = {
  homeIndexes: number[];
  awayIndexes: number[];
  homeRating: number;
  awayRating: number;
  gameType: string;
  raceLength?: number | null;
  /** Per-game expected points (team one / team two). */
  teamOneExpected?: number;
  teamTwoExpected?: number;
  /** MatchBased: games awarded on this individual game. */
  teamOneGames?: number;
  teamTwoGames?: number;
};

export type RoundHandicapResult = {
  round: number;
  teamOne: number;
  teamTwo: number;
  teamOneExpected: number;
  teamTwoExpected: number;
  matchups: RoundHandicapMatchup[];
  /** Label override for UI (e.g. "Night" for FullMatchBased). */
  label?: string;
};

function normalizeHandicapType(value: string | undefined | null): FargoHandicapType {
  const raw = (value ?? "RoundBased").trim();
  if (/fullmatch/i.test(raw)) return "FullMatchBased";
  if (/^matchbased$/i.test(raw) || raw === "MatchBased") return "MatchBased";
  return "RoundBased";
}

function gameMatchup(
  game: ParsedGame,
  teamOneRatings: number[],
  teamTwoRatings: number[],
  pointSystem: string,
): RoundHandicapMatchup & {
  teamOneExpected: number;
  teamTwoExpected: number;
} {
  const homeRatings = game.homePlayers.map(
    (index) => teamOneRatings[index - 1] ?? 0,
  );
  const awayRatings = game.awayPlayers.map(
    (index) => teamTwoRatings[index - 1] ?? 0,
  );
  const homeRating = average(homeRatings);
  const awayRating = average(awayRatings);
  const scores = expectedGameScores(homeRating, awayRating, pointSystem);
  return {
    homeIndexes: game.homePlayers,
    awayIndexes: game.awayPlayers,
    homeRating,
    awayRating,
    gameType: game.gameType,
    raceLength: game.raceLength ?? null,
    teamOneExpected: scores.teamOne,
    teamTwoExpected: scores.teamTwo,
  };
}

function awardFromExpected(
  teamOneExpected: number,
  teamTwoExpected: number,
  handicapPercent: number,
  handicapCap: number,
): { teamOne: number; teamTwo: number } {
  const diff = Math.abs(teamOneExpected - teamTwoExpected);
  const points = applyCapAndPercent(diff, handicapPercent, handicapCap);
  return {
    teamOne: teamOneExpected >= teamTwoExpected ? 0 : points,
    teamTwo: teamTwoExpected >= teamOneExpected ? 0 : points,
  };
}

function winProbability(ratingOne: number, ratingTwo: number): number {
  return 1.0 / (1 + Math.pow(2, (ratingTwo - ratingOne) / 100.0));
}

function average(ratings: number[]): number {
  if (!ratings.length) return 0;
  return ratings.reduce((sum, value) => sum + value, 0) / ratings.length;
}

/** Expected points for one game under a point system (team one perspective pair). */
export function expectedGameScores(
  ratingOne: number,
  ratingTwo: number,
  pointSystem: string,
): { teamOne: number; teamTwo: number } {
  const p = winProbability(ratingOne, ratingTwo);

  if (pointSystem === "17") {
    return {
      teamOne:
        p * (17.0 - (7.4 - 0.0062 * ratingOne)) +
        (1.0 - p) * (7.4 - 0.0062 * ratingTwo),
      teamTwo:
        (1.0 - p) * (17.0 - (7.4 - 0.0062 * ratingTwo)) +
        p * (7.4 - 0.0062 * ratingOne),
    };
  }

  if (pointSystem === "1") {
    return { teamOne: p, teamTwo: 1 - p };
  }

  // Default / "10"
  return {
    teamOne: p * 10.0 + (1.0 - p) * (7.4 - 0.0062 * ratingTwo),
    teamTwo: (1.0 - p) * 10.0 + p * (7.4 - 0.0062 * ratingOne),
  };
}

export function parseDivisionTemplate(template: string): ParsedMatchFormat {
  const playerLines = template.match(/^.*PLAYER H.*$/gm) ?? [];
  const numOfPlayers = playerLines.length;
  const rounds: ParsedRound[] = [];
  let current: ParsedRound | null = null;
  let roundNumber = 0;

  const lines = template.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^ROUND\s+/i.test(trimmed)) {
      if (current) rounds.push(current);
      roundNumber += 1;
      current = { roundNumber, games: [] };
      continue;
    }

    if (!current) continue;

    const gameMatch = /^GAME\s+([SRD])\b(.*)$/i.exec(trimmed);
    if (!gameMatch) continue;

    const gameType = gameMatch[1]!.toUpperCase();
    const rest = gameMatch[2] ?? "";
    const homePlayers = (rest.match(/H\d+/gi) ?? []).map((token) =>
      parseInt(token.slice(1), 10),
    );
    const awayPlayers = (rest.match(/A\d+/gi) ?? []).map((token) =>
      parseInt(token.slice(1), 10),
    );
    const raceToken = /RL(\d+)/i.exec(rest);
    const raceLength = raceToken ? Number(raceToken[1]) : null;

    current.games.push({
      homePlayers: homePlayers.length ? homePlayers : [1],
      awayPlayers: awayPlayers.length ? awayPlayers : [1],
      gameType,
      raceLength:
        raceLength != null && Number.isFinite(raceLength) ? raceLength : null,
    });
  }

  if (current) rounds.push(current);
  return { numOfPlayers, rounds };
}

function applyCapAndPercent(
  rawDiff: number,
  handicapPercent: number,
  handicapCap: number,
): number {
  const scaled = Math.floor(rawDiff * (handicapPercent || 1));
  if (!handicapCap || handicapCap <= 0) return scaled;
  return Math.min(scaled, handicapCap);
}

/**
 * Round-based handicaps (Palm Beach / LMS default for this league).
 * Uses actual per-game matchups from the division template.
 */
export function calculateRoundBasedHandicaps(options: {
  format: ParsedMatchFormat;
  teamOneRatings: number[]; // index 0 = H1
  teamTwoRatings: number[]; // index 0 = A1
  pointSystem: string;
  handicapPercent?: number;
  handicapCap?: number;
}): RoundHandicapResult[] {
  const {
    format,
    teamOneRatings,
    teamTwoRatings,
    pointSystem,
    handicapPercent = 1,
    handicapCap = 50,
  } = options;

  return format.rounds.map((round) => {
    let teamOneExpected = 0;
    let teamTwoExpected = 0;
    const matchups: RoundHandicapResult["matchups"] = [];

    for (const game of round.games) {
      const matchup = gameMatchup(
        game,
        teamOneRatings,
        teamTwoRatings,
        pointSystem,
      );
      teamOneExpected += matchup.teamOneExpected;
      teamTwoExpected += matchup.teamTwoExpected;
      matchups.push(matchup);
    }

    const award = awardFromExpected(
      teamOneExpected,
      teamTwoExpected,
      handicapPercent,
      handicapCap,
    );

    return {
      round: round.roundNumber,
      teamOne: award.teamOne,
      teamTwo: award.teamTwo,
      teamOneExpected,
      teamTwoExpected,
      matchups,
    };
  });
}

/**
 * One handicap for the whole night — sum expected points across every game.
 */
export function calculateFullMatchBasedHandicaps(options: {
  format: ParsedMatchFormat;
  teamOneRatings: number[];
  teamTwoRatings: number[];
  pointSystem: string;
  handicapPercent?: number;
  handicapCap?: number;
}): RoundHandicapResult[] {
  const {
    format,
    teamOneRatings,
    teamTwoRatings,
    pointSystem,
    handicapPercent = 1,
    handicapCap = 50,
  } = options;

  let teamOneExpected = 0;
  let teamTwoExpected = 0;
  const matchups: RoundHandicapResult["matchups"] = [];

  for (const round of format.rounds) {
    for (const game of round.games) {
      const matchup = gameMatchup(
        game,
        teamOneRatings,
        teamTwoRatings,
        pointSystem,
      );
      teamOneExpected += matchup.teamOneExpected;
      teamTwoExpected += matchup.teamTwoExpected;
      matchups.push(matchup);
    }
  }

  const award = awardFromExpected(
    teamOneExpected,
    teamTwoExpected,
    handicapPercent,
    handicapCap,
  );

  return [
    {
      round: 1,
      label: "Night",
      teamOne: award.teamOne,
      teamTwo: award.teamTwo,
      teamOneExpected,
      teamTwoExpected,
      matchups,
    },
  ];
}

/**
 * Handicap each individual scoresheet game on its own expected-points edge.
 */
export function calculateMatchBasedHandicaps(options: {
  format: ParsedMatchFormat;
  teamOneRatings: number[];
  teamTwoRatings: number[];
  pointSystem: string;
  handicapPercent?: number;
  handicapCap?: number;
}): RoundHandicapResult[] {
  const {
    format,
    teamOneRatings,
    teamTwoRatings,
    pointSystem,
    handicapPercent = 1,
    handicapCap = 50,
  } = options;

  const results: RoundHandicapResult[] = [];
  let sequence = 0;

  for (const round of format.rounds) {
    for (const game of round.games) {
      sequence += 1;
      const matchup = gameMatchup(
        game,
        teamOneRatings,
        teamTwoRatings,
        pointSystem,
      );
      const award = awardFromExpected(
        matchup.teamOneExpected,
        matchup.teamTwoExpected,
        handicapPercent,
        handicapCap,
      );
      results.push({
        round: sequence,
        label: `R${round.roundNumber} · G${sequence}`,
        teamOne: award.teamOne,
        teamTwo: award.teamTwo,
        teamOneExpected: matchup.teamOneExpected,
        teamTwoExpected: matchup.teamTwoExpected,
        matchups: [
          {
            ...matchup,
            teamOneGames: award.teamOne,
            teamTwoGames: award.teamTwo,
          },
        ],
      });
    }
  }

  return results;
}

/** Dispatch to the calculator matching LMS `fargoRateHandicapType`. */
export function calculateDivisionHandicaps(options: {
  format: ParsedMatchFormat;
  teamOneRatings: number[];
  teamTwoRatings: number[];
  pointSystem: string;
  handicapPercent?: number;
  handicapCap?: number;
  fargoRateHandicapType?: string | null;
}): RoundHandicapResult[] {
  const type = normalizeHandicapType(options.fargoRateHandicapType);
  if (type === "FullMatchBased") {
    return calculateFullMatchBasedHandicaps(options);
  }
  if (type === "MatchBased") {
    return calculateMatchBasedHandicaps(options);
  }
  return calculateRoundBasedHandicaps(options);
}

export function handicapTypeLabel(value: string | null | undefined): string {
  const type = normalizeHandicapType(value);
  if (type === "FullMatchBased") return "Full-match HC";
  if (type === "MatchBased") return "Per-match HC";
  return "Round HC";
}

/** Build a default n-player round-robin if division format is unavailable. */
export function buildDefaultFivePlayerFormat(
  playersPerTeam = 5,
  rounds = 5,
): ParsedMatchFormat {
  const parsedRounds: ParsedRound[] = [];
  for (let r = 0; r < rounds; r += 1) {
    const games: ParsedGame[] = [];
    for (let i = 0; i < playersPerTeam; i += 1) {
      const home = i + 1;
      const away = ((i + r) % playersPerTeam) + 1;
      games.push({
        homePlayers: [home],
        awayPlayers: [away],
        gameType: "S",
        raceLength: null,
      });
    }
    parsedRounds.push({ roundNumber: r + 1, games });
  }
  return { numOfPlayers: playersPerTeam, rounds: parsedRounds };
}
