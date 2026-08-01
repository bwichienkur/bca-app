import type { CalculatorMatchup } from "./types";

export function findWeeklyMatchupForTeam(
  matchups: CalculatorMatchup[],
  teamId: string,
  today = new Date(),
): CalculatorMatchup | null {
  if (!matchups.length || !teamId) return null;

  const todayStart = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  ).getTime();

  const mine = matchups.filter(
    (match) => match.homeTeamId === teamId || match.awayTeamId === teamId,
  );
  if (!mine.length) return null;

  const withTime = mine.map((match) => ({
    match,
    time: new Date(match.date).getTime(),
  }));

  const upcoming = withTime
    .filter((item) => !Number.isNaN(item.time) && item.time >= todayStart)
    .sort((a, b) => a.time - b.time);
  if (upcoming[0]) return upcoming[0].match;

  const past = withTime
    .filter((item) => !Number.isNaN(item.time) && item.time < todayStart)
    .sort((a, b) => b.time - a.time);
  return past[0]?.match ?? mine[0];
}

/** Prefer an upcoming pairing between two teams; otherwise the most recent. */
export function findMatchupBetweenTeams(
  matchups: CalculatorMatchup[],
  teamIdA: string,
  teamIdB: string,
  today = new Date(),
): CalculatorMatchup | null {
  if (!matchups.length || !teamIdA || !teamIdB) return null;

  const todayStart = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  ).getTime();

  const pair = matchups.filter(
    (match) =>
      (match.homeTeamId === teamIdA && match.awayTeamId === teamIdB) ||
      (match.homeTeamId === teamIdB && match.awayTeamId === teamIdA),
  );
  if (!pair.length) return null;

  const withTime = pair.map((match) => ({
    match,
    time: new Date(match.date).getTime(),
  }));

  const upcoming = withTime
    .filter((item) => !Number.isNaN(item.time) && item.time >= todayStart)
    .sort((a, b) => a.time - b.time);
  if (upcoming[0]) return upcoming[0].match;

  const past = withTime
    .filter((item) => !Number.isNaN(item.time) && item.time < todayStart)
    .sort((a, b) => b.time - a.time);
  return past[0]?.match ?? pair[0];
}

export function normalizeTeamName(name: string): string {
  return name.replace(/^\((H|A)\)\s*/i, "").trim().toLowerCase();
}

/**
 * Schedule lists home first, away second. LMS match detail teamOne/teamTwo
 * is not always in that order, so resolve IDs from the schedule names.
 */
export function resolveHomeAwayFromSchedule(args: {
  scheduleHome: string;
  scheduleAway: string;
  teamOneId: string;
  teamOneName: string;
  teamTwoId: string;
  teamTwoName: string;
}): {
  homeTeamId: string;
  homeTeamName: string;
  awayTeamId: string;
  awayTeamName: string;
} {
  const homeName = normalizeTeamName(args.scheduleHome);
  const awayName = normalizeTeamName(args.scheduleAway);
  const oneName = normalizeTeamName(args.teamOneName);
  const twoName = normalizeTeamName(args.teamTwoName);

  const one = {
    id: args.teamOneId,
    name: args.teamOneName.trim(),
  };
  const two = {
    id: args.teamTwoId,
    name: args.teamTwoName.trim(),
  };

  if (homeName && homeName === oneName) {
    return {
      homeTeamId: one.id,
      homeTeamName: one.name,
      awayTeamId: two.id,
      awayTeamName: two.name,
    };
  }
  if (homeName && homeName === twoName) {
    return {
      homeTeamId: two.id,
      homeTeamName: two.name,
      awayTeamId: one.id,
      awayTeamName: one.name,
    };
  }
  if (awayName && awayName === oneName) {
    return {
      homeTeamId: two.id,
      homeTeamName: two.name,
      awayTeamId: one.id,
      awayTeamName: one.name,
    };
  }
  if (awayName && awayName === twoName) {
    return {
      homeTeamId: one.id,
      homeTeamName: one.name,
      awayTeamId: two.id,
      awayTeamName: two.name,
    };
  }

  // Last resort: keep schedule label order, map IDs by best effort.
  return {
    homeTeamId: one.id,
    homeTeamName: one.name,
    awayTeamId: two.id,
    awayTeamName: two.name,
  };
}
