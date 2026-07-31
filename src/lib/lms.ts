import * as cheerio from "cheerio";
import { LMS_BASE } from "./constants";
import type {
  DivisionEntry,
  DivisionSummary,
  LeagueSummary,
  PlayersByTeamReport,
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
