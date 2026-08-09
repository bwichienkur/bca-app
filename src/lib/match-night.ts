import { normalizeTeamName } from "@/lib/matchups";
import type { ScheduleDay } from "@/lib/types";

/** Local calendar day YYYY-MM-DD. */
export function localDayKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Normalize schedule / match date strings to a local day key. */
export function dayKeyFromValue(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    const slice = trimmed.slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(slice) ? slice : null;
  }
  return localDayKey(parsed);
}

/**
 * True when the division schedule has a match today.
 * When `teamName` is set, only that team's matches count (captain night).
 */
export function scheduleHasMatchTonight(
  schedule: ScheduleDay[] | null | undefined,
  teamName?: string | null,
): boolean {
  if (!schedule?.length) return false;
  const tonight = localDayKey();
  const wantTeam = teamName?.trim()
    ? normalizeTeamName(teamName)
    : null;

  for (const day of schedule) {
    if (dayKeyFromValue(day.date) !== tonight) continue;
    if (!wantTeam) {
      if (day.matches.length > 0) return true;
      continue;
    }
    for (const match of day.matches) {
      if (
        normalizeTeamName(match.home) === wantTeam ||
        normalizeTeamName(match.away) === wantTeam
      ) {
        return true;
      }
    }
  }
  return false;
}
