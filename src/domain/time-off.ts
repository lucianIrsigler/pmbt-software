import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import { formatTstzRange } from "@/db/range";
import { timeOff } from "@/db/schema";
import type { ClockOptions, Queryable } from "./availability";
import { InvalidTimeOffError, NotFoundError } from "./errors";
import { addTimeOffSchema, idSchema, type AddTimeOffInput } from "./schemas";
import { localDayRange, timeToMinutes, zonedInstant, type LocalDate, type TimeRange } from "./time";

/** Blocked time ("Away"): no bookings can be made in it. Existing bookings are kept. */

export interface TimeOffBlock {
  id: string;
  during: TimeRange;
  reason: string | null;
}

/** What a time-off request covers: a whole day, or `startTime` to `endTime` that day. */
export type TimeOffSpan =
  | { kind: "day"; date: LocalDate }
  | { kind: "times"; date: LocalDate; startTime: string; endTime: string };

/** The instants a time-off request covers, in the business time zone. */
export function timeOffRange(request: TimeOffSpan, tz: string): TimeRange {
  if (request.kind === "day") return localDayRange(request.date, tz);
  return {
    start: zonedInstant(request.date, timeToMinutes(request.startTime), tz),
    end: zonedInstant(request.date, timeToMinutes(request.endTime), tz),
  };
}

/** Blocks a whole day or part of one. Returns the new block's id. */
export async function addTimeOff(
  db: Database,
  rawInput: AddTimeOffInput,
  { tz, now = new Date() }: ClockOptions,
): Promise<string> {
  const request = addTimeOffSchema.parse(rawInput);
  const during = timeOffRange(request, tz);
  if (during.end.getTime() <= now.getTime()) {
    throw new InvalidTimeOffError("That time has already passed.");
  }
  const [row] = await db
    .insert(timeOff)
    .values({ during, reason: request.reason ?? null })
    .returning({ id: timeOff.id });
  if (!row) throw new Error("time_off insert returned no row");
  return row.id;
}

/**
 * Removes a block so that time can be booked again. The row is kept as a record
 * (`removed_at` is set) and is ignored everywhere from then on.
 */
export async function removeTimeOff(
  db: Database,
  rawId: string,
  now: Date = new Date(),
): Promise<void> {
  const id = idSchema.parse(rawId);
  const removed = await db
    .update(timeOff)
    .set({ removedAt: now })
    .where(and(eq(timeOff.id, id), isNull(timeOff.removedAt)))
    .returning({ id: timeOff.id });
  if (removed.length === 0) throw new NotFoundError("time off");
}

/** Blocks the owner hasn't removed. */
const active = isNull(timeOff.removedAt);

const columns = { id: timeOff.id, during: timeOff.during, reason: timeOff.reason };

/** An active (not removed) block, or null. */
export async function getTimeOff(db: Queryable, rawId: string): Promise<TimeOffBlock | null> {
  const id = idSchema.safeParse(rawId);
  if (!id.success) return null;
  const [row] = await db
    .select(columns)
    .from(timeOff)
    .where(and(eq(timeOff.id, id.data), active));
  return row ?? null;
}

/** Blocks that haven't ended yet, soonest first. */
export async function listUpcomingTimeOff(db: Queryable, now: Date): Promise<TimeOffBlock[]> {
  return db
    .select(columns)
    .from(timeOff)
    .where(and(active, sql`upper(${timeOff.during}) > ${now.toISOString()}::timestamptz`))
    .orderBy(asc(sql`lower(${timeOff.during})`));
}

/** Blocks overlapping `range`, soonest first. */
export async function listTimeOffDuring(db: Queryable, range: TimeRange): Promise<TimeOffBlock[]> {
  return db
    .select(columns)
    .from(timeOff)
    .where(and(active, sql`${timeOff.during} && ${formatTstzRange(range)}::tstzrange`))
    .orderBy(asc(sql`lower(${timeOff.during})`));
}
