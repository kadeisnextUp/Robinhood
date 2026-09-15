const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// A period needs at least this long left to be worth opening; with less, the next
// week's period is created instead. This is also what makes the Monday cron, which
// fires at Sunday 23:55 ET, schedule the week starting five minutes later.
const MIN_OPEN_MS = 10 * MINUTE;

// returns true if `date` falls within US Eastern Daylight Time (UTC-4).
// DST starts: 2nd Sunday of March at 02:00 EST (07:00 UTC)
// DST ends:   1st Sunday of November at 02:00 EDT (06:00 UTC)
export function isEasternDST(date: Date): boolean {
  const y = date.getUTCFullYear();
  const mar1Day = new Date(Date.UTC(y, 2, 1)).getUTCDay();
  const firstSunMar = mar1Day === 0 ? 1 : 8 - mar1Day;
  const dstStart = new Date(Date.UTC(y, 2, firstSunMar + 7, 7, 0, 0));
  const nov1Day = new Date(Date.UTC(y, 10, 1)).getUTCDay();
  const firstSunNov = nov1Day === 0 ? 1 : 8 - nov1Day;
  const dstEnd = new Date(Date.UTC(y, 10, firstSunNov, 6, 0, 0));
  return date >= dstStart && date < dstEnd;
}

function easternOffsetHours(date: Date): number {
  return isEasternDST(date) ? 4 : 5;
}

// Monday 00:00 ET to Sunday 23:55 ET of the Eastern week containing `at`.
function easternWeek(at: Date): { start: Date; end: Date } {
  // Eastern wall-clock time held in a Date, so the getUTC* readers return it.
  const eastern = new Date(at.getTime() - easternOffsetHours(at) * HOUR);
  const daysSinceMonday = (eastern.getUTCDay() + 6) % 7;
  const monday = Date.UTC(eastern.getUTCFullYear(), eastern.getUTCMonth(), eastern.getUTCDate() - daysSinceMonday);

  // Clocks change at 02:00 on a Sunday, so noon on each boundary's own day gives
  // that boundary's offset.
  const start = new Date(monday + easternOffsetHours(new Date(monday + 12 * HOUR)) * HOUR);
  const sunday = monday + 6 * DAY;
  const end = new Date(sunday + 23 * HOUR + 55 * MINUTE + easternOffsetHours(new Date(sunday + 12 * HOUR)) * HOUR);
  return { start, end };
}

// The period to open at `now`: it closes on the Sunday 23:55 ET boundary and opens
// at Monday 00:00 ET, or immediately if that Monday has already passed.
//
// This deliberately ignores whether the run just closed a period. The old math
// assumed a close only ever happens on the cron's Monday and otherwise dated the
// new period to the following Monday, so any run on another day (a manual close,
// or a retry after a missed Monday) opened a round up to six days in the future.
export function nextPeriodWindow(now: Date): { start: Date; end: Date } {
  let week = easternWeek(now);
  if (week.end.getTime() - now.getTime() < MIN_OPEN_MS) {
    week = easternWeek(new Date(week.end.getTime() + MIN_OPEN_MS));
  }
  const start = week.start.getTime() > now.getTime() ? week.start : new Date(now);
  return { start, end: week.end };
}
