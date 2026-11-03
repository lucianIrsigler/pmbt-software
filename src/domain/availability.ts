import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { z } from "zod";
import type { Database } from "@/db/client";
import { formatTstzRange } from "@/db/range";
import { appointment, service, settings, timeOff, workingHours } from "@/db/schema";
import { NotFoundError, SettingsMissingError } from "./errors";
import { datesQuerySchema, slotsQuerySchema } from "./schemas";
import {
  BLOCKING_STATUSES,
  getAvailableDates,
  getAvailableSlots,
  isSlotAvailable,
  type SlotQuery,
} from "./slots";
import { daysInMonth, localDateOf, localDayRange, type LocalDate, type TimeRange } from "./time";

/** Anything we can run a select on: the db or a transaction. */
export type Queryable = Pick<Database, "select">;

export type Settings = typeof settings.$inferSelect;
export type Service = typeof service.$inferSelect;

export async function loadSettings(db: Queryable): Promise<Settings> {
  const [row] = await db.select().from(settings).where(eq(settings.id, 1));
  if (!row) throw new SettingsMissingError();
  return row;
}

export async function loadActiveService(db: Queryable, serviceId: string): Promise<Service> {
  const [row] = await db.select().from(service).where(eq(service.id, serviceId));
  if (!row || !row.active) throw new NotFoundError("service");
  return row;
}

/** Everything `getAvailableSlots` needs except the date, service, `now` and tz. */
export async function loadAvailability(
  db: Queryable,
  range: TimeRange,
): Promise<Pick<SlotQuery, "workingHours" | "timeOff" | "appointments" | "settings">> {
  const overlaps = sql`${formatTstzRange(range)}::tstzrange`;
  const [hours, away, booked, config] = await Promise.all([
    db.select().from(workingHours).orderBy(asc(workingHours.weekday)),
    db
      .select({ during: timeOff.during })
      .from(timeOff)
      .where(sql`${timeOff.during} && ${overlaps}`),
    db
      .select({ during: appointment.during })
      .from(appointment)
      .where(
        and(
          inArray(appointment.status, [...BLOCKING_STATUSES]),
          sql`${appointment.during} && ${overlaps}`,
        ),
      ),
    loadSettings(db),
  ]);
  return {
    workingHours: hours,
    timeOff: away.map((row) => row.during),
    appointments: booked,
    settings: config,
  };
}

/** All working-hours blocks, by weekday. */
export async function loadWorkingHours(db: Queryable): Promise<SlotQuery["workingHours"]> {
  return db
    .select({
      weekday: workingHours.weekday,
      startTime: workingHours.startTime,
      endTime: workingHours.endTime,
    })
    .from(workingHours)
    .orderBy(asc(workingHours.weekday), asc(workingHours.startTime));
}

export interface ClockOptions {
  tz: string;
  now?: Date;
}

/** Available start times for a service on a date (business tz). */
export async function findSlots(
  db: Queryable,
  input: z.input<typeof slotsQuerySchema>,
  { tz, now = new Date() }: ClockOptions,
): Promise<Date[]> {
  const { serviceId, date } = slotsQuerySchema.parse(input);
  const svc = await loadActiveService(db, serviceId);
  const data = await loadAvailability(db, localDayRange(date, tz));
  return getAvailableSlots({ ...data, date, service: svc, now, tz });
}

/** Dates in a month (`YYYY-MM`) with at least one slot for a service. */
export async function findDates(
  db: Queryable,
  input: z.input<typeof datesQuerySchema>,
  { tz, now = new Date() }: ClockOptions,
): Promise<LocalDate[]> {
  const { serviceId, month } = datesQuerySchema.parse(input);
  const svc = await loadActiveService(db, serviceId);
  const days = daysInMonth(month);
  const first = days[0] ?? `${month}-01`;
  const last = days.at(-1) ?? first;
  const range = { start: localDayRange(first, tz).start, end: localDayRange(last, tz).end };
  const data = await loadAvailability(db, range);
  return getAvailableDates(month, { ...data, service: svc, now, tz });
}

/**
 * Owner bookings: the active services of `forKind` that fit at `start` without clashing
 * with working hours, time off or other bookings. Short notice and far-ahead dates are
 * allowed (see `createBooking`'s `ignoreMinNotice` / `ignoreHorizon`).
 */
export async function servicesBookableAt(
  db: Queryable,
  start: Date,
  forKind: Service["forKind"],
  { tz, now = new Date() }: ClockOptions,
): Promise<Service[]> {
  const [services, data] = await Promise.all([
    db
      .select()
      .from(service)
      .where(and(eq(service.active, true), eq(service.forKind, forKind)))
      .orderBy(asc(service.sortOrder), asc(service.name)),
    loadAvailability(db, localDayRange(localDateOf(start, tz), tz)),
  ]);
  return services.filter((svc) =>
    isSlotAvailable(start, {
      ...data,
      service: svc,
      now,
      tz,
      ignoreMinNotice: true,
      ignoreHorizon: true,
    }),
  );
}
