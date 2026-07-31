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

export function normalizeTeamName(name: string): string {
  return name.replace(/^\((H|A)\)\s*/i, "").trim().toLowerCase();
}
