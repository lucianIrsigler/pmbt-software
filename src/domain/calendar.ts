import type { SlotWorkingHours } from "./slots";
import {
  addLocalDays,
  addMinutesTo,
  localDayRange,
  rangesOverlap,
  timeToMinutes,
  weekdayOf,
  zonedInstant,
  type LocalDate,
  type TimeRange,
} from "./time";

/**
 * Pure layout maths for the owner's calendar (week and day views). Positions are
 * expressed in minutes after local midnight, so the UI can turn them into pixels.
 */

/** The Monday on or before `date`. */
export function weekStart(date: LocalDate): LocalDate {
  const offset = (weekdayOf(date) + 6) % 7; // Monday = 0 … Sunday = 6
  return addLocalDays(date, -offset);
}

/** Monday to Sunday of the week containing `date`. */
export function weekDates(date: LocalDate): LocalDate[] {
  const monday = weekStart(date);
  return Array.from({ length: 7 }, (_, i) => addLocalDays(monday, i));
}

/** The visible part of each day, in minutes after local midnight: `[from, to)`. */
export interface GridWindow {
  from: number;
  to: number;
}

interface HasRange {
  during: TimeRange;
}

/** `range` clipped to `date`, as minutes after that date's local midnight; null if outside. */
function minutesWithin(range: TimeRange, date: LocalDate, tz: string): GridWindow | null {
  const day = localDayRange(date, tz);
  const start = Math.max(range.start.getTime(), day.start.getTime());
  const end = Math.min(range.end.getTime(), day.end.getTime());
  if (end <= start) return null;
  return {
    from: Math.round((start - day.start.getTime()) / 60_000),
    to: Math.round((end - day.start.getTime()) / 60_000),
  };
}

/**
 * The hours to show for `dates`: from the earliest opening to the latest closing, widened
 * to fit any appointment outside working hours, rounded out to whole hours. Time off
 * doesn't widen it (a whole day away shouldn't show midnight to midnight).
 * Null when every day is closed and empty.
 */
export function gridWindow(
  dates: readonly LocalDate[],
  workingHours: readonly SlotWorkingHours[],
  appointments: readonly HasRange[],
  tz: string,
): GridWindow | null {
  let from = Infinity;
  let to = -Infinity;
  for (const date of dates) {
    const weekday = weekdayOf(date);
    for (const block of workingHours) {
      if (block.weekday !== weekday) continue;
      from = Math.min(from, timeToMinutes(block.startTime));
      to = Math.max(to, timeToMinutes(block.endTime));
    }
    for (const a of appointments) {
      const m = minutesWithin(a.during, date, tz);
      if (!m) continue;
      from = Math.min(from, m.from);
      to = Math.max(to, m.to);
    }
  }
  if (from >= to) return null;
  return { from: Math.floor(from / 60) * 60, to: Math.min(24 * 60, Math.ceil(to / 60) * 60) };
}

/** An item placed in a day column: `top` and `height` in minutes, relative to the window. */
export interface Placed<T> {
  item: T;
  top: number;
  height: number;
}

/** An empty, bookable cell. */
export interface FreeCell {
  start: Date;
  top: number;
  height: number;
}

export interface DayColumn<A extends HasRange, O extends HasRange> {
  date: LocalDate;
  /** Whether the business has working hours on this weekday. */
  open: boolean;
  appointments: Placed<A>[];
  away: Placed<O>[];
  free: FreeCell[];
}

export interface DayColumnInput<A extends HasRange, O extends HasRange> {
  date: LocalDate;
  window: GridWindow;
  workingHours: readonly SlotWorkingHours[];
  /** Appointments that occupy time (booked or done); `during` includes the buffer. */
  appointments: readonly A[];
  timeOff: readonly O[];
  /** Cell size, usually `slot_step_min`. */
  stepMin: number;
  now: Date;
  tz: string;
}

function place<T extends HasRange>(
  items: readonly T[],
  date: LocalDate,
  window: GridWindow,
  tz: string,
): Placed<T>[] {
  const placed: Placed<T>[] = [];
  for (const item of items) {
    const m = minutesWithin(item.during, date, tz);
    if (!m) continue;
    const top = Math.max(m.from, window.from);
    const bottom = Math.min(m.to, window.to);
    if (bottom > top) placed.push({ item, top: top - window.from, height: bottom - top });
  }
  return placed.sort((a, b) => a.top - b.top);
}

/**
 * Lays out one day: where its appointments and time off go, and which cells are free.
 * A cell `[start, start + step)` is free when it lies inside working hours, starts in the
 * future, and overlaps no appointment or time off. Cells start on `step` boundaries
 * counted from local midnight, like bookable slots do.
 */
export function buildDayColumn<A extends HasRange, O extends HasRange>(
  input: DayColumnInput<A, O>,
): DayColumn<A, O> {
  const { date, window, stepMin, tz } = input;
  const weekday = weekdayOf(date);
  const hours = input.workingHours.filter((h) => h.weekday === weekday);
  const busy = [...input.appointments, ...input.timeOff].map((x) => x.during);

  const free: FreeCell[] = [];
  const seen = new Set<number>();
  if (stepMin > 0) {
    for (const block of hours) {
      const open = Math.max(timeToMinutes(block.startTime), window.from);
      const close = Math.min(timeToMinutes(block.endTime), window.to);
      for (let m = Math.ceil(open / stepMin) * stepMin; m + stepMin <= close; m += stepMin) {
        if (seen.has(m)) continue;
        seen.add(m);
        const start = zonedInstant(date, m, tz);
        const cell = { start, end: addMinutesTo(start, stepMin) };
        if (start.getTime() < input.now.getTime()) continue;
        if (busy.some((b) => rangesOverlap(cell, b))) continue;
        free.push({ start, top: m - window.from, height: stepMin });
      }
    }
  }

  return {
    date,
    open: hours.length > 0,
    appointments: place(input.appointments, date, window, tz),
    away: place(input.timeOff, date, window, tz),
    free: free.sort((a, b) => a.top - b.top),
  };
}
