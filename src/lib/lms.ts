import * as cheerio from "cheerio";
import { LMS_BASE } from "./constants";
import type { DivisionFormat } from "./handicap";
import type {
  CalculatorMatchup,
  DivisionEntry,
  DivisionSummary,
  DivisionTeam,
  LeagueSummary,
  PlayersByTeamReport,
  RosterPlayer,
  ScheduleDay,
  ScheduleMatch,
  TableReport,
} from "./types";

const divisionsCache: {
  fetchedAt: number;
  data: DivisionEntry[] | null;
} = { fetchedAt: 0, data: null };

const CACHE_TTL_MS = 5 * 60 * 1000;

async function lmsFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const response = await fetch(`${LMS_BASE}${path}`, {
    ...init,
    headers: {
      Accept: "*/*",
      "X-Requested-With": "XMLHttpRequest",
      ...(init?.headers ?? {}),
    },
    // Cache public LMS reads briefly; POSTs remain uncached by default.
    next: init?.method && init.method !== "GET" ? undefined : { revalidate: 300 },
  });

  if (!response.ok) {
    throw new Error(`LMS request failed (${response.status}) for ${path}`);
  }

  return response;
}

export async function fetchAllDivisions(
  force = false,
): Promise<DivisionEntry[]> {
  const now = Date.now();
  if (
    !force &&
    divisionsCache.data &&
    now - divisionsCache.fetchedAt < CACHE_TTL_MS
  ) {
    return divisionsCache.data;
  }

  const response = await lmsFetch("/PublicReport/GetDivisions");
  const data = (await response.json()) as DivisionEntry[];
  divisionsCache.data = data;
  divisionsCache.fetchedAt = now;
  return data;
}

export function groupLeagues(entries: DivisionEntry[]): LeagueSummary[] {
  const map = new Map<string, LeagueSummary>();

  for (const entry of entries) {
    const existing = map.get(entry.LeagueId);
    if (!existing) {
      map.set(entry.LeagueId, {
        id: entry.LeagueId,
        name: entry.LeagueName,
        state: entry.State,
        years: [entry.LeagueYear],
        divisionCount: 1,
      });
      continue;
    }

    existing.divisionCount += 1;
    if (!existing.years.includes(entry.LeagueYear)) {
      existing.years.push(entry.LeagueYear);
    }
  }

  return Array.from(map.values()).sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
}

export function divisionsForLeague(
  entries: DivisionEntry[],
  leagueId: string,
): DivisionSummary[] {
  return entries
    .filter((entry) => entry.LeagueId === leagueId)
    .map((entry) => ({
      id: entry.DivisionId,
      name: entry.DivisionName,
      year: entry.LeagueYear,
      leagueId: entry.LeagueId,
      leagueName: entry.LeagueName,
      state: entry.State,
      reportUrl: entry.DivisionReportUrl,
    }))
    .sort((a, b) => {
      const yearCmp = b.year.localeCompare(a.year);
      if (yearCmp !== 0) return yearCmp;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
}

function parseTable(html: string): TableReport {
  const $ = cheerio.load(html);
  const headers: string[] = [];
  $("thead th").each((_, el) => {
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (text) headers.push(text);
  });

  const rows: string[][] = [];
  $("tbody tr").each((_, tr) => {
    const cells: string[] = [];
    $(tr)
      .find("td")
      .each((__, td) => {
        cells.push($(td).text().replace(/\s+/g, " ").trim());
      });
    if (cells.length > 0) rows.push(cells);
  });

  return { headers, rows };
}

export async function fetchTeamStandings(
  divisionId: string,
): Promise<TableReport> {
  const response = await lmsFetch(
    `/PublicReport/GenerateTeamStandingsReport/${divisionId}`,
  );
  return parseTable(await response.text());
}

export async function fetchPlayerStandings(
  divisionId: string,
): Promise<TableReport> {
  const response = await lmsFetch(
    `/PublicReport/GeneratePlayerStandingsReport/${divisionId}`,
  );
  return parseTable(await response.text());
}

export async function fetchPlayerList(
  divisionId: string,
): Promise<TableReport> {
  const response = await lmsFetch(
    `/PublicReport/GeneratePlayerListReport/${divisionId}`,
  );
  return parseTable(await response.text());
}

export async function fetchPlayersByTeam(
  divisionId: string,
): Promise<PlayersByTeamReport> {
  const response = await lmsFetch(
    `/PublicReport/GeneratePlayerStandingsByTeamReport/${divisionId}`,
  );
  const html = await response.text();
  const $ = cheerio.load(html);

  const headers = $("thead th")
    .map((_, el) => $(el).text().replace(/\s+/g, " ").trim())
    .get()
    .filter(Boolean);

  const teams: PlayersByTeamReport["teams"] = [];
  let current: PlayersByTeamReport["teams"][number] | null = null;

  $("tbody tr").each((_, tr) => {
    const $tr = $(tr);
    if ($tr.hasClass("subtitle-row") || $tr.find("td.subtitle").length) {
      const team = $tr.text().replace(/\s+/g, " ").trim();
      current = { team, rows: [] };
      teams.push(current);
      return;
    }

    const cells = $tr
      .find("td")
      .map((__, td) => $(td).text().replace(/\s+/g, " ").trim())
      .get();

    if (!cells.length) return;
    if (!current) {
      current = { team: "Division", rows: [] };
      teams.push(current);
    }
    current.rows.push(cells);
  });

  return { headers, teams };
}

function extractMatchId(url: string | undefined): string | null {
  if (!url) return null;
  const match = url.match(/matchId=([0-9a-f-]+)/i);
  return match?.[1] ?? null;
}

export async function fetchSchedule(
  divisionId: string,
): Promise<ScheduleDay[]> {
  const body = new URLSearchParams({ divisionId });
  const response = await lmsFetch(
    "/PublicReport/GenerateDivisionScheduleReport",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    },
  );

  const html = await response.text();
  const $ = cheerio.load(html);
  const days: ScheduleDay[] = [];
  let current: ScheduleDay | null = null;

  $("#schedule-list")
    .children()
    .each((_, el) => {
      const $el = $(el);
      if ($el.hasClass("schedule-date")) {
        current = {
          date: $el.text().replace(/\s+/g, " ").trim(),
          matches: [],
        };
        days.push(current);
        return;
      }

      if (!$el.hasClass("schedule-team-block")) return;
      if (!current) {
        current = { date: "TBD", matches: [] };
        days.push(current);
      }

      const teams = $el
        .find(".schedule-team")
        .map((__, team) => $(team).text().replace(/\s+/g, " ").trim())
        .get();
      const location = $el
        .find(".schedule-location")
        .first()
        .text()
        .replace(/\s+/g, " ")
        .trim();
      const url = $el.attr("data-url") ?? null;

      const match: ScheduleMatch = {
        matchId: extractMatchId(url ?? undefined),
        home: teams[0] ?? "TBD",
        away: teams[1] ?? "TBD",
        location,
        url: url ? `${LMS_BASE}${url}` : null,
      };
      current.matches.push(match);
    });

  return days;
}

type LmsMatchPayload = {
  id: string;
  divisionId: string;
  divisionName: string;
  datePlayed: string;
  teamOneId: string;
  teamOneName: string;
  teamTwoId: string;
  teamTwoName: string;
  location: string;
};

type LmsTeamPayload = {
  id: string;
  name: string;
  isBye: boolean;
  locationId: string | null;
  divisionId: string;
};

type LmsPlayerPayload = {
  id: string;
  readableId: number;
  firstName: string;
  lastName: string;
  nickname: string | null;
  fargoRating: string | number | null;
  robustness: string | null;
  provisionalRating: number | null;
  handicap: number | null;
  showOnRoster: boolean;
};

function toRating(value: string | number | null | undefined): number {
  const n = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(n) ? n : 0;
}

export async function fetchDivisionFormat(
  divisionId: string,
): Promise<DivisionFormat> {
  const response = await lmsFetch(`/api/divisions/${divisionId}/format`);
  return (await response.json()) as DivisionFormat;
}

export async function fetchMatch(matchId: string): Promise<LmsMatchPayload> {
  const response = await lmsFetch(`/api/matches/${matchId}`);
  return (await response.json()) as LmsMatchPayload;
}

export async function fetchTeam(teamId: string): Promise<LmsTeamPayload> {
  const response = await lmsFetch(`/api/teams/${teamId}`);
  return (await response.json()) as LmsTeamPayload;
}

export async function fetchTeamPlayers(
  teamId: string,
  teamName: string,
): Promise<RosterPlayer[]> {
  const response = await lmsFetch(`/api/teams/${teamId}/players`);
  const players = (await response.json()) as LmsPlayerPayload[];
  return players.map((player) => ({
    id: player.id,
    readableId: player.readableId,
    firstName: player.firstName,
    lastName: player.lastName,
    nickname: player.nickname,
    fargoRating: toRating(player.fargoRating),
    robustness: player.robustness,
    provisionalRating: player.provisionalRating,
    handicap: player.handicap,
    showOnRoster: player.showOnRoster !== false,
    teamId,
    teamName,
  }));
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  async function run() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index]);
    }
  }

  const runners = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => run(),
  );
  await Promise.all(runners);
  return results;
}

const calculatorCache = new Map<
  string,
  {
    fetchedAt: number;
    data: {
      format: DivisionFormat;
      teams: DivisionTeam[];
      schedule: ScheduleDay[];
      matchups: CalculatorMatchup[];
    };
  }
>();

/**
 * Build division teams + rosters from the schedule, because
 * /api/divisions/{id}/teams is not available publicly.
 */
export async function fetchDivisionCalculatorContext(divisionId: string): Promise<{
  format: DivisionFormat;
  teams: DivisionTeam[];
  schedule: ScheduleDay[];
  matchups: CalculatorMatchup[];
}> {
  const cached = calculatorCache.get(divisionId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  const [format, schedule] = await Promise.all([
    fetchDivisionFormat(divisionId),
    fetchSchedule(divisionId),
  ]);

  const matchIds: string[] = [];
  for (const day of schedule) {
    for (const match of day.matches) {
      if (match.matchId) matchIds.push(match.matchId);
    }
  }

  const uniqueMatchIds = Array.from(new Set(matchIds));
  const matchDetails = await mapPool(uniqueMatchIds, 6, async (matchId) => {
    try {
      return await fetchMatch(matchId);
    } catch {
      return null;
    }
  });

  const teamIds = new Map<string, string>();
  for (const detail of matchDetails) {
    if (!detail) continue;
    teamIds.set(detail.teamOneId, detail.teamOneName);
    teamIds.set(detail.teamTwoId, detail.teamTwoName);
  }

  const teams = await mapPool(
    Array.from(teamIds.entries()),
    6,
    async ([teamId, teamName]) => {
      const [team, players] = await Promise.all([
        fetchTeam(teamId).catch(() => null),
        fetchTeamPlayers(teamId, teamName),
      ]);
      const resolvedName = (team?.name ?? teamName).trim();
      return {
        id: teamId,
        name: resolvedName,
        isBye: team?.isBye ?? false,
        locationId: team?.locationId ?? null,
        players: players
          .filter((player) => player.showOnRoster)
          .map((player) => ({ ...player, teamName: resolvedName }))
          .sort((a, b) =>
            `${a.lastName} ${a.firstName}`.localeCompare(
              `${b.lastName} ${b.firstName}`,
            ),
          ),
      } satisfies DivisionTeam;
    },
  );

  teams.sort((a, b) => a.name.localeCompare(b.name));

  const matchups: CalculatorMatchup[] = [];
  for (const day of schedule) {
    for (const match of day.matches) {
      if (!match.matchId) continue;
      const detail = matchDetails.find((item) => item?.id === match.matchId);
      if (!detail) continue;
      matchups.push({
        matchId: detail.id,
        date: day.date,
        location: detail.location || match.location,
        homeTeamId: detail.teamOneId,
        homeTeamName: detail.teamOneName.trim(),
        awayTeamId: detail.teamTwoId,
        awayTeamName: detail.teamTwoName.trim(),
      });
    }
  }

  const payload = { format, teams, schedule, matchups };
  calculatorCache.set(divisionId, { fetchedAt: Date.now(), data: payload });
  return payload;
}
