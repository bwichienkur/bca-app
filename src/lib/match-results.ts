import * as cheerio from "cheerio";
import { LMS_BASE } from "./constants";
import { LMS_CACHE_TTL, lmsCacheKey, withLmsCache } from "./lms-cache";
import {
  gameKey,
  gameWinner,
  tallyBoardRoundWins,
  type DraftBoardSummary,
  type GameScoreState,
  type ScoringDraft,
  type ScoringMatchDetail,
  type WinAdornment,
} from "./scoring";

const ADORNMENTS = new Set(["BR", "TR", "WZ", "WF"]);

export type LmsMatchGameDetail = {
  round: number;
  row: number;
  teamOneScore: number;
  teamTwoScore: number;
  teamOnePlayerId: string | null;
  teamTwoPlayerId: string | null;
  teamOnePlayerSlot: number | null;
  teamTwoPlayerSlot: number | null;
  teamOneHandicap: number | null;
  teamTwoHandicap: number | null;
  breakingTeam: 1 | 2;
  winAdornment: WinAdornment;
  isWinZip: boolean;
};

export type LmsMatchResultDetail = {
  matchId: string;
  games: LmsMatchGameDetail[];
};

function parseScoreCell(raw: string | undefined): {
  score: number;
  adornment: WinAdornment;
} {
  const text = (raw ?? "").trim();
  const upper = text.toUpperCase();
  if (ADORNMENTS.has(upper)) {
    return {
      score: 10,
      adornment: upper as WinAdornment,
    };
  }
  const value = Number(text);
  return {
    score: Number.isFinite(value) ? value : 0,
    adornment: "",
  };
}

function selectedPlayerId(
  // cheerio element wrapper from `.game-container`
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  container: any,
  team: 1 | 2,
): { id: string | null; slot: number | null; handicap: number | null } {
  const select = container
    .find(
      team === 1
        ? "select.team-one-player"
        : "select.team-two-player",
    )
    .first();
  if (!select.length) {
    return { id: null, slot: null, handicap: null };
  }
  const slotRaw = Number(select.attr("data-player"));
  const selected = select.find("option[selected]").first();
  const rawVal = select.val();
  const id =
    selected.attr("value") ||
    (typeof rawVal === "string" ? rawVal : null) ||
    null;
  const handicapRaw = Number(selected.attr("data-handicap"));
  return {
    id: id || null,
    slot: Number.isFinite(slotRaw) ? slotRaw : null,
    handicap: Number.isFinite(handicapRaw) ? handicapRaw : null,
  };
}

/**
 * Parse LMS public MatchResultBCAPL HTML into per-game scores + players.
 * Scores live on disabled `.row-score` inputs; adornments may be the value
 * itself (e.g. `TR`). Players come from selected `<option>`s.
 */
export function parseMatchResultHtml(
  html: string,
  matchId: string,
): LmsMatchResultDetail {
  const $ = cheerio.load(html);
  const games: LmsMatchGameDetail[] = [];

  $(".game-container").each((_, el) => {
    const $game = $(el);
    const round = Number($game.attr("data-round"));
    const row = Number($game.attr("data-row"));
    if (!Number.isFinite(round) || !Number.isFinite(row)) return;

    const scoreOne = parseScoreCell(
      $game.find('.row-score[data-team="1"]').first().attr("value"),
    );
    const scoreTwo = parseScoreCell(
      $game.find('.row-score[data-team="2"]').first().attr("value"),
    );
    const winAdornment =
      scoreOne.adornment || scoreTwo.adornment || ("" as WinAdornment);

    const hcOneRaw = Number(
      $game.find('.row-handicap[data-team="1"]').first().attr("value"),
    );
    const hcTwoRaw = Number(
      $game.find('.row-handicap[data-team="2"]').first().attr("value"),
    );

    const playerOne = selectedPlayerId($game, 1);
    const playerTwo = selectedPlayerId($game, 2);

    const breakOneActive = $game
      .find(".break-container-1 .game-chip")
      .first()
      .hasClass("break-active");
    const breakTwoActive = $game
      .find(".break-container-2 .game-chip")
      .first()
      .hasClass("break-active");
    const breakingTeam: 1 | 2 =
      breakTwoActive && !breakOneActive ? 2 : 1;

    games.push({
      round,
      row,
      teamOneScore: scoreOne.score,
      teamTwoScore: scoreTwo.score,
      teamOnePlayerId: playerOne.id,
      teamTwoPlayerId: playerTwo.id,
      teamOnePlayerSlot: playerOne.slot,
      teamTwoPlayerSlot: playerTwo.slot,
      teamOneHandicap: Number.isFinite(hcOneRaw)
        ? hcOneRaw
        : playerOne.handicap,
      teamTwoHandicap: Number.isFinite(hcTwoRaw)
        ? hcTwoRaw
        : playerTwo.handicap,
      breakingTeam,
      winAdornment,
      isWinZip: winAdornment === "WZ",
    });
  });

  games.sort((a, b) => a.round - b.round || a.row - b.row);
  return { matchId, games };
}

/** @deprecated use parseMatchResultHtml — kept for callers that only need scores */
export function parseMatchResultScores(html: string): {
  games: Array<{
    round: number;
    row: number;
    teamOneScore: number;
    teamTwoScore: number;
  }>;
} {
  const detail = parseMatchResultHtml(html, "");
  return {
    games: detail.games.map((game) => ({
      round: game.round,
      row: game.row,
      teamOneScore: game.teamOneScore,
      teamTwoScore: game.teamTwoScore,
    })),
  };
}

export function summarizeLmsGamesForBoard(
  matchId: string,
  games: Array<{
    round: number;
    teamOneScore: number;
    teamTwoScore: number;
    winAdornment?: WinAdornment;
    teamOneHandicap?: number | null;
    teamTwoHandicap?: number | null;
  }>,
): DraftBoardSummary | null {
  if (games.length === 0) return null;

  let teamOneGameWins = 0;
  let teamTwoGameWins = 0;
  let gamesScored = 0;

  for (const game of games) {
    const winner = gameWinner({
      teamOnePlayerId: null,
      teamTwoPlayerId: null,
      teamOneScore: game.teamOneScore,
      teamTwoScore: game.teamTwoScore,
      winAdornment: game.winAdornment ?? "",
      isWinZip: game.winAdornment === "WZ",
      breakingTeam: 1,
      teamOneHandicap: null,
      teamTwoHandicap: null,
    });
    if (!winner) continue;
    gamesScored += 1;
    if (winner === 1) teamOneGameWins += 1;
    else teamTwoGameWins += 1;
  }

  if (gamesScored === 0) return null;

  // Don't use LMS player Fargo values as round HC; points-only + match-points R6.
  const rounds = tallyBoardRoundWins(games, {
    includeMatchPointsRound: true,
    useGameHandicaps: false,
  });

  const now = new Date().toISOString();
  return {
    matchId,
    teamOneGameWins,
    teamTwoGameWins,
    teamOneRoundWins: rounds.teamOneRoundWins,
    teamTwoRoundWins: rounds.teamTwoRoundWins,
    gamesScored,
    roundsStarted: rounds.roundsStarted,
    updatedAt: now,
    submittedAt: now,
    status: "submitted",
  };
}

/** Build a locked-style ScoringDraft from an LMS public result page. */
export function draftFromLmsMatchResult(
  match: Pick<ScoringMatchDetail, "id" | "matchFormat" | "numberOfSets">,
  result: LmsMatchResultDetail,
): ScoringDraft {
  const slots =
    match.matchFormat?.teamOnePlayers.length || match.numberOfSets || 5;
  const teamOneLineup: (string | null)[] = Array.from(
    { length: slots },
    () => null,
  );
  const teamTwoLineup: (string | null)[] = Array.from(
    { length: slots },
    () => null,
  );

  for (const game of result.games) {
    if (game.round !== 1) continue;
    if (
      game.teamOnePlayerSlot != null &&
      game.teamOnePlayerSlot >= 1 &&
      game.teamOnePlayerSlot <= slots
    ) {
      teamOneLineup[game.teamOnePlayerSlot - 1] = game.teamOnePlayerId;
    }
    if (
      game.teamTwoPlayerSlot != null &&
      game.teamTwoPlayerSlot >= 1 &&
      game.teamTwoPlayerSlot <= slots
    ) {
      teamTwoLineup[game.teamTwoPlayerSlot - 1] = game.teamTwoPlayerId;
    }
  }

  const games: Record<string, GameScoreState> = {};
  for (const game of result.games) {
    games[gameKey(game.round, game.row)] = {
      teamOnePlayerId: game.teamOnePlayerId,
      teamTwoPlayerId: game.teamTwoPlayerId,
      teamOneScore: game.teamOneScore,
      teamTwoScore: game.teamTwoScore,
      winAdornment: game.winAdornment,
      isWinZip: game.isWinZip,
      breakingTeam: game.breakingTeam,
      teamOneHandicap: game.teamOneHandicap,
      teamTwoHandicap: game.teamTwoHandicap,
    };
  }

  return {
    matchId: match.id,
    updatedAt: new Date().toISOString(),
    teamOneLineup,
    teamTwoLineup,
    games,
  };
}

async function loadMatchResultHtml(matchId: string): Promise<string | null> {
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
  return response.text();
}

/** Public LMS scoresheet/result page used by the schedule deep-link. */
export async function fetchMatchResultDetail(
  matchId: string,
): Promise<LmsMatchResultDetail | null> {
  return withLmsCache(
    lmsCacheKey("match-result-detail-v2", matchId),
    Math.min(LMS_CACHE_TTL.match, 15 * 60),
    async () => {
      const html = await loadMatchResultHtml(matchId);
      if (!html) return null;
      const detail = parseMatchResultHtml(html, matchId);
      return detail.games.length > 0 ? detail : null;
    },
  );
}

export async function fetchMatchResultSummary(
  matchId: string,
): Promise<DraftBoardSummary | null> {
  const detail = await fetchMatchResultDetail(matchId);
  if (!detail) return null;
  return summarizeLmsGamesForBoard(matchId, detail.games);
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
