import { DEFAULT_LEAGUE_ID } from "./constants";
import {
  divisionsForLeague,
  fetchAllDivisions,
  fetchMatch,
  fetchSchedule,
  fetchTeamPlayers,
  groupLeagues,
} from "./lms";
import type { DivisionEntry, MembershipSnapshot, MembershipTeam } from "./types";

export type MembershipAuthFetch = (
  path: string,
  init?: RequestInit,
) => Promise<Response>;

type PlayerScheduledMatch = {
  teamOneId: string;
  teamOneName: string;
  teamTwoId: string;
  teamTwoName: string;
};

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
      results[index] = await worker(items[index]!);
    }
  }

  const runners = Array.from(
    { length: Math.min(concurrency, Math.max(items.length, 1)) },
    () => run(),
  );
  await Promise.all(runners);
  return results;
}

function toMembershipTeam(
  entry: DivisionEntry,
  teamId: string,
  teamName: string,
): MembershipTeam {
  return {
    teamId,
    teamName,
    divisionId: entry.DivisionId,
    divisionName: entry.DivisionName,
    leagueId: entry.LeagueId,
    leagueName: entry.LeagueName,
    state: entry.State,
    year: entry.LeagueYear,
  };
}

async function teamsFromMatchList(
  playerId: string,
  entry: DivisionEntry,
  matches: PlayerScheduledMatch[],
): Promise<MembershipTeam[]> {
  const teamNames = new Map<string, string>();
  for (const match of matches) {
    if (match.teamOneId) {
      teamNames.set(match.teamOneId, (match.teamOneName ?? "").trim());
    }
    if (match.teamTwoId) {
      teamNames.set(match.teamTwoId, (match.teamTwoName ?? "").trim());
    }
  }

  const hits: MembershipTeam[] = [];
  await mapPool(Array.from(teamNames.entries()), 6, async ([teamId, teamName]) => {
    try {
      const players = await fetchTeamPlayers(teamId, teamName || "Team");
      if (players.some((player) => player.id === playerId)) {
        hits.push(
          toMembershipTeam(entry, teamId, teamName || players[0]?.teamName || "Team"),
        );
      }
    } catch {
      // Ignore roster failures for individual teams.
    }
  });
  return hits;
}

/**
 * Prefer the authenticated per-player schedule endpoint (one call / division).
 * Falls back to a bounded public schedule/roster scan when auth is unavailable.
 */
async function discoverDivisionTeams(
  playerId: string,
  entry: DivisionEntry,
  authFetch?: MembershipAuthFetch,
): Promise<MembershipTeam[]> {
  if (authFetch) {
    try {
      const response = await authFetch(
        `/api/divisions/${entry.DivisionId}/ScheduledMatchesForPlayerBCAPL?playerId=${encodeURIComponent(playerId)}`,
      );
      if (response.ok) {
        const matches = (await response.json()) as PlayerScheduledMatch[];
        if (!Array.isArray(matches) || matches.length === 0) return [];
        return teamsFromMatchList(playerId, entry, matches);
      }
    } catch {
      // Fall through to public scan for this division.
    }
  }

  try {
    const schedule = await fetchSchedule(entry.DivisionId);
    const matchIds: string[] = [];
    for (const day of schedule) {
      for (const match of day.matches) {
        if (match.matchId) matchIds.push(match.matchId);
      }
    }
    const uniqueMatchIds = Array.from(new Set(matchIds)).slice(0, 36);
    if (!uniqueMatchIds.length) return [];

    const details = await mapPool(uniqueMatchIds, 6, async (matchId) => {
      try {
        return await fetchMatch(matchId);
      } catch {
        return null;
      }
    });

    const matches: PlayerScheduledMatch[] = [];
    for (const detail of details) {
      if (!detail) continue;
      matches.push({
        teamOneId: detail.teamOneId,
        teamOneName: detail.teamOneName,
        teamTwoId: detail.teamTwoId,
        teamTwoName: detail.teamTwoName,
      });
    }
    return teamsFromMatchList(playerId, entry, matches);
  } catch {
    return [];
  }
}

/**
 * Discover leagues/divisions/teams where `playerId` appears on a roster.
 * Always scoped to one league — a worldwide scan is too slow for serverless.
 */
export async function discoverMembership(
  playerId: string,
  options?: {
    leagueId?: string | null;
    authFetch?: MembershipAuthFetch;
  },
): Promise<MembershipSnapshot> {
  const leagueId = (options?.leagueId || "").trim() || DEFAULT_LEAGUE_ID;
  const entries = await fetchAllDivisions();
  const year = new Date().getFullYear();
  const recentYears = new Set([String(year), String(year - 1)]);

  const candidates = entries.filter(
    (entry) =>
      entry.LeagueId === leagueId && recentYears.has(entry.LeagueYear),
  );

  const byDivision = new Map<string, DivisionEntry>();
  for (const entry of candidates) {
    if (!byDivision.has(entry.DivisionId)) {
      byDivision.set(entry.DivisionId, entry);
    }
  }

  const teamsNested = await mapPool(
    Array.from(byDivision.values()),
    4,
    (entry) =>
      discoverDivisionTeams(playerId, entry, options?.authFetch),
  );

  const teams = teamsNested.flat();
  const divisionIds = new Set(teams.map((team) => team.divisionId));
  const leagueIds = new Set(teams.map((team) => team.leagueId));

  const leagues = groupLeagues(entries).filter((league) =>
    leagueIds.has(league.id),
  );
  const divisions = Array.from(leagueIds).flatMap((id) =>
    divisionsForLeague(entries, id).filter((division) =>
      divisionIds.has(division.id),
    ),
  );

  return { playerId, teams, leagues, divisions };
}
