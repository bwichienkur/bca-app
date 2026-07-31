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

export type RoundHandicapResult = {
  round: number;
  teamOne: number;
  teamTwo: number;
  teamOneExpected: number;
  teamTwoExpected: number;
  matchups: {
    homeIndexes: number[];
    awayIndexes: number[];
    homeRating: number;
    awayRating: number;
  }[];
};

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
    if (/^ROUND\s+/i.test(line.trim())) {
      if (current) rounds.push(current);
      roundNumber += 1;
      current = { roundNumber, games: [] };
      continue;
    }

    if (!current) continue;

    if (/GAME S/i.test(line)) {
      const homePlayers = (line.match(/H\d+/g) ?? []).map((token) =>
        parseInt(token.slice(1), 10),
      );
      const awayPlayers = (line.match(/A\d+/g) ?? []).map((token) =>
        parseInt(token.slice(1), 10),
      );
      current.games.push({
        homePlayers,
        awayPlayers,
        gameType: "S",
      });
    }
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
      const homeRatings = game.homePlayers.map(
        (index) => teamOneRatings[index - 1] ?? 0,
      );
      const awayRatings = game.awayPlayers.map(
        (index) => teamTwoRatings[index - 1] ?? 0,
      );
      const homeRating = average(homeRatings);
      const awayRating = average(awayRatings);
      const scores = expectedGameScores(homeRating, awayRating, pointSystem);
      teamOneExpected += scores.teamOne;
      teamTwoExpected += scores.teamTwo;
      matchups.push({
        homeIndexes: game.homePlayers,
        awayIndexes: game.awayPlayers,
        homeRating,
        awayRating,
      });
    }

    const diff = Math.abs(teamOneExpected - teamTwoExpected);
    const points = applyCapAndPercent(diff, handicapPercent, handicapCap);

    return {
      round: round.roundNumber,
      teamOne:
        teamOneExpected >= teamTwoExpected
          ? 0
          : points,
      teamTwo:
        teamTwoExpected >= teamOneExpected
          ? 0
          : points,
      teamOneExpected,
      teamTwoExpected,
      matchups,
    };
  });
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
      });
    }
    parsedRounds.push({ roundNumber: r + 1, games });
  }
  return { numOfPlayers: playersPerTeam, rounds: parsedRounds };
}
