/**
 * Emails tomorrow's clients a reminder. Safe to run more than once a day: each
 * appointment is reminded at most once. Meant to run daily (e.g. 17:00) from cron.
 * Usage: pnpm reminders:send
 */
import { createDb } from "@/db/client";
import { sendDueReminders } from "@/domain/reminders";
import { sendBookingEmail } from "@/lib/booking-emails";
import { getEnv } from "@/lib/env";

async function main(): Promise<void> {
  const env = getEnv();
  const db = createDb(env.DATABASE_URL, { max: 1 });
  try {
    const run = await sendDueReminders(db, { tz: env.BUSINESS_TZ, now: new Date() }, (id) =>
      sendBookingEmail("reminder", id, { db }),
    );
    // Counts only: no names or addresses in logs.
    console.info(`Reminders: ${run.sent} sent, ${run.failed} failed, ${run.skipped} skipped.`);
    if (run.failed > 0) process.exitCode = 1;
  } finally {
    await db.$client.end();
  }
}

main().catch((error: unknown) => {
  console.error("Sending reminders failed:", error instanceof Error ? error.name : error);
  process.exitCode = 1;
});
