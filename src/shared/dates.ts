/**
 * Date helpers. Booking.com only exposes a calendar day for a review, never a
 * timestamp, so all period maths is done with plain `YYYY-MM-DD` dates in the
 * Australia/Sydney timezone (the properties' local timezone).
 */
export const SYDNEY_TIMEZONE = 'Australia/Sydney';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isDateString(value: unknown): value is string {
  return typeof value === 'string' && DATE_PATTERN.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

/** Convert any Date (or date string) to the calendar date in Sydney. */
export function toSydneyDate(input: Date | string = new Date()): string {
  const date = typeof input === 'string' ? new Date(input) : input;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SYDNEY_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${pick('year')}-${pick('month')}-${pick('day')}`;
}

/** Parse `YYYY-MM-DD` as a UTC midnight date; avoids local-time DST drift. */
function asUtcDate(date: string): Date {
  if (!isDateString(date)) throw new Error(`Invalid date: ${date}`);
  return new Date(`${date}T00:00:00Z`);
}

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const next = asUtcDate(date);
  next.setUTCDate(next.getUTCDate() + days);
  return toDateString(next);
}

export function daysBetween(start: string, end: string): number {
  return Math.round((asUtcDate(end).getTime() - asUtcDate(start).getTime()) / 86_400_000);
}

export function daysInclusive(start: string, end: string): number {
  return daysBetween(start, end) + 1;
}

/** Monday-based (ISO) week start for a calendar date. */
export function startOfWeek(date: string): string {
  const parsed = asUtcDate(date);
  const weekday = parsed.getUTCDay(); // Sunday = 0
  const daysSinceMonday = (weekday + 6) % 7;
  parsed.setUTCDate(parsed.getUTCDate() - daysSinceMonday);
  return toDateString(parsed);
}

export interface DateRange {
  from: string;
  /** Exclusive end date. */
  toExclusive: string;
  label: string;
}

export function weekRangeContaining(date: string): DateRange {
  const from = startOfWeek(date);
  return { from, toExclusive: addDays(from, 7), label: 'week' };
}

/**
 * Build the comparison window that immediately precedes `from` and has the
 * same number of days. This makes partial-current-week comparisons fair.
 */
export function previousRange(from: string, toInclusive: string): DateRange {
  const length = daysInclusive(from, toInclusive);
  const previousToExclusive = from;
  const previousFrom = addDays(from, -length);
  return { from: previousFrom, toExclusive: previousToExclusive, label: 'previous' };
}

/** The n most recent ISO weeks, oldest first, ending with the week of `anchor`. */
export function recentWeeks(anchor: string, count: number): DateRange[] {
  const currentStart = startOfWeek(anchor);
  const ranges: DateRange[] = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const from = addDays(currentStart, -offset * 7);
    ranges.push({ from, toExclusive: addDays(from, 7), label: 'week' });
  }
  return ranges;
}

/**
 * Booking.com renders dates such as "Reviewed: November 25, 2026" in English.
 * With `lang=en-us` fixed in the scraper this is deterministic.
 */
export function parseReviewDate(raw: string): string | null {
  const match = raw.match(/([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
  if (!match) return null;
  const months: Record<string, number> = {
    january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
    july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  };
  const month = months[match[1].toLowerCase()];
  if (!month) return null;
  const day = Number(match[2]);
  const year = Number(match[3]);
  if (day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function formatShortDate(date: string): string {
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(asUtcDate(date));
}

export function formatWeekLabel(date: string): string {
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
  }).format(asUtcDate(date));
}
