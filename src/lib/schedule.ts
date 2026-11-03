import { addLocalDays, localDateOf, timeToMinutes, zonedInstant } from "@/domain/time";

/** Daily job timing in the business time zone (used by scripts/jobs.ts). */

/** The next instant strictly after `now` at local time `hhmm` (e.g. "17:00") in `tz`. */
export function nextDailyRun(now: Date, hhmm: string, tz: string): Date {
  const minutes = timeToMinutes(hhmm);
  const today = localDateOf(now, tz);
  const todayRun = zonedInstant(today, minutes, tz);
  return todayRun.getTime() > now.getTime()
    ? todayRun
    : zonedInstant(addLocalDays(today, 1), minutes, tz);
}

/** Whether today's run time (local) has already passed: the job may have been missed. */
export function isPastTodaysRun(now: Date, hhmm: string, tz: string): boolean {
  const todayRun = zonedInstant(localDateOf(now, tz), timeToMinutes(hhmm), tz);
  return now.getTime() >= todayRun.getTime();
}
