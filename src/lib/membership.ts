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
  teamOneId?: string;
  teamOneName?: string;
  teamTwoId?: string;
  teamTwoName?: string;
  TeamOneId?: string;
  TeamOneName?: string;
  TeamTwoId?: string;
  TeamTwoName?: string;
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

function matchTeamIds(match: PlayerScheduledMatch): Array<[string, string]> {
  const oneId = String(match.teamOneId ?? match.TeamOneId ?? "").trim();
  const twoId = String(match.teamTwoId ?? match.TeamTwoId ?? "").trim();
  const oneName = String(match.teamOneName ?? match.TeamOneName ?? "").trim();
  const twoName = String(match.teamTwoName ?? match.TeamTwoName ?? "").trim();
  const pairs: Array<[string, string]> = [];
  if (oneId) pairs.push([oneId, oneName]);
  if (twoId) pairs.push([twoId, twoName]);
  return pairs;
}

async function loadRoster(
  teamId: string,
  teamName: string,
  authFetch?: MembershipAuthFetch,
): Promise<Array<{ id: string; teamName?: string }>> {
  if (authFetch) {
    try {
      const response = await authFetch(`/api/teams/${teamId}/players`);
      if (response.ok) {
        const payload = (await response.json()) as Array<Record<string, unknown>>;
        return payload.map((player) => ({
          id: String(player.id ?? ""),
          teamName,
        }));
      }
    } catch {
      // Fall through to public roster.
    }
  }
  return fetchTeamPlayers(teamId, teamName || "Team");
}

async function teamsFromTeamMap(
  playerId: string,
  entry: DivisionEntry,
  teamNames: Map<string, string>,
  authFetch?: MembershipAuthFetch,
): Promise<MembershipTeam[]> {
  const hits: MembershipTeam[] = [];
  await mapPool(Array.from(teamNames.entries()), 6, async ([teamId, teamName]) => {
    try {
      const players = await loadRoster(teamId, teamName || "Team", authFetch);
      if (players.some((player) => player.id === playerId)) {
        hits.push(
          toMembershipTeam(
            entry,
            teamId,
            teamName || players[0]?.teamName || "Team",
          ),
        );
      }
    } catch {
      // Ignore roster failures for individual teams.
    }
  });
  return hits;
}

async function collectTeamsFromSchedule(
  entry: DivisionEntry,
): Promise<Map<string, string>> {
  const schedule = await fetchSchedule(entry.DivisionId);
  const matchIds: string[] = [];
  for (const day of schedule) {
    for (const match of day.matches) {
      if (match.matchId) matchIds.push(match.matchId);
    }
  }
  const uniqueMatchIds = Array.from(new Set(matchIds));
  const teamNames = new Map<string, string>();
  if (!uniqueMatchIds.length) return teamNames;

  let previousSize = 0;
  let stableRounds = 0;
  for (let i = 0; i < uniqueMatchIds.length && i < 48; i += 6) {
    const batch = uniqueMatchIds.slice(i, i + 6);
    const details = await mapPool(batch, 6, async (matchId) => {
      try {
        return await fetchMatch(matchId);
      } catch {
        return null;
      }
    });
    for (const detail of details) {
      if (!detail) continue;
      if (detail.teamOneId) {
        teamNames.set(detail.teamOneId, (detail.teamOneName ?? "").trim());
      }
      if (detail.teamTwoId) {
        teamNames.set(detail.teamTwoId, (detail.teamTwoName ?? "").trim());
      }
    }
    if (teamNames.size === previousSize) stableRounds += 1;
    else {
      stableRounds = 0;
      previousSize = teamNames.size;
    }
    // Most divisions stabilize well before the full schedule is fetched.
    if (stableRounds >= 2 && teamNames.size >= 4) break;
  }
  return teamNames;
}

async function authMatchesForDivision(
  playerId: string,
  divisionId: string,
  authFetch: MembershipAuthFetch,
): Promise<PlayerScheduledMatch[] | null> {
  try {
    const response = await authFetch(
      `/api/divisions/${divisionId}/ScheduledMatchesForPlayerBCAPL?playerId=${encodeURIComponent(playerId)}`,
    );
    if (!response.ok) return null;
    const matches = (await response.json()) as PlayerScheduledMatch[];
    return Array.isArray(matches) ? matches : null;
  } catch {
    return null;
  }
}

/**
 * Discover teams for one division.
 * Prefer authenticated player-schedule hints, then always fall back to a
 * bounded public schedule/roster scan when that yields no membership.
 */
async function discoverDivisionTeams(
  playerId: string,
  entry: DivisionEntry,
  authFetch?: MembershipAuthFetch,
): Promise<MembershipTeam[]> {
  if (authFetch) {
    const matches = await authMatchesForDivision(
      playerId,
      entry.DivisionId,
      authFetch,
    );
    if (matches && matches.length > 0) {
      const teamNames = new Map<string, string>();
      for (const match of matches) {
        for (const [teamId, teamName] of matchTeamIds(match)) {
          teamNames.set(teamId, teamName);
        }
      }
      const fromAuth = await teamsFromTeamMap(
        playerId,
        entry,
        teamNames,
        authFetch,
      );
      if (fromAuth.length) return fromAuth;
    }
  }

  try {
    const teamNames = await collectTeamsFromSchedule(entry);
    if (!teamNames.size) return [];
    return teamsFromTeamMap(playerId, entry, teamNames, authFetch);
  } catch {
    return [];
  }
}

function recentDivisionEntries(
  entries: DivisionEntry[],
  options?: { leagueId?: string | null; state?: string | null },
): DivisionEntry[] {
  const year = new Date().getFullYear();
  const recentYears = new Set([String(year), String(year - 1)]);
  const byDivision = new Map<string, DivisionEntry>();

  for (const entry of entries) {
    if (!recentYears.has(entry.LeagueYear)) continue;
    if (options?.leagueId && entry.LeagueId !== options.leagueId) continue;
    if (options?.state && entry.State !== options.state) continue;
    if (!byDivision.has(entry.DivisionId)) {
      byDivision.set(entry.DivisionId, entry);
    }
  }
  return Array.from(byDivision.values());
}

function snapshotFromTeams(
  playerId: string,
  entries: DivisionEntry[],
  teams: MembershipTeam[],
): MembershipSnapshot {
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

/**
 * Fast path: probe many divisions via the authenticated player-schedule API.
 * Only divisions that return matches are roster-checked.
 */
async function discoverViaAuthProbe(
  playerId: string,
  candidates: DivisionEntry[],
  authFetch: MembershipAuthFetch,
): Promise<MembershipTeam[]> {
  const withMatches = (
    await mapPool(candidates, 12, async (entry) => {
      const matches = await authMatchesForDivision(
        playerId,
        entry.DivisionId,
        authFetch,
      );
      if (!matches?.length) return null;
      return { entry, matches };
    })
  ).filter(Boolean) as Array<{
    entry: DivisionEntry;
    matches: PlayerScheduledMatch[];
  }>;

  const nested = await mapPool(withMatches, 4, async ({ entry, matches }) => {
    const teamNames = new Map<string, string>();
    for (const match of matches) {
      for (const [teamId, teamName] of matchTeamIds(match)) {
        teamNames.set(teamId, teamName);
      }
    }
    return teamsFromTeamMap(playerId, entry, teamNames, authFetch);
  });
  return nested.flat();
}

/**
 * Discover leagues/divisions/teams where `playerId` appears on a roster.
 *
 * - `auto`: probe the player's state (or all recent divisions) via auth, then
 *   fall back to a public roster scan of the preferred league.
 * - otherwise: scan only the given/default league.
 */
export async function discoverMembership(
  playerId: string,
  options?: {
    leagueId?: string | null;
    auto?: boolean;
    authFetch?: MembershipAuthFetch;
  },
): Promise<MembershipSnapshot> {
  const leagueId = (options?.leagueId || "").trim() || DEFAULT_LEAGUE_ID;
  const entries = await fetchAllDivisions();

  if (options?.auto && options.authFetch) {
    const seed = entries.find((entry) => entry.LeagueId === leagueId);
    const stateCandidates = recentDivisionEntries(entries, {
      state: seed?.State || null,
    });
    // If we can't resolve a state, keep the probe bounded to the preferred league.
    const probeList = stateCandidates.length
      ? stateCandidates
      : recentDivisionEntries(entries, { leagueId });
    const authTeams = await discoverViaAuthProbe(
      playerId,
      probeList,
      options.authFetch,
    );
    if (authTeams.length) {
      return snapshotFromTeams(playerId, entries, authTeams);
    }
  }

  const leagueDivisions = recentDivisionEntries(entries, { leagueId });
  const teamsNested = await mapPool(leagueDivisions, 3, (entry) =>
    discoverDivisionTeams(playerId, entry, options?.authFetch),
  );
  return snapshotFromTeams(playerId, entries, teamsNested.flat());
}
