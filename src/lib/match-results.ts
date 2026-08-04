import * as cheerio from "cheerio";
import { LMS_BASE } from "./constants";
import { LMS_CACHE_TTL, lmsCacheKey, withLmsCache } from "./lms-cache";
import {
  gameWinner,
  type DraftBoardSummary,
} from "./scoring";

export type LmsMatchGameScore = {
  round: number;
  row: number;
  teamOneScore: number;
  teamTwoScore: number;
};

/**
 * Parse LMS public MatchResultBCAPL HTML into per-game scores.
 * Scores live on disabled `.row-score` inputs with data-round/row/team.
 */
export function parseMatchResultHtml(html: string): {
  games: LmsMatchGameScore[];
} {
  const $ = cheerio.load(html);
  const byKey = new Map<string, LmsMatchGameScore>();

  $(".scoresheet-input.row-score").each((_, el) => {
    const $el = $(el);
    const round = Number($el.attr("data-round"));
    const row = Number($el.attr("data-row"));
    const team = Number($el.attr("data-team"));
    if (!Number.isFinite(round) || !Number.isFinite(row)) return;
    if (team !== 1 && team !== 2) return;
    const value = Number($el.attr("value") ?? 0);
    const key = `${round}-${row}`;
    const game = byKey.get(key) ?? {
      round,
      row,
      teamOneScore: 0,
      teamTwoScore: 0,
    };
    if (team === 1) game.teamOneScore = Number.isFinite(value) ? value : 0;
    else game.teamTwoScore = Number.isFinite(value) ? value : 0;
    byKey.set(key, game);
  });

  return {
    games: Array.from(byKey.values()).sort(
      (a, b) => a.round - b.round || a.row - b.row,
    ),
  };
}

export function summarizeLmsGamesForBoard(
  matchId: string,
  games: LmsMatchGameScore[],
): DraftBoardSummary | null {
  if (games.length === 0) return null;

  let teamOneGameWins = 0;
  let teamTwoGameWins = 0;
  let gamesScored = 0;
  const byRound = new Map<number, { one: number; two: number }>();

  for (const game of games) {
    const winner = gameWinner({
      teamOnePlayerId: null,
      teamTwoPlayerId: null,
      teamOneScore: game.teamOneScore,
      teamTwoScore: game.teamTwoScore,
      winAdornment: "",
      isWinZip: false,
      breakingTeam: 1,
      teamOneHandicap: null,
      teamTwoHandicap: null,
    });
    if (!winner) continue;
    gamesScored += 1;
    if (winner === 1) teamOneGameWins += 1;
    else teamTwoGameWins += 1;
    const row = byRound.get(game.round) ?? { one: 0, two: 0 };
    if (winner === 1) row.one += 1;
    else row.two += 1;
    byRound.set(game.round, row);
  }

  if (gamesScored === 0) return null;

  let teamOneRoundWins = 0;
  let teamTwoRoundWins = 0;
  let roundsStarted = 0;
  for (const row of byRound.values()) {
    roundsStarted += 1;
    if (row.one === row.two) continue;
    if (row.one > row.two) teamOneRoundWins += 1;
    else teamTwoRoundWins += 1;
  }

  const now = new Date().toISOString();
  return {
    matchId,
    teamOneGameWins,
    teamTwoGameWins,
    teamOneRoundWins,
    teamTwoRoundWins,
    gamesScored,
    roundsStarted,
    updatedAt: now,
    submittedAt: now,
    status: "submitted",
  };
}

/** Public LMS scoresheet/result page used by the schedule deep-link. */
export async function fetchMatchResultSummary(
  matchId: string,
): Promise<DraftBoardSummary | null> {
  return withLmsCache(
    lmsCacheKey("match-result", matchId),
    // Short TTL so live nights refresh; completed sheets rarely change.
    Math.min(LMS_CACHE_TTL.match, 15 * 60),
    async () => {
      const response = await fetch(
        `${LMS_BASE}/PublicReport/MatchResultBCAPL?matchId=${encodeURIComponent(matchId)}`,
        {
          headers: {
            Accept: "text/html",
            "X-Requested-With": "XMLHttpRequest",
          },
          cache: "no-store",
        },
      );
      if (!response.ok) return null;
      const html = await response.text();
      const { games } = parseMatchResultHtml(html);
      return summarizeLmsGamesForBoard(matchId, games);
    },
  );
}

/**
 * Fill board summaries from LMS for match ids that have no draft scores.
 * Prefers existing draft summaries when they already have scored games.
 */
export async function fillBoardSummariesFromLms(
  matchIds: string[],
  existing: Record<string, DraftBoardSummary>,
): Promise<Record<string, DraftBoardSummary>> {
  const missing = matchIds.filter((id) => {
    const current = existing[id];
    return !current || current.gamesScored <= 0;
  });
  if (missing.length === 0) return existing;

  const fetched = await Promise.all(
    missing.map(async (matchId) => {
      try {
        return await fetchMatchResultSummary(matchId);
      } catch {
        return null;
      }
    }),
  );

  const out = { ...existing };
  for (const summary of fetched) {
    if (!summary) continue;
    out[summary.matchId] = summary;
  }
  return out;
}
