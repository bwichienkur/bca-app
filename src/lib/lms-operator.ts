import { LMS_BASE } from "./constants";

/**
 * League Operator LMS web login + internal score entry.
 * Used when player `POST /api/verticalmatch` leaves a ghost lock
 * (HTTP 200/201 or "already scored" while hasBeenPlayed stays false).
 *
 * Configure with LMS_OPERATOR_EMAIL + LMS_OPERATOR_PASSWORD (LO web login).
 */

export type OperatorSession = {
  jwt: string;
  cookie: string;
};

type VerticalGame = {
  gameIndex?: number;
  gameType?: string;
  breakingTeam?: number;
  gameFormatType?: number;
  multiplier?: number;
  playerOne?: string | null;
  playerTwo?: string | null;
  teamOnePlayers?: string[];
  teamTwoPlayers?: string[];
  teamOnePlayerIndexes?: number[];
  teamTwoPlayerIndexes?: number[];
  teamOneScore?: number;
  teamTwoScore?: number;
  winAdornment?: string;
  isWinZip?: boolean;
  teamOneHandicaps?: number[];
  teamTwoHandicaps?: number[];
};

type VerticalRound = {
  roundNumber?: number;
  roundIndex?: number;
  games?: VerticalGame[];
};

function absorbSetCookies(
  jar: Map<string, string>,
  setCookies: string[],
): void {
  for (const raw of setCookies) {
    const part = raw.split(";")[0]?.trim();
    if (!part) continue;
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    jar.set(part.slice(0, eq), part.slice(eq + 1));
  }
}

function cookieHeader(jar: Map<string, string>): string {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

function readSetCookies(response: Response): string[] {
  const headers = response.headers as Headers & {
    getSetCookie?: () => string[];
  };
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie();
  }
  const single = response.headers.get("set-cookie");
  if (!single) return [];
  return single.split(/,(?=[^;]+?=)/);
}

export function isOperatorConfigured(): boolean {
  return Boolean(
    process.env.LMS_OPERATOR_EMAIL?.trim() &&
      process.env.LMS_OPERATOR_PASSWORD?.trim(),
  );
}

/** LMS web form login for a League Operator account. */
export async function loginLeagueOperator(): Promise<OperatorSession> {
  const email = process.env.LMS_OPERATOR_EMAIL?.trim();
  const password = process.env.LMS_OPERATOR_PASSWORD?.trim();
  if (!email || !password) {
    throw new Error(
      "League operator login is not configured (LMS_OPERATOR_EMAIL / LMS_OPERATOR_PASSWORD).",
    );
  }

  const jar = new Map<string, string>();
  const loginPage = await fetch(`${LMS_BASE}/Account/Login`, {
    cache: "no-store",
  });
  absorbSetCookies(jar, readSetCookies(loginPage));
  const html = await loginPage.text();
  const token = html.match(
    /name="__RequestVerificationToken"[^>]*value="([^"]+)"/,
  )?.[1];
  if (!token) {
    throw new Error("Could not start league operator login.");
  }

  const body = new URLSearchParams({
    __RequestVerificationToken: token,
    UserName: email,
    Password: password,
  });

  let response = await fetch(`${LMS_BASE}/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookieHeader(jar),
      Referer: `${LMS_BASE}/Account/Login`,
      Origin: LMS_BASE,
    },
    body,
    redirect: "manual",
    cache: "no-store",
  });
  absorbSetCookies(jar, readSetCookies(response));

  let location = response.headers.get("location");
  for (let i = 0; i < 6 && location; i += 1) {
    const abs = location.startsWith("http")
      ? location
      : `${LMS_BASE}${location}`;
    response = await fetch(abs, {
      headers: { Cookie: cookieHeader(jar) },
      redirect: "manual",
      cache: "no-store",
    });
    absorbSetCookies(jar, readSetCookies(response));
    location = response.headers.get("location");
  }

  const jwt = jar.get("jwt_token");
  if (!jwt || !jar.get(".AspNet.ApplicationCookie")) {
    throw new Error(
      "League operator login failed. Check LMS_OPERATOR_EMAIL / LMS_OPERATOR_PASSWORD.",
    );
  }

  return { jwt, cookie: cookieHeader(jar) };
}

/**
 * Convert a Tableside / BCAPL verticalmatch payload into the LO
 * Division Score Entry body for `/api/scoringinternal/recordscoresvertical`.
 */
export function verticalPayloadToOperatorScores(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const matchId = String(payload.matchId ?? payload.MatchId ?? "");
  const roundsRaw = (payload.rounds ?? payload.Rounds ?? []) as VerticalRound[];
  const rounds = roundsRaw.map((round, index) => ({
    roundIndex: round.roundIndex ?? round.roundNumber ?? index + 1,
    games: (round.games ?? []).map((game) => {
      const teamOnePlayers =
        game.teamOnePlayers?.filter(Boolean) ??
        (game.playerOne ? [game.playerOne] : []);
      const teamTwoPlayers =
        game.teamTwoPlayers?.filter(Boolean) ??
        (game.playerTwo ? [game.playerTwo] : []);
      return {
        gameIndex: game.gameIndex,
        gameType: game.gameType,
        teamOneIsScored: true,
        teamTwoIsScored: true,
        teamOnePlayers,
        teamTwoPlayers,
        teamOnePlayerIndexes: game.teamOnePlayerIndexes ?? [1],
        teamTwoPlayerIndexes: game.teamTwoPlayerIndexes ?? [1],
        teamOneScore: game.teamOneScore ?? 0,
        teamTwoScore: game.teamTwoScore ?? 0,
        winAdornment: game.winAdornment ?? "",
        teamOneHandicaps: game.teamOneHandicaps ?? [0],
        teamTwoHandicaps: game.teamTwoHandicaps ?? [0],
        breakingTeam: game.breakingTeam,
        multiplier: game.multiplier,
        gameFormatType: game.gameFormatType,
      };
    }),
  }));

  return {
    matchId,
    teamOneGamesBonus: Number(payload.teamOneGamesBonus ?? 0) || 0,
    teamTwoGamesBonus: Number(payload.teamTwoGamesBonus ?? 0) || 0,
    teamOneRoundsBonus: Number(payload.teamOneRoundsBonus ?? 0) || 0,
    teamTwoRoundsBonus: Number(payload.teamTwoRoundsBonus ?? 0) || 0,
    teamOnePointsBonus: Number(payload.teamOnePointsBonus ?? 0) || 0,
    teamTwoPointsBonus: Number(payload.teamTwoPointsBonus ?? 0) || 0,
    teamOneSetsBonus: Number(payload.teamOneSetsBonus ?? 0) || 0,
    teamTwoSetsBonus: Number(payload.teamTwoSetsBonus ?? 0) || 0,
    rounds,
  };
}

export async function operatorRecordScoresVertical(
  session: OperatorSession,
  scores: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; body: string }> {
  const response = await fetch(
    `${LMS_BASE}/api/scoringinternal/recordscoresvertical`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.jwt}`,
        Cookie: session.cookie,
        "Content-Type": "application/json",
        Accept: "application/json",
        Referer: `${LMS_BASE}/DivisionScoreEntry/ShowMatches`,
      },
      body: JSON.stringify(scores),
      cache: "no-store",
    },
  );
  const body = await response.text();
  return { ok: response.ok, status: response.status, body };
}

export async function verifyMatchPlayedWithPlayerToken(
  accessToken: string,
  matchId: string,
  options?: { attempts?: number },
): Promise<boolean | null> {
  const attempts = Math.max(1, options?.attempts ?? 5);
  let last: boolean | null = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
    }
    const check = await fetch(`${LMS_BASE}/api/matches/${matchId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });
    if (!check.ok) continue;
    const match = (await check.json()) as { hasBeenPlayed?: boolean };
    last = Boolean(match.hasBeenPlayed);
    if (last) return true;
  }
  return last;
}

export function isAlreadyScoredMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("already scored") ||
    lower.includes("already submitted") ||
    lower.includes("scorekeeper has already")
  );
}
