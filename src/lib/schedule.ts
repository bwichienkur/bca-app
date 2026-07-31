/** Parse LMS schedule date strings like `8/3/2026` into a local calendar day. */
export function parseScheduleDate(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed || /^tbd$/i.test(trimmed)) return null;

  const mdy = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) {
    return new Date(Number(mdy[3]), Number(mdy[1]) - 1, Number(mdy[2]));
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

/**
 * Match day is upcoming through the calendar day of the match.
 * A match on 8/3/2026 stays upcoming until 8/4/2026.
 * Unparsed / TBD dates are treated as upcoming.
 */
export function isUpcomingScheduleDate(
  value: string,
  today: Date = new Date(),
): boolean {
  const date = parseScheduleDate(value);
  if (!date) return true;

  const todayStart = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  return date.getTime() >= todayStart.getTime();
}
