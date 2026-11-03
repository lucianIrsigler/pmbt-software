/**
 * Dates for e2e tests. The tests run against the real clock, so they pick dates
 * relative to today, in the business time zone.
 */

export const TZ = "Africa/Johannesburg";

/** Today's date in the business time zone, `YYYY-MM-DD`. */
export function today(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

/** The first date at least `minDays` after today that falls on `weekday` (0 = Sunday). */
export function nextWeekday(minDays: number, weekday: number): string {
  const [y, m, d] = today().split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d + minDays));
  while (date.getUTCDay() !== weekday) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

/** `Thursday 19 November`, as the app writes dates. */
export function longDate(date: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(`${date}T12:00:00Z`));
}
