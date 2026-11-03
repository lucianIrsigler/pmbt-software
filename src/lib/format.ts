import { localDateOf, minutesOfDay, type TimeRange } from "@/domain/time";

/** Display helpers. Every date/time is shown in the business time zone, never the viewer's. */

/** ZAR cents to `R450` or `R450.50`. */
export function formatPrice(cents: number): string {
  const rands = Math.floor(Math.abs(cents) / 100);
  const rest = Math.abs(cents) % 100;
  const sign = cents < 0 ? "-" : "";
  const whole = rands.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${sign}R${whole}${rest ? `.${rest.toString().padStart(2, "0")}` : ""}`;
}

/** `30 min`, `1 hour`, `1 hour 30 min`, `2 hours`. */
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const h = hours === 0 ? "" : hours === 1 ? "1 hour" : `${hours} hours`;
  const m = mins === 0 ? "" : `${mins} min`;
  return [h, m].filter(Boolean).join(" ") || "0 min";
}

/** `09:30` (24-hour, as commonly used in South Africa). */
export function formatTime(instant: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(instant);
}

/** `Tuesday 3 November` */
export function formatDayLong(instant: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(instant);
}

/** `Tuesday 3 November 2026 at 09:30` */
export function formatDateTime(instant: Date, tz: string): string {
  const year = new Intl.DateTimeFormat("en-GB", { timeZone: tz, year: "numeric" }).format(instant);
  return `${formatDayLong(instant, tz)} ${year} at ${formatTime(instant, tz)}`;
}

/** `November 2026` for a `YYYY-MM` month. */
export function formatMonth(month: string): string {
  const [year, mon] = month.split("-").map(Number) as [number, number];
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(year, mon - 1, 1)));
}

/**
 * Midday UTC on a `YYYY-MM-DD` calendar date: formatting it in UTC always shows that
 * date, whatever the server's time zone.
 */
function utcNoon(date: string): Date {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day, 12));
}

/** `Tuesday 3 November` for a `YYYY-MM-DD` calendar date. */
export function formatLocalDate(date: string): string {
  return formatDayLong(utcNoon(date), "UTC");
}

/** `+27821234567` → `082 123 4567`. Non-South-African numbers are shown as stored. */
export function formatPhone(e164: string): string {
  const match = /^\+27(\d{2})(\d{3})(\d{4})$/.exec(e164);
  return match ? `0${match[1]} ${match[2]} ${match[3]}` : e164;
}

/** `Mon` for a `YYYY-MM-DD` calendar date. */
export function formatWeekdayShort(date: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short" }).format(
    utcNoon(date),
  );
}

/** `3 November` for a `YYYY-MM-DD` calendar date. */
export function formatDayMonth(date: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
  }).format(utcNoon(date));
}

/**
 * A blocked time, in plain words:
 * `Tuesday 3 November, whole day`, `Tuesday 3 November to Thursday 5 November`,
 * `Tuesday 3 November, 13:00 – 15:30`.
 */
export function formatTimeOffRange(range: TimeRange, tz: string): string {
  const startsAtMidnight = minutesOfDay(range.start, tz) === 0;
  const endsAtMidnight = minutesOfDay(range.end, tz) === 0;
  const firstDay = localDateOf(range.start, tz);
  // A range ending at midnight belongs to the day before.
  const lastDay = localDateOf(new Date(range.end.getTime() - 1), tz);

  if (startsAtMidnight && endsAtMidnight) {
    return firstDay === lastDay
      ? `${formatLocalDate(firstDay)}, whole day`
      : `${formatLocalDate(firstDay)} to ${formatLocalDate(lastDay)}`;
  }
  if (firstDay === lastDay) {
    const end = endsAtMidnight ? "24:00" : formatTime(range.end, tz);
    return `${formatLocalDate(firstDay)}, ${formatTime(range.start, tz)} – ${end}`;
  }
  return `${formatDayLong(range.start, tz)} ${formatTime(range.start, tz)} to ${formatDayLong(range.end, tz)} ${formatTime(range.end, tz)}`;
}
