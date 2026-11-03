import {
  addLocalDays,
  addMinutesTo,
  daysInMonth,
  localDateOf,
  rangesOverlap,
  timeToMinutes,
  weekdayOf,
  zonedInstant,
  type LocalDate,
  type TimeRange,
} from "./time";

export interface SlotService {
  durationMin: number;
  bufferMin: number;
}

export interface SlotWorkingHours {
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number;
  /** `HH:MM` or `HH:MM:SS`, local business time. */
  startTime: string;
  endTime: string;
}

/**
 * Appointment statuses that occupy their time. A visit marked done keeps its slot; a
 * cancelled or missed ("didn't come") one frees it. Mirrors the `appointment_no_overlap`
 * exclusion constraint in the database.
 */
export const BLOCKING_STATUSES = ["booked", "done"] as const;

export interface SlotAppointment {
  during: TimeRange;
  /** Only BLOCKING_STATUSES block time. Omitted means booked. */
  status?: "booked" | "done" | "no_show" | "cancelled";
}

function blocksTime(status: SlotAppointment["status"] = "booked"): boolean {
  return (BLOCKING_STATUSES as readonly string[]).includes(status);
}

export interface SlotSettings {
  minNoticeHours: number;
  maxDaysAhead: number;
  slotStepMin: number;
}

export interface SlotQuery {
  /** Calendar date in the business time zone, `YYYY-MM-DD`. */
  date: LocalDate;
  service: SlotService;
  workingHours: readonly SlotWorkingHours[];
  timeOff: readonly TimeRange[];
  appointments: readonly SlotAppointment[];
  settings: SlotSettings;
  now: Date;
  tz: string;
  /** Owner bookings may skip the minimum-notice rule. */
  ignoreMinNotice?: boolean;
  /** Owner bookings may be made beyond `maxDaysAhead` (never in the past). */
  ignoreHorizon?: boolean;
}

/** Total time an appointment blocks: the session plus its buffer. */
export function blockedMinutes(service: SlotService): number {
  return service.durationMin + service.bufferMin;
}

/** The range an appointment starting at `start` occupies (stored as `appointment.during`). */
export function appointmentRange(start: Date, service: SlotService): TimeRange {
  return { start, end: addMinutesTo(start, blockedMinutes(service)) };
}

/** Last bookable calendar date: today (business tz) + `maxDaysAhead`. */
export function lastBookableDate(now: Date, maxDaysAhead: number, tz: string): LocalDate {
  return addLocalDays(localDateOf(now, tz), maxDaysAhead);
}

function isWithinHorizon(query: SlotQuery): boolean {
  const today = localDateOf(query.now, query.tz);
  if (query.ignoreHorizon) return query.date >= today;
  const last = lastBookableDate(query.now, query.settings.maxDaysAhead, query.tz);
  return query.date >= today && query.date <= last;
}

/** Candidate starts (minutes after midnight) inside one working-hours block, on step boundaries. */
function candidateMinutes(block: SlotWorkingHours, length: number, step: number): number[] {
  const open = timeToMinutes(block.startTime);
  const close = timeToMinutes(block.endTime);
  const result: number[] = [];
  for (let m = Math.ceil(open / step) * step; m + length <= close; m += step) result.push(m);
  return result;
}

/**
 * Start times on `date` where `[start, start + duration + buffer)`:
 * - lies inside one of that weekday's working-hours blocks (business tz),
 * - doesn't overlap time off or a booked (or done) appointment,
 * - starts on a `slotStepMin` boundary (counted from local midnight),
 * - is at least `minNoticeHours` after `now` (unless `ignoreMinNotice`),
 * - falls on a date between today and today + `maxDaysAhead` (unless `ignoreHorizon`).
 *
 * Returned in ascending order without duplicates.
 */
export function getAvailableSlots(query: SlotQuery): Date[] {
  const { settings, service, tz } = query;
  if (settings.slotStepMin <= 0 || service.durationMin <= 0) return [];
  if (!isWithinHorizon(query)) return [];

  const length = blockedMinutes(service);
  const earliest = query.ignoreMinNotice
    ? query.now
    : addMinutesTo(query.now, settings.minNoticeHours * 60);
  const busy: TimeRange[] = [
    ...query.timeOff,
    ...query.appointments.filter((a) => blocksTime(a.status)).map((a) => a.during),
  ];

  const weekday = weekdayOf(query.date);
  const minutes = new Set<number>();
  for (const block of query.workingHours) {
    if (block.weekday !== weekday) continue;
    for (const m of candidateMinutes(block, length, settings.slotStepMin)) minutes.add(m);
  }

  return [...minutes]
    .sort((a, b) => a - b)
    .map((m) => zonedInstant(query.date, m, tz))
    .filter((start) => start.getTime() >= earliest.getTime())
    .filter((start) => {
      const range = { start, end: addMinutesTo(start, length) };
      return !busy.some((b) => rangesOverlap(range, b));
    });
}

/** Whether `start` is one of the available slots for its date. */
export function isSlotAvailable(start: Date, query: Omit<SlotQuery, "date">): boolean {
  const date = localDateOf(start, query.tz);
  return getAvailableSlots({ ...query, date }).some((s) => s.getTime() === start.getTime());
}

/** Dates in `month` (`YYYY-MM`, business tz) with at least one available slot, for the date picker. */
export function getAvailableDates(month: string, query: Omit<SlotQuery, "date">): LocalDate[] {
  return daysInMonth(month).filter((date) => getAvailableSlots({ ...query, date }).length > 0);
}
