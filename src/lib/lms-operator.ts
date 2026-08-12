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

/** LMS web form login for arbitrary League Operator credentials. */
export async function loginLeagueOperatorWithCredentials(
  email: string,
  password: string,
): Promise<OperatorSession> {
  const userName = email.trim();
  const pass = password.trim();
  if (!userName || !pass) {
    throw new Error("League operator email and password are required.");
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
    UserName: userName,
    Password: pass,
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
      "League operator login failed. Check the LMS operator email and password.",
    );
  }

  return { jwt, cookie: cookieHeader(jar) };
}

/** LMS web form login using the server-configured League Operator account. */
export async function loginLeagueOperator(): Promise<OperatorSession> {
  const email = process.env.LMS_OPERATOR_EMAIL?.trim();
  const password = process.env.LMS_OPERATOR_PASSWORD?.trim();
  if (!email || !password) {
    throw new Error(
      "League operator login is not configured (LMS_OPERATOR_EMAIL / LMS_OPERATOR_PASSWORD).",
    );
  }
  return loginLeagueOperatorWithCredentials(email, password);
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

/** Authenticated LMS web (LO cookie + JWT) request helper. */
export async function operatorWebFetch(
  session: OperatorSession,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${session.jwt}`);
  headers.set("Cookie", session.cookie);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  if (!headers.has("X-Requested-With")) {
    headers.set("X-Requested-With", "XMLHttpRequest");
  }
  const url = path.startsWith("http") ? path : `${LMS_BASE}${path}`;
  return fetch(url, {
    ...init,
    headers,
    cache: "no-store",
  });
}

async function readJsonOrThrow<T>(
  response: Response,
  fallbackError: string,
): Promise<T> {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `${fallbackError} (${response.status})`);
  }
  if (!text.trim()) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(fallbackError);
  }
}

export type OperatorMatchRow = {
  matchId: string;
  teamOne: string;
  teamTwo: string;
  datePlayed: string | null;
  displayDate: string | null;
  location: string | null;
};

function normalizeOperatorMatch(raw: Record<string, unknown>): OperatorMatchRow {
  return {
    matchId: String(raw.MatchId ?? raw.matchId ?? "").trim(),
    teamOne: String(
      raw.TeamOne ?? raw.TeamOneName ?? raw.teamOne ?? "",
    ).trim(),
    teamTwo: String(
      raw.TeamTwo ?? raw.TeamTwoName ?? raw.teamTwo ?? "",
    ).trim(),
    datePlayed: raw.DatePlayed != null ? String(raw.DatePlayed) : null,
    displayDate:
      raw.DisplayDatePlayed != null
        ? String(raw.DisplayDatePlayed)
        : raw.DatePlayed != null
          ? String(raw.DatePlayed)
          : null,
    location:
      raw.Location != null && String(raw.Location).trim()
        ? String(raw.Location).trim()
        : null,
  };
}

export async function operatorGetNextMatches(
  session: OperatorSession,
  divisionId: string,
): Promise<OperatorMatchRow[]> {
  const response = await operatorWebFetch(
    session,
    `/Division/GetNextMatches?divisionId=${encodeURIComponent(divisionId)}`,
  );
  const data = await readJsonOrThrow<unknown[]>(
    response,
    "Could not load upcoming matches.",
  );
  return (Array.isArray(data) ? data : []).map((row) =>
    normalizeOperatorMatch((row ?? {}) as Record<string, unknown>),
  );
}

export async function operatorGetMissedMatches(
  session: OperatorSession,
  divisionId: string,
): Promise<OperatorMatchRow[]> {
  const response = await operatorWebFetch(
    session,
    `/Division/GetMissedMatches?divisionId=${encodeURIComponent(divisionId)}`,
  );
  const data = await readJsonOrThrow<unknown[]>(
    response,
    "Could not load missed matches.",
  );
  return (Array.isArray(data) ? data : []).map((row) =>
    normalizeOperatorMatch((row ?? {}) as Record<string, unknown>),
  );
}

export type PlayoffTeam = {
  id: string;
  name: string;
  divisionId: string;
  numberOfPlayers: number;
  selected?: boolean;
};

export type PlayoffDivisionGroup = {
  name: string;
  id: string | null;
  teams: PlayoffTeam[];
};

export type PlayoffLeagueInfo = {
  leagueName: string;
  skillLevel: string | null;
  divisions: PlayoffDivisionGroup[];
};

export async function operatorGetPlayoffInfo(
  session: OperatorSession,
  leagueId: string,
): Promise<PlayoffLeagueInfo> {
  const response = await operatorWebFetch(
    session,
    `/Division/GetLeagueInfoForPlayoff?leagueId=${encodeURIComponent(leagueId)}`,
  );
  const data = await readJsonOrThrow<Record<string, unknown>>(
    response,
    "Could not load playoff team list.",
  );
  const divisionsRaw = Array.isArray(data.divisions) ? data.divisions : [];
  const divisions: PlayoffDivisionGroup[] = divisionsRaw.map((div) => {
    const d = (div ?? {}) as Record<string, unknown>;
    const teamsRaw = Array.isArray(d.teams) ? d.teams : [];
    return {
      name: String(d.name ?? "").trim() || "Division",
      id: d.id != null ? String(d.id) : null,
      teams: teamsRaw.map((team) => {
        const t = (team ?? {}) as Record<string, unknown>;
        return {
          id: String(t.id ?? "").trim(),
          name: String(t.name ?? "").trim(),
          divisionId: String(t.divisionId ?? "").trim(),
          numberOfPlayers: Number(t.numberOfPlayers ?? 0) || 0,
        };
      }),
    };
  });
  return {
    leagueName: String(data.leagueName ?? "").trim(),
    skillLevel:
      data.skillLevel != null && String(data.skillLevel).trim()
        ? String(data.skillLevel)
        : null,
    divisions,
  };
}

export type CreatePlayoffInput = {
  leagueId: string;
  name: string;
  skillLevel: string;
  selectedTeams: PlayoffTeam[];
};

export type CreatePlayoffResult = {
  success: boolean;
  message: string | null;
  redirectUrl: string | null;
};

export async function operatorCreatePlayoff(
  session: OperatorSession,
  input: CreatePlayoffInput,
): Promise<CreatePlayoffResult> {
  const response = await operatorWebFetch(
    session,
    "/Division/CreatePlayoffFromSettings",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        leagueId: input.leagueId,
        name: input.name,
        skillLevel: input.skillLevel,
        selectedTeams: input.selectedTeams,
      }),
    },
  );
  const data = await readJsonOrThrow<Record<string, unknown>>(
    response,
    "Could not create playoff.",
  );
  return {
    success: Boolean(data.success ?? data.Success),
    message:
      data.message != null
        ? String(data.message)
        : data.Message != null
          ? String(data.Message)
          : null,
    redirectUrl:
      data.redirectUrl != null
        ? String(data.redirectUrl)
        : data.RedirectUrl != null
          ? String(data.RedirectUrl)
          : null,
  };
}

export type DivisionSettings = Record<string, unknown>;

export async function operatorGetDivisionSettings(
  session: OperatorSession,
  divisionId: string,
  forCopy = true,
): Promise<DivisionSettings> {
  const response = await operatorWebFetch(
    session,
    `/Division/GetDivisionSettings?divisionId=${encodeURIComponent(divisionId)}&forCopy=${forCopy ? "true" : "false"}`,
  );
  return readJsonOrThrow<DivisionSettings>(
    response,
    "Could not load division settings.",
  );
}

type InternalLocation = {
  id: string;
  name: string;
  city?: string;
  state?: string;
  phoneNumber?: string | null;
  numberOf7FootTables?: number;
  numberOf8FootTables?: number;
  numberOf9FootTables?: number;
  numberOf10FootTables?: number;
};

type InternalTeam = {
  id: string;
  name: string;
  isBye?: boolean;
  locationId?: string | null;
};

type InternalPlayer = {
  id: string;
  readableId?: string | number | null;
  firstName?: string;
  lastName?: string;
  city?: string;
  state?: string;
  fargoRating?: number;
  robustness?: number;
  provisionalRating?: number;
};

export async function operatorGetDivisionLocations(
  session: OperatorSession,
  divisionId: string,
): Promise<InternalLocation[]> {
  const response = await operatorWebFetch(
    session,
    `/api/divisionsinternal/${encodeURIComponent(divisionId)}/locations`,
  );
  const data = await readJsonOrThrow<InternalLocation[]>(
    response,
    "Could not load locations.",
  );
  return Array.isArray(data) ? data : [];
}

export async function operatorGetDivisionTeams(
  session: OperatorSession,
  divisionId: string,
): Promise<InternalTeam[]> {
  const response = await operatorWebFetch(
    session,
    `/api/divisionsinternal/${encodeURIComponent(divisionId)}/teams`,
  );
  const data = await readJsonOrThrow<InternalTeam[]>(
    response,
    "Could not load teams.",
  );
  return Array.isArray(data) ? data : [];
}

export async function operatorGetTeamPlayers(
  session: OperatorSession,
  teamId: string,
): Promise<InternalPlayer[]> {
  const response = await operatorWebFetch(
    session,
    `/api/teamsinternal/${encodeURIComponent(teamId)}/players`,
  );
  const data = await readJsonOrThrow<InternalPlayer[]>(
    response,
    "Could not load team players.",
  );
  return Array.isArray(data) ? data : [];
}

function str(value: unknown, fallback = ""): string {
  if (value == null) return fallback;
  return String(value);
}

function asFlag(value: unknown, fallback = "0"): string {
  if (value == null || value === "") return fallback;
  if (typeof value === "boolean") return value ? "1" : "0";
  return String(value);
}

export type CreateDivisionFromCopyInput = {
  leagueId: string;
  sourceDivisionId: string;
  name: string;
  description?: string;
  skillLevel?: string | number;
  includeTeams?: boolean;
  includePlayers?: boolean;
};

export type CreateDivisionResult = {
  success: boolean;
  messages: string[];
  redirectUrl: string | null;
  divisionId?: string | null;
};

/**
 * Build + POST CreateDivisionFromSettings using an existing division as template.
 * Copies locations; optionally teams (+ player ids). Schedule is left empty.
 *
 * LMS expects each roster entry as `{ id, readableId }` — GUID alone causes
 * "Cannot perform runtime binding on a null reference".
 */
export async function operatorCreateDivisionFromCopy(
  session: OperatorSession,
  input: CreateDivisionFromCopyInput,
): Promise<CreateDivisionResult> {
  const settings = await operatorGetDivisionSettings(
    session,
    input.sourceDivisionId,
    true,
  );
  const locationsRaw = await operatorGetDivisionLocations(
    session,
    input.sourceDivisionId,
  );

  const locationIdMap = new Map<string, string>();
  const locations = locationsRaw.map((loc, index) => {
    const localId = `location${index}`;
    locationIdMap.set(loc.id, localId);
    return {
      id: localId,
      name: loc.name,
      city: loc.city ?? "",
      state: loc.state ?? "",
      phone: loc.phoneNumber ?? "",
      number7Foots: loc.numberOf7FootTables ?? 0,
      number8Foots: loc.numberOf8FootTables ?? 0,
      number9Foots: loc.numberOf9FootTables ?? 0,
      number10Foots: loc.numberOf10FootTables ?? 0,
    };
  });

  const teams: Array<Record<string, unknown>> = [];
  if (input.includeTeams !== false) {
    const teamsRaw = await operatorGetDivisionTeams(
      session,
      input.sourceDivisionId,
    );
    for (let index = 0; index < teamsRaw.length; index += 1) {
      const team = teamsRaw[index]!;
      const localId = `team${index}`;
      const locationId =
        (team.locationId && locationIdMap.get(team.locationId)) ||
        locations[0]?.id ||
        "";
      let players: Array<{ id: string; readableId: string | number }> = [];
      if (input.includePlayers) {
        const roster = await operatorGetTeamPlayers(session, team.id);
        players = roster
          .map((p) => {
            const id = String(p.id ?? "").trim();
            const readable =
              p.readableId != null && String(p.readableId).trim()
                ? (typeof p.readableId === "number"
                    ? p.readableId
                    : String(p.readableId).trim())
                : null;
            if (!id || readable == null) return null;
            return { id, readableId: readable };
          })
          .filter(
            (p): p is { id: string; readableId: string | number } => p != null,
          );
      }
      teams.push({
        id: localId,
        name: team.name,
        locationId,
        captain: "",
        isBye: Boolean(team.isBye),
        players,
      });
    }
  }

  const payload: Record<string, unknown> = {
    LeagueId: input.leagueId || str(settings.LeagueId),
    Name: input.name.trim(),
    Description:
      input.description?.trim() || str(settings.Description),
    SanctionType: asFlag(settings.SanctionType, "1"),
    SkillLevel: str(
      input.skillLevel ?? settings.SkillLevel,
      "1",
    ),
    NumberOfPlayers: str(settings.NumberOfPlayers, "5"),
    CostPerPlayer: str(settings.CostPerPlayer, "0"),
    GameType: asFlag(settings.GameType, "0"),
    TableSize: asFlag(settings.TableSize, "2"),
    IsTestDivision: asFlag(settings.IsTestDivision, "0"),
    TimeZoneName: str(settings.TimeZoneName, "Central Standard Time"),
    TeamStandings: str(settings.TeamStandings),
    PlayerStandings: str(settings.PlayerStandings),
    PointsForWin: str(settings.PointsForWin, "10"),
    NumberOfRounds: str(settings.NumberOfRounds, "5"),
    NumberOfGamesPerRound: str(settings.NumberOfGamesPerRound, "1"),
    AllowTiedRound: asFlag(settings.AllowTiedRound, "0"),
    AllowTiedMatch: asFlag(settings.AllowTiedMatch, "1"),
    UseHalfForTiedRound: asFlag(settings.UseHalfForTiedRound, "0"),
    DetermineMatchWin: asFlag(settings.DetermineMatchWin, "1"),
    MatchWinForRound: asFlag(settings.MatchWinForRound, "1"),
    AverageBasedOn: asFlag(settings.AverageBasedOn, "0"),
    AverageFormat: asFlag(settings.AverageFormat, "0"),
    HandicapMode: asFlag(settings.HandicapMode, "2"),
    MinWeeksForPlayerRating: asFlag(settings.MinWeeksForPlayerRating, "0"),
    HidePlayerPI: asFlag(settings.HidePlayerPI, "0"),
    DisplayUnpaidFees: asFlag(settings.DisplayUnpaidFees, "0"),
    IncludeForfeitsInPlayerStandings: asFlag(
      settings.IncludeForfeitsInPlayerStandings,
      "1",
    ),
    UseHandicap: asFlag(settings.UseHandicap, "1"),
    HandicapDisplayFormat: asFlag(settings.HandicapDisplayFormat, "0"),
    HandicapPercentage: str(settings.HandicapPercentage, "100%"),
    IncludeHandicapInTeamStandings: asFlag(
      settings.IncludeHandicapInTeamStandings,
      "1",
    ),
    RoundDecimalHandicaps: asFlag(settings.RoundDecimalHandicaps, "0"),
    MaximumAllowedHandicap: str(settings.MaximumAllowedHandicap, "0"),
    AllScoresRequired: asFlag(settings.AllScoresRequired, "1"),
    BootstrapDivisionId: settings.BootstrapDivisionId ?? null,
    DoublePlayPartnerDivisionId: settings.DoublePlayPartnerDivisionId ?? null,
    NumberOfWeeksForHandicap: asFlag(settings.NumberOfWeeksForHandicap, "0"),
    FargoHandicapType: asFlag(settings.FargoHandicapType, "0"),
    CountSubStats: asFlag(settings.CountSubStats, "0"),
    MatchFormat: asFlag(settings.MatchFormat, "0"),
    ScoresheetLayout: settings.ScoresheetLayout ?? null,
    FormatTemplate: settings.FormatTemplate ?? null,
    SplitScotchGame: asFlag(settings.SplitScotchGame, "0"),
    BCAPLFormat: asFlag(settings.BCAPLFormat, "6"),
    Locations: JSON.stringify(locations),
    Teams: JSON.stringify(teams),
    EventList: JSON.stringify([]),
  };

  const response = await operatorWebFetch(
    session,
    "/Division/CreateDivisionFromSettings",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  const data = await readJsonOrThrow<Record<string, unknown>>(
    response,
    "Could not create division.",
  );
  const messagesRaw = data.Messages ?? data.messages;
  const messages = Array.isArray(messagesRaw)
    ? messagesRaw.map((m) => String(m))
    : data.message != null
      ? [String(data.message)]
      : [];
  const divisionIdRaw = data.DivisionId ?? data.divisionId;
  const divisionId =
    divisionIdRaw != null &&
    String(divisionIdRaw) !== "00000000-0000-0000-0000-000000000000"
      ? String(divisionIdRaw)
      : null;
  return {
    success: Boolean(data.Success ?? data.success),
    messages,
    redirectUrl:
      data.RedirectUrl != null
        ? String(data.RedirectUrl)
        : data.redirectUrl != null
          ? String(data.redirectUrl)
          : divisionId
            ? `/Division/DivisionDetail?divisionId=${divisionId}`
            : null,
    divisionId,
  };
}
