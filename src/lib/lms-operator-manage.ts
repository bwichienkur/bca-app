import {
  loginLeagueOperator,
  operatorGetDivisionTeams,
  operatorWebFetch,
  type OperatorSession,
} from "./lms-operator";

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

type OperatorAlert = {
  AlertType?: number;
  Message?: string | null;
};

/**
 * LMS often returns HTTP 200 with `{ alerts, data:false }` for validation
 * failures. AlertType >= 3 is an error; data === false also means failure.
 */
function assertOperatorActionOk(
  payload: unknown,
  fallbackError: string,
): asserts payload is Record<string, unknown> {
  if (payload == null || typeof payload !== "object") {
    throw new Error(fallbackError);
  }
  const row = payload as {
    alerts?: OperatorAlert[];
    Alerts?: OperatorAlert[];
    data?: unknown;
    Data?: unknown;
  };
  const alerts = Array.isArray(row.alerts)
    ? row.alerts
    : Array.isArray(row.Alerts)
      ? row.Alerts
      : [];
  const errors = alerts.filter((alert) => (alert.AlertType ?? 0) >= 3);
  if (errors.length > 0) {
    throw new Error(
      errors
        .map((alert) => String(alert.Message ?? "").trim())
        .filter(Boolean)
        .join(" ") || fallbackError,
    );
  }
  const data = row.data !== undefined ? row.data : row.Data;
  if (data === false) {
    const messages = alerts
      .map((alert) => String(alert.Message ?? "").trim())
      .filter(Boolean);
    throw new Error(messages.join(" ") || fallbackError);
  }
}

async function readOperatorAction(
  response: Response,
  fallbackError: string,
): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `${fallbackError} (${response.status})`);
  }
  if (!text.trim()) return {};
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(fallbackError);
  }
  assertOperatorActionOk(payload, fallbackError);
  return payload as Record<string, unknown>;
}

export async function withOperatorSession<T>(
  fn: (session: OperatorSession) => Promise<T>,
): Promise<T> {
  const session = await loginLeagueOperator();
  return fn(session);
}

export type OperatorLeague = {
  id: string;
  name: string;
  state: string | null;
  leagueNumber: string | null;
};

export type OperatorDivision = {
  id: string;
  name: string;
};

export async function operatorGetLeaguesForUser(
  session: OperatorSession,
): Promise<OperatorLeague[]> {
  const response = await operatorWebFetch(
    session,
    "/League/GetLeaguesForUser",
  );
  const data = await readJsonOrThrow<unknown[]>(
    response,
    "Could not load leagues.",
  );
  return (Array.isArray(data) ? data : []).map((row) => {
    const r = (row ?? {}) as Record<string, unknown>;
    return {
      id: String(r.Id ?? r.id ?? "").trim(),
      name: String(r.Name ?? r.name ?? "").trim(),
      state: r.State != null ? String(r.State) : null,
      leagueNumber:
        r.LeagueNumber != null ? String(r.LeagueNumber) : null,
    };
  });
}

export async function operatorGetDivisionsForLeague(
  session: OperatorSession,
  leagueId: string,
  includeArchived = false,
): Promise<OperatorDivision[]> {
  const response = await operatorWebFetch(
    session,
    `/Division/GetDivisionsForLeague?leagueId=${encodeURIComponent(leagueId)}&includeArchived=${includeArchived ? "true" : "false"}`,
  );
  const data = await readJsonOrThrow<unknown[]>(
    response,
    "Could not load divisions.",
  );
  return (Array.isArray(data) ? data : []).map((row) => {
    const r = (row ?? {}) as Record<string, unknown>;
    return {
      id: String(r.Id ?? r.id ?? "").trim(),
      name: String(r.Name ?? r.name ?? "").trim(),
    };
  });
}

export type OperatorLocation = {
  id: string;
  divisionId: string;
  name: string;
  city: string;
  state: string;
  phoneNumber: string | null;
  numberOf7FootTables: number;
  numberOf8FootTables: number;
  numberOf9FootTables: number;
  numberOf10FootTables: number;
};

function normalizeLocation(raw: Record<string, unknown>): OperatorLocation {
  return {
    id: String(raw.id ?? raw.Id ?? "").trim(),
    divisionId: String(raw.divisionId ?? raw.DivisionId ?? "").trim(),
    name: String(raw.name ?? raw.Name ?? "").trim(),
    city: String(raw.city ?? raw.City ?? "").trim(),
    state: String(raw.state ?? raw.State ?? "").trim(),
    phoneNumber:
      raw.phoneNumber != null
        ? String(raw.phoneNumber)
        : raw.PhoneNumber != null
          ? String(raw.PhoneNumber)
          : null,
    numberOf7FootTables: Number(raw.numberOf7FootTables ?? 0) || 0,
    numberOf8FootTables: Number(raw.numberOf8FootTables ?? 0) || 0,
    numberOf9FootTables: Number(raw.numberOf9FootTables ?? 0) || 0,
    numberOf10FootTables: Number(raw.numberOf10FootTables ?? 0) || 0,
  };
}

export async function operatorListLocations(
  session: OperatorSession,
  divisionId: string,
): Promise<OperatorLocation[]> {
  const response = await operatorWebFetch(
    session,
    `/api/divisionsinternal/${encodeURIComponent(divisionId)}/locations`,
  );
  const data = await readJsonOrThrow<unknown[]>(
    response,
    "Could not load locations.",
  );
  return (Array.isArray(data) ? data : []).map((row) =>
    normalizeLocation((row ?? {}) as Record<string, unknown>),
  );
}

export type LocationInput = {
  name: string;
  city?: string;
  state?: string;
  phoneNumber?: string | null;
  numberOf7FootTables?: number;
  numberOf8FootTables?: number;
  numberOf9FootTables?: number;
  numberOf10FootTables?: number;
};

export async function operatorCreateLocation(
  session: OperatorSession,
  divisionId: string,
  input: LocationInput,
): Promise<OperatorLocation> {
  const body = {
    divisionId,
    name: input.name.trim(),
    city: input.city?.trim() ?? "",
    state: input.state?.trim() ?? "",
    phoneNumber: input.phoneNumber?.trim() || null,
    numberOf7FootTables: Number(input.numberOf7FootTables ?? 0) || 0,
    numberOf8FootTables: Number(input.numberOf8FootTables ?? 0) || 0,
    numberOf9FootTables: Number(input.numberOf9FootTables ?? 0) || 0,
    numberOf10FootTables: Number(input.numberOf10FootTables ?? 0) || 0,
  };
  const response = await operatorWebFetch(session, "/api/locationsinternal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await readJsonOrThrow<Record<string, unknown>>(
    response,
    "Could not create location.",
  );
  return normalizeLocation({ ...body, ...data });
}

export async function operatorUpdateLocation(
  session: OperatorSession,
  location: OperatorLocation,
): Promise<OperatorLocation> {
  const body = {
    id: location.id,
    divisionId: location.divisionId,
    name: location.name.trim(),
    city: location.city.trim(),
    state: location.state.trim(),
    phoneNumber: location.phoneNumber?.trim() || null,
    numberOf7FootTables: location.numberOf7FootTables,
    numberOf8FootTables: location.numberOf8FootTables,
    numberOf9FootTables: location.numberOf9FootTables,
    numberOf10FootTables: location.numberOf10FootTables,
  };
  const response = await operatorWebFetch(
    session,
    `/api/locationsinternal/${encodeURIComponent(location.id)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  const data = await readJsonOrThrow<Record<string, unknown>>(
    response,
    "Could not update location.",
  );
  return normalizeLocation({ ...body, ...data });
}

export async function operatorDeleteLocation(
  session: OperatorSession,
  locationId: string,
): Promise<void> {
  const response = await operatorWebFetch(
    session,
    `/api/locationsinternal/${encodeURIComponent(locationId)}`,
    { method: "DELETE" },
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Could not delete location.");
  }
}

export type OperatorTeamPlayer = {
  id: string;
  name: string;
};

export type OperatorTeam = {
  id: string;
  name: string;
  locationName: string | null;
  locationId: string | null;
  numberOfPlayers: number;
  isBye: boolean;
  players: OperatorTeamPlayer[];
};

export async function operatorListTeams(
  session: OperatorSession,
  divisionId: string,
): Promise<OperatorTeam[]> {
  const response = await operatorWebFetch(
    session,
    `/TeamsPlayersLocations/GetTeams?divisionId=${encodeURIComponent(divisionId)}`,
  );
  const data = await readJsonOrThrow<unknown[]>(
    response,
    "Could not load teams.",
  );
  const internal = await operatorWebFetch(
    session,
    `/api/divisionsinternal/${encodeURIComponent(divisionId)}/teams`,
  );
  const internalTeams = await readJsonOrThrow<unknown[]>(
    internal,
    "Could not load team details.",
  );
  const byId = new Map<string, Record<string, unknown>>();
  for (const row of Array.isArray(internalTeams) ? internalTeams : []) {
    const r = (row ?? {}) as Record<string, unknown>;
    byId.set(String(r.id ?? ""), r);
  }

  return (Array.isArray(data) ? data : []).map((row) => {
    const r = (row ?? {}) as Record<string, unknown>;
    const id = String(r.Id ?? r.id ?? "").trim();
    const detail = byId.get(id) ?? {};
    const playersRaw = Array.isArray(r.Players) ? r.Players : [];
    return {
      id,
      name: String(r.Name ?? r.name ?? "").trim(),
      locationName:
        r.Location != null && String(r.Location).trim()
          ? String(r.Location).trim()
          : null,
      locationId:
        detail.locationId != null ? String(detail.locationId) : null,
      numberOfPlayers: Number(r.NumberOfPlayers ?? playersRaw.length) || 0,
      isBye: Boolean(detail.isBye),
      players: playersRaw.map((p) => {
        const player = (p ?? {}) as Record<string, unknown>;
        return {
          id: String(player.Id ?? player.id ?? "").trim(),
          name: String(player.Name ?? player.name ?? "").trim(),
        };
      }),
    };
  });
}

export type TeamInput = {
  name: string;
  locationId: string;
  isBye?: boolean;
};

export async function operatorCreateTeam(
  session: OperatorSession,
  divisionId: string,
  input: TeamInput,
): Promise<void> {
  const response = await operatorWebFetch(session, "/api/teamsinternal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      divisionId,
      name: input.name.trim(),
      locationId: input.locationId,
      isBye: Boolean(input.isBye),
    }),
  });
  if (!response.ok) {
    throw new Error((await response.text()) || "Could not create team.");
  }
}

export async function operatorUpdateTeam(
  session: OperatorSession,
  teamId: string,
  divisionId: string,
  input: TeamInput,
): Promise<void> {
  const response = await operatorWebFetch(
    session,
    `/api/teamsinternal/${encodeURIComponent(teamId)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: teamId,
        divisionId,
        name: input.name.trim(),
        locationId: input.locationId,
        isBye: Boolean(input.isBye),
      }),
    },
  );
  if (!response.ok) {
    throw new Error((await response.text()) || "Could not update team.");
  }
}

export async function operatorDeleteTeam(
  session: OperatorSession,
  teamId: string,
): Promise<void> {
  const response = await operatorWebFetch(
    session,
    `/api/teamsinternal/${encodeURIComponent(teamId)}`,
    { method: "DELETE" },
  );
  await readOperatorAction(response, "Could not delete team.");
}

export type OperatorPlayerRow = {
  id: string;
  name: string;
  location: string | null;
  effectiveRating: number | null;
  provisionalRating: number | null;
  fargoRating: number | null;
  robustness: number | null;
};

export async function operatorListPlayers(
  session: OperatorSession,
  divisionId: string,
): Promise<OperatorPlayerRow[]> {
  const response = await operatorWebFetch(
    session,
    `/TeamsPlayersLocations/GetPlayers?divisionId=${encodeURIComponent(divisionId)}`,
  );
  const data = await readJsonOrThrow<unknown[]>(
    response,
    "Could not load players.",
  );
  return (Array.isArray(data) ? data : []).map((row) => {
    const r = (row ?? {}) as Record<string, unknown>;
    return {
      id: String(r.Id ?? r.id ?? "").trim(),
      name: String(r.Name ?? r.name ?? "").trim(),
      location:
        r.Location != null && String(r.Location).trim()
          ? String(r.Location).trim()
          : null,
      effectiveRating:
        r.EffectiveRating != null ? Number(r.EffectiveRating) : null,
      provisionalRating:
        r.ProvisionalRating != null ? Number(r.ProvisionalRating) : null,
      fargoRating: r.FargoRating != null ? Number(r.FargoRating) : null,
      robustness: r.Robustness != null ? Number(r.Robustness) : null,
    };
  });
}

export type OperatorPlayerDetail = {
  id: string;
  readableId: string | null;
  firstName: string;
  lastName: string;
  suffix: string | null;
  address1: string | null;
  city: string;
  state: string;
  zip: string | null;
  email1: string | null;
  phone1: string | null;
  provisionalRating: number;
  gender: string;
  fargoRating: string | null;
  robustness: string | null;
};

export async function operatorGetPlayer(
  session: OperatorSession,
  playerId: string,
): Promise<OperatorPlayerDetail> {
  const response = await operatorWebFetch(
    session,
    `/api/playersinternal/${encodeURIComponent(playerId)}`,
  );
  const r = await readJsonOrThrow<Record<string, unknown>>(
    response,
    "Could not load player.",
  );
  return {
    id: String(r.id ?? "").trim(),
    readableId: r.readableId != null ? String(r.readableId) : null,
    firstName: String(r.firstName ?? "").trim(),
    lastName: String(r.lastName ?? "").trim(),
    suffix: r.suffix != null ? String(r.suffix) : null,
    address1: r.address1 != null ? String(r.address1) : null,
    city: String(r.city ?? "").trim(),
    state: String(r.state ?? "").trim(),
    zip: r.zip != null ? String(r.zip) : null,
    email1: r.email1 != null ? String(r.email1) : null,
    phone1: r.phone1 != null ? String(r.phone1) : null,
    provisionalRating: Number(r.provisionalRating ?? 400) || 400,
    gender: String(r.gender ?? "M").trim() || "M",
    fargoRating: r.fargoRating != null ? String(r.fargoRating) : null,
    robustness: r.robustness != null ? String(r.robustness) : null,
  };
}

export type PlayerInput = {
  firstName: string;
  lastName: string;
  suffix?: string | null;
  address1?: string | null;
  city: string;
  state: string;
  zip?: string | null;
  email1?: string | null;
  phone1?: string | null;
  provisionalRating: number;
  gender: string;
};

export async function operatorCreatePlayer(
  session: OperatorSession,
  input: PlayerInput,
  teamId?: string | null,
): Promise<{ id: string; readableId: string }> {
  const idRes = await fetch("https://dashboard.fargorate.com/id/generateid", {
    headers: {
      Accept: "application/json, text/plain, */*",
      Authorization: `Bearer ${session.jwt}`,
    },
    cache: "no-store",
  });
  const readableId = (await idRes.text()).trim().replace(/^"|"$/g, "");
  if (!idRes.ok || !readableId) {
    throw new Error("Could not generate a player membership id.");
  }

  const body = {
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    suffix: input.suffix?.trim() || null,
    address1: input.address1?.trim() || null,
    city: input.city.trim(),
    state: input.state.trim().toUpperCase(),
    zip: input.zip?.trim() || null,
    email1: input.email1?.trim() || null,
    phone1: input.phone1?.trim() || null,
    provisionalRating: Number(input.provisionalRating) || 400,
    gender: input.gender.trim() || "M",
    readableId,
    country: "USA",
  };

  const response = await operatorWebFetch(session, "/api/playersinternal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const created = await readJsonOrThrow<Record<string, unknown>>(
    response,
    "Could not create player.",
  );
  const id = String(created.playerId ?? created.id ?? "").trim();
  if (!id) throw new Error("Player create returned no id.");

  if (teamId) {
    await operatorAssignPlayerByReadableId(session, teamId, readableId);
  }

  return { id, readableId };
}

export async function operatorUpdatePlayer(
  session: OperatorSession,
  playerId: string,
  input: PlayerInput & { readableId?: string | null },
): Promise<void> {
  const existing = await operatorGetPlayer(session, playerId);
  const body = {
    id: playerId,
    readableId: input.readableId ?? existing.readableId,
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    suffix: input.suffix?.trim() || null,
    address1: input.address1?.trim() || null,
    city: input.city.trim(),
    state: input.state.trim().toUpperCase(),
    zip: input.zip?.trim() || null,
    email1: input.email1?.trim() || null,
    phone1: input.phone1?.trim() || null,
    provisionalRating: Number(input.provisionalRating) || 400,
    gender: input.gender.trim() || "M",
  };
  const response = await operatorWebFetch(
    session,
    `/player/updateplayer/${encodeURIComponent(playerId)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  const data = await readJsonOrThrow<Record<string, unknown>>(
    response,
    "Could not update player.",
  );
  if (data.status === false) {
    throw new Error("Player update was rejected (rating change not allowed).");
  }
}

export async function operatorAssignPlayerByReadableId(
  session: OperatorSession,
  teamId: string,
  readableId: string,
): Promise<void> {
  const response = await operatorWebFetch(
    session,
    `/Player/AddSinglePlayerToTeamByReadableId?teamId=${encodeURIComponent(teamId)}&playerId=${encodeURIComponent(readableId)}`,
  );
  if (!response.ok) {
    throw new Error((await response.text()) || "Could not assign player.");
  }
}

export async function operatorAssignPlayerById(
  session: OperatorSession,
  teamId: string,
  playerId: string,
): Promise<void> {
  const response = await operatorWebFetch(
    session,
    `/Player/AddSinglePlayerToTeam?teamId=${encodeURIComponent(teamId)}&playerId=${encodeURIComponent(playerId)}`,
  );
  if (!response.ok) {
    throw new Error((await response.text()) || "Could not assign player.");
  }
}

export async function operatorRemovePlayerFromTeam(
  session: OperatorSession,
  teamId: string,
  playerId: string,
): Promise<void> {
  const response = await operatorWebFetch(
    session,
    "/TeamsPlayersLocations/RemovePlayerFromTeam",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId, teamId }),
    },
  );
  await readOperatorAction(response, "Could not remove player from team.");
}

/**
 * Remove a player from every team in a division (LMS has no hard-delete
 * player API — leaving all rosters drops them from the division list).
 */
export async function operatorRemovePlayerFromDivision(
  session: OperatorSession,
  divisionId: string,
  playerId: string,
): Promise<number> {
  const teams = await operatorListTeams(session, divisionId);
  const memberships = teams.filter((team) =>
    team.players.some((player) => player.id === playerId),
  );
  if (memberships.length === 0) {
    throw new Error("Player is not on any team in this division.");
  }
  for (const team of memberships) {
    await operatorRemovePlayerFromTeam(session, team.id, playerId);
  }
  return memberships.length;
}

export type PlayerSearchHit = {
  id: string;
  readableId: string;
  firstName: string;
  lastName: string;
  location: string | null;
  effectiveRating: string | null;
};

export async function operatorSearchPlayers(
  session: OperatorSession,
  query: string,
): Promise<PlayerSearchHit[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  const response = await operatorWebFetch(
    session,
    `/api/indexsearch?q=${encodeURIComponent(q)}`,
  );
  const data = await readJsonOrThrow<{ value?: unknown[] }>(
    response,
    "Player search failed.",
  );
  return (data.value ?? []).map((row) => {
    const r = (row ?? {}) as Record<string, unknown>;
    return {
      id: String(r.id ?? "").trim(),
      readableId: String(r.readableId ?? "").trim(),
      firstName: String(r.firstName ?? "").trim(),
      lastName: String(r.lastName ?? "").trim(),
      location: r.location != null ? String(r.location) : null,
      effectiveRating:
        r.effectiveRating != null ? String(r.effectiveRating) : null,
    };
  });
}

export type ScheduleMatch = {
  matchId: string | null;
  homeTeamId: string;
  homeTeamName: string;
  awayTeamId: string;
  awayTeamName: string;
  date: string;
  location: string | null;
  locationId: string | null;
};

export type ScoresheetMatch = {
  matchId: string;
  homeTeamName: string;
  awayTeamName: string;
  date: string;
  hasBeenPlayed: boolean;
  hasBeenScoredByPlayer: boolean;
  scoredByNames: string[];
};

export async function operatorListSchedule(
  session: OperatorSession,
  divisionId: string,
): Promise<ScheduleMatch[]> {
  const datesRes = await operatorWebFetch(
    session,
    `/Division/GetDates?divisionId=${encodeURIComponent(divisionId)}`,
  );
  const dates = await readJsonOrThrow<unknown[]>(
    datesRes,
    "Could not load schedule dates.",
  );
  const dateValues = (Array.isArray(dates) ? dates : [])
    .map((row) => {
      const r = (row ?? {}) as Record<string, unknown>;
      return String(r.Date ?? r.date ?? "").trim();
    })
    .filter(Boolean);

  const batches = await Promise.all(
    dateValues.map(async (date) => {
      const response = await operatorWebFetch(
        session,
        `/Division/GetMatchesForDate?divisionId=${encodeURIComponent(divisionId)}&date=${encodeURIComponent(date)}`,
      );
      const data = await readJsonOrThrow<unknown[]>(
        response,
        "Could not load matches for date.",
      );
      return (Array.isArray(data) ? data : []).map((row) => {
        const r = (row ?? {}) as Record<string, unknown>;
        return {
          matchId:
            r.MatchId != null
              ? String(r.MatchId)
              : r.matchId != null
                ? String(r.matchId)
                : null,
          homeTeamId: String(r.TeamOneId ?? r.homeTeamId ?? "").trim(),
          homeTeamName: String(
            r.TeamOneName ?? r.homeTeamName ?? "",
          ).trim(),
          awayTeamId: String(r.TeamTwoId ?? r.awayTeamId ?? "").trim(),
          awayTeamName: String(
            r.TeamTwoName ?? r.awayTeamName ?? "",
          ).trim(),
          date: String(r.Date ?? r.date ?? date).trim(),
          location:
            r.LocationName != null && String(r.LocationName).trim()
              ? String(r.LocationName).trim()
              : r.location != null && String(r.location).trim()
                ? String(r.location).trim()
                : null,
          locationId:
            r.LocationId != null
              ? String(r.LocationId)
              : r.locationId != null
                ? String(r.locationId)
                : null,
        } satisfies ScheduleMatch;
      });
    }),
  );

  return batches.flat().sort((a, b) => a.date.localeCompare(b.date));
}

/** LMS Division Score Entry list (includes played / player-scored status). */
export async function operatorListScoresheets(
  session: OperatorSession,
  divisionId: string,
): Promise<ScoresheetMatch[]> {
  const datesRes = await operatorWebFetch(
    session,
    `/DivisionScoreEntry/GetAllDatesForDivision?divisionId=${encodeURIComponent(divisionId)}`,
  );
  const dates = await readJsonOrThrow<unknown[]>(
    datesRes,
    "Could not load scoresheet dates.",
  );
  const dateValues = (Array.isArray(dates) ? dates : [])
    .map((row) => {
      if (typeof row === "string" || typeof row === "number") {
        return String(row).trim();
      }
      const r = (row ?? {}) as Record<string, unknown>;
      return String(r.Date ?? r.date ?? row ?? "").trim();
    })
    .filter(Boolean);

  const batches = await Promise.all(
    dateValues.map(async (date) => {
      const response = await operatorWebFetch(
        session,
        `/DivisionScoreEntry/GetMatchesForDate?divisionId=${encodeURIComponent(divisionId)}&selectedDate=${encodeURIComponent(date)}`,
      );
      const data = await readJsonOrThrow<unknown[]>(
        response,
        "Could not load scoresheets for date.",
      );
      return (Array.isArray(data) ? data : [])
        .map((row) => {
          const r = (row ?? {}) as Record<string, unknown>;
          const matchId = String(r.MatchId ?? r.matchId ?? "").trim();
          if (!matchId) return null;
          const scoredRaw = r.ScoredMatches ?? r.scoredMatches;
          const scoredByNames = Array.isArray(scoredRaw)
            ? scoredRaw
                .map((entry) => {
                  const e = (entry ?? {}) as Record<string, unknown>;
                  return String(e.ScorerName ?? e.scorerName ?? "").trim();
                })
                .filter(Boolean)
            : [];
          return {
            matchId,
            homeTeamName: String(r.TeamOne ?? r.teamOne ?? "").trim(),
            awayTeamName: String(r.TeamTwo ?? r.teamTwo ?? "").trim(),
            date,
            hasBeenPlayed: Boolean(r.HasBeenPlayed ?? r.hasBeenPlayed),
            hasBeenScoredByPlayer: Boolean(
              r.HasBeenScoredByPlayer ?? r.hasBeenScoredByPlayer,
            ),
            scoredByNames,
          } satisfies ScoresheetMatch;
        })
        .filter((row): row is ScoresheetMatch => row != null);
    }),
  );

  return batches.flat().sort((a, b) => a.date.localeCompare(b.date));
}

/** Clear LMS scores for a match (Division Score Entry → Reset Scoresheet). */
export async function operatorResetMatchResults(
  session: OperatorSession,
  matchId: string,
): Promise<void> {
  const response = await operatorWebFetch(
    session,
    "/DivisionScoreEntry/ResetMatchResultsBCAPL",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matchId }),
    },
  );
  const text = await response.text();
  if (!response.ok) {
    if (response.status === 400) {
      throw new Error("No scores to clear for this match.");
    }
    throw new Error(text || `Could not clear scoresheet (${response.status}).`);
  }
  if (!text.trim()) return;
  try {
    const payload = JSON.parse(text) as unknown;
    assertOperatorActionOk(payload, "Could not clear scoresheet.");
  } catch (error) {
    if (error instanceof SyntaxError) return;
    throw error;
  }
}

function noonIso(date: string): string {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return date;
  d.setUTCHours(12, 0, 0, 0);
  return d.toISOString();
}

function addDaysIso(date: string, days: number): string {
  const d = new Date(noonIso(date));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

type ScheduleSlot = {
  Week: number;
  HomeTeam: number;
  AwayTeam: number;
  Location: number;
};

export type ScheduleGenerateMode = "weeks" | "rounds";

export type ScheduleGenerateResult = {
  mode: ScheduleGenerateMode;
  weeksOrRounds: number;
  slotCount: number;
  matchCount: number;
};

/**
 * LMS RegenerateSchedule only returns slot indexes — it does not persist
 * matches. Also LMS rejects sending both rounds and weeks (>0) together;
 * the unused dimension must be 0.
 *
 * Flow: generate slots → clear unplayed matches → create each slot via newMatch.
 */
export async function operatorRegenerateSchedule(
  session: OperatorSession,
  input: {
    divisionId: string;
    startDate: string;
    mode: ScheduleGenerateMode;
    count: number;
  },
): Promise<ScheduleGenerateResult> {
  const count = Math.floor(Number(input.count));
  if (!Number.isFinite(count) || count < 1) {
    throw new Error("Enter at least 1 week or round.");
  }
  const numberOfWeeks = input.mode === "weeks" ? count : 0;
  const numberOfRounds = input.mode === "rounds" ? count : 0;
  const startDate = noonIso(input.startDate);

  const teams = await operatorGetDivisionTeams(session, input.divisionId);
  if (teams.length < 2) {
    throw new Error("Add at least two teams before generating a schedule.");
  }
  if (teams.some((team) => !team.isBye && !team.locationId)) {
    throw new Error(
      "Every non-bye team needs a home location before generating a schedule.",
    );
  }

  const response = await operatorWebFetch(
    session,
    "/Schedule/RegenerateSchedule",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        divisionId: input.divisionId,
        startDate,
        numberOfRounds,
        numberOfWeeks,
      }),
    },
  );
  const payload = await readOperatorAction(
    response,
    "Could not generate schedule.",
  );
  const data = (payload.data ?? payload.Data ?? {}) as {
    Slots?: ScheduleSlot[];
    slots?: ScheduleSlot[];
  };
  const slots = Array.isArray(data.Slots)
    ? data.Slots
    : Array.isArray(data.slots)
      ? data.slots
      : [];
  if (slots.length === 0) {
    throw new Error("LMS returned no schedule slots to create.");
  }

  // Replace existing unplayed matches with the new slot sheet.
  await operatorClearSchedule(session, input.divisionId);

  let matchCount = 0;
  const errors: string[] = [];
  const concurrency = 6;
  for (let i = 0; i < slots.length; i += concurrency) {
    const batch = slots.slice(i, i + concurrency);
    const results = await Promise.allSettled(
      batch.map(async (slot) => {
        const home = teams[slot.HomeTeam];
        const away = teams[slot.AwayTeam];
        const locationTeam = teams[slot.Location] ?? home;
        if (!home?.id || !away?.id) {
          throw new Error(
            `Slot week ${slot.Week} references a missing team index.`,
          );
        }
        const locationId = locationTeam?.locationId ?? home.locationId;
        if (!locationId) {
          throw new Error(
            `No location for ${home.name} vs ${away.name} (week ${slot.Week}).`,
          );
        }
        await operatorCreateMatch(session, {
          divisionId: input.divisionId,
          teamOneId: home.id,
          teamTwoId: away.id,
          date: addDaysIso(startDate, Math.max(0, slot.Week - 1) * 7),
          locationId,
        });
      }),
    );
    for (const result of results) {
      if (result.status === "fulfilled") matchCount += 1;
      else {
        errors.push(
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason),
        );
      }
    }
  }

  if (matchCount === 0) {
    throw new Error(
      errors[0] || "Could not create any matches from the generated slots.",
    );
  }
  if (errors.length > 0) {
    throw new Error(
      `Created ${matchCount} of ${slots.length} matches. ${errors[0]}`,
    );
  }

  return {
    mode: input.mode,
    weeksOrRounds: count,
    slotCount: slots.length,
    matchCount,
  };
}

export async function operatorClearSchedule(
  session: OperatorSession,
  divisionId: string,
): Promise<void> {
  const response = await operatorWebFetch(session, "/Schedule/clearSchedule", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ DivisionId: divisionId }),
  });
  await readOperatorAction(response, "Could not clear schedule.");
}

export async function operatorCreateMatch(
  session: OperatorSession,
  input: {
    divisionId: string;
    teamOneId: string;
    teamTwoId: string;
    date: string;
    locationId: string;
  },
): Promise<void> {
  const response = await operatorWebFetch(session, "/Schedule/newMatch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      DivisionId: input.divisionId,
      TeamOneId: input.teamOneId,
      TeamTwoId: input.teamTwoId,
      Date: noonIso(input.date),
      LocationId: input.locationId,
    }),
  });
  await readOperatorAction(response, "Could not create match.");
}

export async function operatorChangeMatch(
  session: OperatorSession,
  input: {
    matchId: string;
    teamOneId: string;
    teamTwoId: string;
    date: string;
    locationId: string;
  },
): Promise<void> {
  const response = await operatorWebFetch(session, "/Schedule/change", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      MatchId: input.matchId,
      TeamOneId: input.teamOneId,
      TeamTwoId: input.teamTwoId,
      Date: noonIso(input.date),
      LocationId: input.locationId,
    }),
  });
  if (!response.ok) {
    throw new Error((await response.text()) || "Could not update match.");
  }
}

export async function operatorDeleteMatch(
  session: OperatorSession,
  matchId: string,
): Promise<void> {
  const response = await operatorWebFetch(session, "/Schedule/deleteMatch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ matchId }),
  });
  if (!response.ok) {
    throw new Error((await response.text()) || "Could not delete match.");
  }
}

export async function operatorFlipMatch(
  session: OperatorSession,
  matchId: string,
): Promise<void> {
  const response = await operatorWebFetch(session, "/Schedule/flip", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ matchId }),
  });
  if (!response.ok) {
    throw new Error((await response.text()) || "Could not flip match.");
  }
}

export type FormatTemplate = {
  id: string;
  name: string;
  template: string;
};

export async function operatorGetFormatTemplates(
  session: OperatorSession,
): Promise<FormatTemplate[]> {
  const response = await operatorWebFetch(session, "/api/formattemplates");
  const data = await readJsonOrThrow<unknown[]>(
    response,
    "Could not load format templates.",
  );
  return (Array.isArray(data) ? data : []).map((row) => {
    const r = (row ?? {}) as Record<string, unknown>;
    return {
      id: String(r.id ?? "").trim(),
      name: String(r.name ?? "").trim(),
      template: String(r.template ?? ""),
    };
  });
}

export async function operatorSaveDivisionSettings(
  session: OperatorSession,
  settings: Record<string, unknown>,
): Promise<{ success: boolean; messages: string[]; redirectUrl: string | null }> {
  const response = await operatorWebFetch(
    session,
    "/Division/SaveDivisionSettings",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    },
  );
  const data = await readJsonOrThrow<Record<string, unknown>>(
    response,
    "Could not save division settings.",
  );
  const messagesRaw = data.Messages ?? data.messages;
  return {
    success: Boolean(data.Success ?? data.success),
    messages: Array.isArray(messagesRaw)
      ? messagesRaw.map((m) => String(m))
      : [],
    redirectUrl:
      data.RedirectUrl != null
        ? String(data.RedirectUrl)
        : data.redirectUrl != null
          ? String(data.redirectUrl)
          : null,
  };
}
