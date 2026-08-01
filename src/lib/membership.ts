import {
  divisionsForLeague,
  fetchAllDivisions,
  fetchDivisionCalculatorContext,
  groupLeagues,
} from "./lms";
import type { MembershipSnapshot, MembershipTeam } from "./types";

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

/**
 * Discover leagues/divisions/teams where `playerId` appears on a roster.
 * Uses cached calculator context when available (same Redis LMS cache).
 */
export async function discoverMembership(
  playerId: string,
  options?: { leagueId?: string | null },
): Promise<MembershipSnapshot> {
  const entries = await fetchAllDivisions();
  const year = new Date().getFullYear();
  const recentYears = new Set([String(year), String(year - 1)]);

  let candidates = entries.filter((entry) => recentYears.has(entry.LeagueYear));
  if (options?.leagueId) {
    candidates = candidates.filter(
      (entry) => entry.LeagueId === options.leagueId,
    );
  }

  const byDivision = new Map<string, (typeof candidates)[number]>();
  for (const entry of candidates) {
    if (!byDivision.has(entry.DivisionId)) {
      byDivision.set(entry.DivisionId, entry);
    }
  }

  const teamsNested = await mapPool(
    Array.from(byDivision.values()),
    5,
    async (entry) => {
      try {
        const context = await fetchDivisionCalculatorContext(entry.DivisionId);
        const mine = context.teams.filter((team) =>
          team.players.some((player) => player.id === playerId),
        );
        return mine.map(
          (team) =>
            ({
              teamId: team.id,
              teamName: team.name,
              divisionId: entry.DivisionId,
              divisionName: entry.DivisionName,
              leagueId: entry.LeagueId,
              leagueName: entry.LeagueName,
              state: entry.State,
              year: entry.LeagueYear,
            }) satisfies MembershipTeam,
        );
      } catch {
        return [] as MembershipTeam[];
      }
    },
  );

  const teams = teamsNested.flat();
  const divisionIds = new Set(teams.map((team) => team.divisionId));
  const leagueIds = new Set(teams.map((team) => team.leagueId));

  const leagues = groupLeagues(entries).filter((league) =>
    leagueIds.has(league.id),
  );
  const divisions = Array.from(leagueIds).flatMap((leagueId) =>
    divisionsForLeague(entries, leagueId).filter((division) =>
      divisionIds.has(division.id),
    ),
  );

  return { playerId, teams, leagues, divisions };
}
