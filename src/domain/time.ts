import { TZDate } from "@date-fns/tz";
import { addDays, format } from "date-fns";
import type { TimeRange } from "@/db/range";

export type { TimeRange } from "@/db/range";

/** A calendar date in the business time zone, `YYYY-MM-DD`. */
export type LocalDate = string;

const LOCAL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_TIME = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;

function parseLocalDate(date: LocalDate): { year: number; month: number; day: number } {
  const match = LOCAL_DATE.exec(date);
  if (!match) throw new RangeError(`Invalid date "${date}", expected YYYY-MM-DD`);
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    throw new RangeError(`Invalid date "${date}"`);
  }
  return { year, month, day };
}

export function isLocalDate(value: string): boolean {
  try {
    parseLocalDate(value);
    return true;
  } catch {
    return false;
  }
}

/** `HH:MM` or `HH:MM:SS` (as Postgres returns `time`) to minutes after midnight. */
export function timeToMinutes(time: string): number {
  const match = LOCAL_TIME.exec(time);
  if (!match) throw new RangeError(`Invalid time "${time}", expected HH:MM`);
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 24 || minutes > 59 || (hours === 24 && minutes > 0)) {
    throw new RangeError(`Invalid time "${time}"`);
  }
  return hours * 60 + minutes;
}

/** Day of week for a calendar date: 0 = Sunday … 6 = Saturday. */
export function weekdayOf(date: LocalDate): number {
  const { year, month, day } = parseLocalDate(date);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** The instant at `minutes` after local midnight on `date` in `tz`. */
export function zonedInstant(date: LocalDate, minutes: number, tz: string): Date {
  const { year, month, day } = parseLocalDate(date);
  const local = new TZDate(year, month - 1, day, 0, minutes, tz);
  return new Date(local.getTime());
}

/** The calendar date of `instant` in `tz`. */
export function localDateOf(instant: Date, tz: string): LocalDate {
  return format(new TZDate(instant.getTime(), tz), "yyyy-MM-dd");
}

/** Calendar arithmetic on local dates (time-zone independent). */
export function addLocalDays(date: LocalDate, days: number): LocalDate {
  const { year, month, day } = parseLocalDate(date);
  return format(addDays(new Date(year, month - 1, day), days), "yyyy-MM-dd");
}

/** `[local midnight, next local midnight)` for `date` in `tz`. */
export function localDayRange(date: LocalDate, tz: string): TimeRange {
  return { start: zonedInstant(date, 0, tz), end: zonedInstant(addLocalDays(date, 1), 0, tz) };
}

/** All dates of a month (`YYYY-MM`), in order. */
export function daysInMonth(month: string): LocalDate[] {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) throw new RangeError(`Invalid month "${month}", expected YYYY-MM`);
  const first = `${month}-01`;
  parseLocalDate(first);
  const days: LocalDate[] = [];
  for (let date = first; date.startsWith(month); date = addLocalDays(date, 1)) days.push(date);
  return days;
}

/** Half-open overlap test: `[a.start, a.end)` and `[b.start, b.end)` share an instant. */
export function rangesOverlap(a: TimeRange, b: TimeRange): boolean {
  return a.start.getTime() < b.end.getTime() && b.start.getTime() < a.end.getTime();
}

/** Minutes since local midnight of `instant`'s own calendar date in `tz`. */
export function minutesOfDay(instant: Date, tz: string): number {
  const midnight = zonedInstant(localDateOf(instant, tz), 0, tz);
  return Math.round((instant.getTime() - midnight.getTime()) / 60_000);
}

export function addMinutesTo(instant: Date, minutes: number): Date {
  return new Date(instant.getTime() + minutes * 60_000);
}

/** `YYYY-MM` of a local date. */
export function monthOf(date: LocalDate): string {
  parseLocalDate(date);
  return date.slice(0, 7);
}

/** Adds `n` months to a `YYYY-MM` month. */
export function addMonthsTo(month: string, n: number): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) throw new RangeError(`Invalid month "${month}", expected YYYY-MM`);
  const index = Number(match[1]) * 12 + (Number(match[2]) - 1) + n;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}
