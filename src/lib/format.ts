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

/** `Tuesday 3 November` for a `YYYY-MM-DD` calendar date. */
export function formatLocalDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  return formatDayLong(new Date(Date.UTC(year, month - 1, day, 12)), "UTC");
}

/** `+27821234567` → `082 123 4567`. Non-South-African numbers are shown as stored. */
export function formatPhone(e164: string): string {
  const match = /^\+27(\d{2})(\d{3})(\d{4})$/.exec(e164);
  return match ? `0${match[1]} ${match[2]} ${match[3]}` : e164;
}
