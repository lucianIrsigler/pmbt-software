/**
 * Long-running scheduler for the production "jobs" container: sends the day-before
 * reminders every day at REMINDER_TIME (default 17:00) in the business time zone.
 * In-house instead of cron, so it runs as a normal (non-root) user.
 *
 * If it starts after today's run time (e.g. after a deploy or a restart), it runs once
 * straight away; reminders are never sent twice, so catching up is always safe.
 * Usage: pnpm jobs:run
 */
import { timeOfDaySchema } from "@/domain/schemas";
import { getEnv } from "@/lib/env";
import { runReminderJob } from "@/lib/reminder-job";
import { isPastTodaysRun, nextDailyRun } from "@/lib/schedule";

const runAt = timeOfDaySchema.parse(process.env.REMINDER_TIME ?? "17:00");
const tz = getEnv().BUSINESS_TZ;

function log(message: string): void {
  console.info(JSON.stringify({ level: "info", context: "jobs", message, at: new Date() }));
}

async function sendReminders(): Promise<void> {
  try {
    const run = await runReminderJob();
    log(`reminders: ${run.sent} sent, ${run.failed} failed, ${run.skipped} skipped`);
  } catch (error) {
    // Never crash the scheduler; the next run (or a restart) tries again.
    console.error(
      JSON.stringify({
        level: "error",
        context: "jobs.reminders",
        error: error instanceof Error ? error.name : typeof error,
      }),
    );
  }
}

function scheduleNext(): void {
  const next = nextDailyRun(new Date(), runAt, tz);
  log(`next reminders run at ${next.toISOString()}`);
  setTimeout(() => {
    void sendReminders().then(scheduleNext);
  }, next.getTime() - Date.now());
}

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    log(`stopping (${signal})`);
    process.exit(0);
  });
}

log(`started; reminders daily at ${runAt} (${tz})`);
if (isPastTodaysRun(new Date(), runAt, tz)) {
  void sendReminders().then(scheduleNext);
} else {
  scheduleNext();
}
