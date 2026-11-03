import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import { formatTstzRange } from "@/db/range";
import { appointment, client } from "@/db/schema";
import { addLocalDays, localDateOf, localDayRange } from "./time";

/**
 * Day-before reminder emails. Each due appointment is first *claimed* (its
 * `reminder_sent_at` set) in one UPDATE, then emailed. Re-running, or two runs at
 * once, can never email anyone twice; a failed send is released so the next run retries.
 */

export interface ReminderOptions {
  tz: string;
  now: Date;
}

/**
 * Marks tomorrow's (business time zone) booked appointments whose client has an email
 * and hasn't been reminded yet. Returns their ids.
 */
export async function claimDueReminders(
  db: Database,
  { tz, now }: ReminderOptions,
): Promise<string[]> {
  const tomorrow = localDayRange(addLocalDays(localDateOf(now, tz), 1), tz);
  const rows = await db
    .update(appointment)
    .set({ reminderSentAt: now })
    .where(
      and(
        eq(appointment.status, "booked"),
        isNull(appointment.reminderSentAt),
        sql`lower(${appointment.during}) <@ ${formatTstzRange(tomorrow)}::tstzrange`,
        inArray(
          appointment.clientId,
          db.select({ id: client.id }).from(client).where(isNotNull(client.email)),
        ),
      ),
    )
    .returning({ id: appointment.id });
  return rows.map((row) => row.id);
}

/** Un-claims a reminder whose email failed, so the next run tries again. */
export async function releaseReminder(db: Database, appointmentId: string): Promise<void> {
  await db
    .update(appointment)
    .set({ reminderSentAt: null })
    .where(eq(appointment.id, appointmentId));
}

export interface ReminderRun {
  sent: number;
  failed: number;
  /** E.g. the email address was removed in the meantime. Not retried. */
  skipped: number;
}

/** Claims due reminders and sends each with `send`, releasing the ones that fail. */
export async function sendDueReminders(
  db: Database,
  options: ReminderOptions,
  send: (appointmentId: string) => Promise<"sent" | "skipped" | "failed">,
): Promise<ReminderRun> {
  const run: ReminderRun = { sent: 0, failed: 0, skipped: 0 };
  for (const id of await claimDueReminders(db, options)) {
    const outcome = await send(id);
    run[outcome] += 1;
    if (outcome === "failed") await releaseReminder(db, id);
  }
  return run;
}
