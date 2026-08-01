import { DEFAULT_LEAGUE_ID, LMS_BASE } from "./constants";
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

export type DiscoverMembershipOptions = {
  /** Used only for the rare public fallback when the player-schedule call is empty. */
  leagueId?: string | null;
  divisionId?: string | null;
  teamId?: string | null;
  teamName?: string | null;
  authFetch?: MembershipAuthFetch;
};

type PlayerScheduledMatch = {
  id?: string;
  divisionId?: string;
  divisionName?: string;
  teamOneId?: string;
  teamOneName?: string;
  teamTwoId?: string;
  teamTwoName?: string;
  TeamOneId?: string;
  TeamOneName?: string;
  TeamTwoId?: string;
  TeamTwoName?: string;
  DivisionId?: string;
  DivisionName?: string;
};

/**
 * Placeholder division id for the BCAPL player-schedule endpoint.
 * LMS ignores this path segment and returns every active-session match for
 * the given playerId — the same behavior the official scoring app relies on.
 */
const PLAYER_SCHEDULE_DIVISION_PLACEHOLDER =
  "00000000-0000-0000-0000-000000000000";

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

function mergeTeams(teams: MembershipTeam[]): MembershipTeam[] {
  const byKey = new Map<string, MembershipTeam>();
  for (const team of teams) {
    byKey.set(`${team.divisionId}:${team.teamId}`, team);
  }
  return Array.from(byKey.values());
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

async function findPlayerTeamInCandidates(
  playerId: string,
  entry: DivisionEntry,
  teamNames: Map<string, string>,
  authFetch?: MembershipAuthFetch,
): Promise<MembershipTeam | null> {
  const entries = Array.from(teamNames.entries());
  for (let i = 0; i < entries.length; i += 6) {
    const batch = entries.slice(i, i + 6);
    const found = await mapPool(batch, 6, async ([teamId, teamName]) => {
      try {
        const players = await loadRoster(teamId, teamName || "Team", authFetch);
        if (players.some((player) => player.id === playerId)) {
          return toMembershipTeam(
            entry,
            teamId,
            teamName || players[0]?.teamName || "Team",
          );
        }
      } catch {
        // Ignore roster failures for individual teams.
      }
      return null;
    });
    const hit = found.find(Boolean);
    if (hit) return hit;
  }
  return null;
}

/**
 * Same endpoint the BCAPL scoring app uses after login: one call returns
 * scheduled matches for every active session the player belongs to.
 * The division id in the path is ignored by LMS.
 */
export async function fetchPlayerScheduledMatches(
  playerId: string,
  authFetch?: MembershipAuthFetch,
): Promise<PlayerScheduledMatch[]> {
  const path = `/api/divisions/${PLAYER_SCHEDULE_DIVISION_PLACEHOLDER}/ScheduledMatchesForPlayerBCAPL?playerId=${encodeURIComponent(playerId)}`;

  if (authFetch) {
    try {
      const response = await authFetch(path);
      if (response.ok) {
        const matches = (await response.json()) as PlayerScheduledMatch[];
        if (Array.isArray(matches)) return matches;
      }
    } catch {
      // Fall through to public fetch — this endpoint is public for valid player ids.
    }
  }

  const response = await fetch(`${LMS_BASE}${path}`, {
    headers: {
      Accept: "application/json",
      "X-Requested-With": "XMLHttpRequest",
    },
    cache: "no-store",
  });
  if (!response.ok) return [];
  const matches = (await response.json()) as PlayerScheduledMatch[];
  return Array.isArray(matches) ? matches : [];
}

async function discoverFromPlayerSchedule(
  playerId: string,
  entries: DivisionEntry[],
  authFetch?: MembershipAuthFetch,
): Promise<MembershipTeam[]> {
  const matches = await fetchPlayerScheduledMatches(playerId, authFetch);
  if (!matches.length) return [];

  const entryByDivision = new Map(
    entries.map((entry) => [entry.DivisionId, entry] as const),
  );
  const teamsByDivision = new Map<string, Map<string, string>>();
  const namesByDivision = new Map<string, string>();

  for (const match of matches) {
    const divisionId = String(match.divisionId ?? match.DivisionId ?? "").trim();
    if (!divisionId) continue;
    namesByDivision.set(
      divisionId,
      String(match.divisionName ?? match.DivisionName ?? "").trim(),
    );
    let teamNames = teamsByDivision.get(divisionId);
    if (!teamNames) {
      teamNames = new Map();
      teamsByDivision.set(divisionId, teamNames);
    }
    for (const [teamId, teamName] of matchTeamIds(match)) {
      teamNames.set(teamId, teamName);
    }
  }

  const divisionIds = Array.from(teamsByDivision.keys());
  const found = await mapPool(divisionIds, 4, async (divisionId) => {
    const entry = entryByDivision.get(divisionId);
    if (!entry) return null;
    const teamNames = teamsByDivision.get(divisionId);
    if (!teamNames?.size) return null;
    return findPlayerTeamInCandidates(playerId, entry, teamNames, authFetch);
  });

  return found.filter(Boolean) as MembershipTeam[];
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
  for (let i = 0; i < uniqueMatchIds.length && i < 36; i += 6) {
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
    if (stableRounds >= 2 && teamNames.size >= 4) break;
  }
  return teamNames;
}

function recentDivisionEntries(
  entries: DivisionEntry[],
  options?: { leagueId?: string | null },
): DivisionEntry[] {
  const year = new Date().getFullYear();
  const recentYears = new Set([String(year), String(year - 1)]);
  const byDivision = new Map<string, DivisionEntry>();

  for (const entry of entries) {
    if (!recentYears.has(entry.LeagueYear)) continue;
    if (options?.leagueId && entry.LeagueId !== options.leagueId) continue;
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
  const merged = mergeTeams(teams);
  const divisionIds = new Set(merged.map((team) => team.divisionId));
  const leagueIds = new Set(merged.map((team) => team.leagueId));
  const leagues = groupLeagues(entries).filter((league) =>
    leagueIds.has(league.id),
  );
  const divisions = Array.from(leagueIds).flatMap((id) =>
    divisionsForLeague(entries, id).filter((division) =>
      divisionIds.has(division.id),
    ),
  );
  return { playerId, teams: merged, leagues, divisions };
}

async function verifyKnownTeam(
  playerId: string,
  entries: DivisionEntry[],
  options: DiscoverMembershipOptions,
): Promise<MembershipTeam | null> {
  const teamId = options.teamId?.trim();
  const divisionId = options.divisionId?.trim();
  if (!teamId || !divisionId) return null;

  const entry = entries.find((item) => item.DivisionId === divisionId);
  if (!entry) return null;

  try {
    const players = await loadRoster(
      teamId,
      options.teamName?.trim() || "Team",
      options.authFetch,
    );
    if (!players.some((player) => player.id === playerId)) return null;
    return toMembershipTeam(
      entry,
      teamId,
      options.teamName?.trim() || "Team",
    );
  } catch {
    return null;
  }
}

/** Last-resort public roster scan of one preferred league. */
async function discoverDivisionTeamsPublic(
  playerId: string,
  entry: DivisionEntry,
  authFetch?: MembershipAuthFetch,
): Promise<MembershipTeam[]> {
  try {
    const teamNames = await collectTeamsFromSchedule(entry);
    if (!teamNames.size) return [];
    const hit = await findPlayerTeamInCandidates(
      playerId,
      entry,
      teamNames,
      authFetch,
    );
    return hit ? [hit] : [];
  } catch {
    return [];
  }
}

/**
 * Discover leagues/divisions/teams where `playerId` appears on a roster.
 *
 * Primary path mirrors the BCAPL scoring app:
 * one `ScheduledMatchesForPlayerBCAPL` call returns active-session matches,
 * then we roster-check candidate teams per division.
 */
export async function discoverMembership(
  playerId: string,
  options?: DiscoverMembershipOptions,
): Promise<MembershipSnapshot> {
  const leagueId = (options?.leagueId || "").trim() || DEFAULT_LEAGUE_ID;
  const entries = await fetchAllDivisions();
  const known = await verifyKnownTeam(playerId, entries, options ?? {});

  let teams: MembershipTeam[] = known ? [known] : [];

  const scheduleTeams = await discoverFromPlayerSchedule(
    playerId,
    entries,
    options?.authFetch,
  );
  teams = mergeTeams([...teams, ...scheduleTeams]);

  // Rare fallback: player on a roster with no scheduled matches yet.
  if (!teams.length) {
    const leagueDivisions = recentDivisionEntries(entries, { leagueId });
    const publicTeams = await mapPool(leagueDivisions, 3, (entry) =>
      discoverDivisionTeamsPublic(playerId, entry, options?.authFetch),
    );
    teams = publicTeams.flat();
  }

  return snapshotFromTeams(playerId, entries, teams);
}
