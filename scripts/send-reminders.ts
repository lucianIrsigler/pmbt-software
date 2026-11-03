/**
 * Emails tomorrow's clients a reminder, once. Safe to run more than once a day: each
 * appointment is reminded at most once. In production `pnpm jobs:run` runs this daily.
 * Usage: pnpm reminders:send
 */
import { runReminderJob } from "@/lib/reminder-job";

runReminderJob()
  .then((run) => {
    // Counts only: no names or addresses in logs.
    console.info(`Reminders: ${run.sent} sent, ${run.failed} failed, ${run.skipped} skipped.`);
    if (run.failed > 0) process.exitCode = 1;
  })
  .catch((error: unknown) => {
    console.error("Sending reminders failed:", error instanceof Error ? error.name : error);
    process.exitCode = 1;
  });
