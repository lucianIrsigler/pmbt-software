import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "@/db/client";
import { PG_ERROR, pgErrorCode } from "@/db/errors";
import { appointment } from "@/db/schema";
import { InvalidStatusError, NotFoundError, SlotTakenError } from "./errors";
import {
  idSchema,
  updateAppointmentNotesSchema,
  type UpdateAppointmentNotesInput,
} from "./schemas";

/** The owner's changes to a booking: Done, Didn't come, undo, cancel and visit notes. */

type AppointmentStatus = (typeof appointment.$inferSelect)["status"];

/**
 * Moves an appointment from one of `from` to `to`, atomically.
 * Throws NotFoundError / InvalidStatusError if it can't.
 */
export async function setStatus(
  db: Database,
  rawId: string,
  from: AppointmentStatus[],
  to: AppointmentStatus,
  action: string,
  now: Date = new Date(),
): Promise<void> {
  const id = idSchema.parse(rawId);
  const [updated] = await db
    .update(appointment)
    .set({ status: to, cancelledAt: to === "cancelled" ? now : null })
    .where(and(eq(appointment.id, id), inArray(appointment.status, from)))
    .returning({ id: appointment.id });
  if (updated) return;

  const [current] = await db
    .select({ status: appointment.status })
    .from(appointment)
    .where(eq(appointment.id, id));
  if (!current) throw new NotFoundError("appointment");
  throw new InvalidStatusError(current.status, action);
}

export async function markDone(db: Database, id: string): Promise<void> {
  await setStatus(db, id, ["booked"], "done", "marked done");
}

export async function markNoShow(db: Database, id: string): Promise<void> {
  await setStatus(db, id, ["booked"], "no_show", "marked as didn't come");
}

/**
 * Undo "Done" or "Didn't come": back to booked. If someone has since booked an
 * overlapping time (possible once a "didn't come" slot was freed), raises `SlotTakenError`.
 */
export async function undoStatus(db: Database, id: string): Promise<void> {
  try {
    await setStatus(db, id, ["done", "no_show"], "booked", "undone");
  } catch (error) {
    if (pgErrorCode(error) === PG_ERROR.exclusionViolation) throw new SlotTakenError();
    throw error;
  }
}

/** Owner cancels: no cutoff applies. */
export async function cancelByOwner(
  db: Database,
  id: string,
  { now = new Date() }: { now?: Date } = {},
): Promise<void> {
  await setStatus(db, id, ["booked"], "cancelled", "cancelled", now);
}

/** The owner's notes for one visit (autosaved from the appointment page). */
export async function updateAppointmentNotes(
  db: Database,
  rawInput: UpdateAppointmentNotesInput,
): Promise<void> {
  const input = updateAppointmentNotesSchema.parse(rawInput);
  const [row] = await db
    .update(appointment)
    .set({ notes: input.notes })
    .where(eq(appointment.id, input.appointmentId))
    .returning({ id: appointment.id });
  if (!row) throw new NotFoundError("appointment");
}
