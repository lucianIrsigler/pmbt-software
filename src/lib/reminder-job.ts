import "server-only";
import { createDb } from "@/db/client";
import { sendDueReminders, type ReminderRun } from "@/domain/reminders";
import { sendBookingEmail } from "./booking-emails";
import { getEnv } from "./env";

/** One run of the day-before reminders, with its own short-lived database connection. */
export async function runReminderJob(now: Date = new Date()): Promise<ReminderRun> {
  const env = getEnv();
  const db = createDb(env.DATABASE_URL, { max: 1 });
  try {
    return await sendDueReminders(db, { tz: env.BUSINESS_TZ, now }, (id) =>
      sendBookingEmail("reminder", id, { db }),
    );
  } finally {
    await db.$client.end();
  }
}
