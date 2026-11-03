import {
  addLocalDays,
  addMonthsTo,
  daysInMonth,
  isLocalDate,
  localDayRange,
  monthOf,
} from "./time";
import type { LocalDate, TimeRange } from "./time";

/** Date ranges for the admin dashboard and bookings table (business time zone). */

export const RANGE_PRESETS = ["this-month", "last-month", "last-3-months", "custom"] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

export interface DateRange {
  preset: RangePreset;
  /** Inclusive calendar dates, `YYYY-MM-DD`. */
  from: LocalDate;
  to: LocalDate;
}

/** Custom ranges longer than this are cut short, to keep queries quick. */
const MAX_CUSTOM_DAYS = 3 * 366;

function lastDayOf(month: string): LocalDate {
  return daysInMonth(month).at(-1) ?? `${month}-28`;
}

function presetRange(preset: Exclude<RangePreset, "custom">, today: LocalDate): DateRange {
  const month = monthOf(today);
  if (preset === "this-month") return { preset, from: `${month}-01`, to: lastDayOf(month) };
  if (preset === "last-month") {
    const last = addMonthsTo(month, -1);
    return { preset, from: `${last}-01`, to: lastDayOf(last) };
  }
  // The previous two whole months plus this month so far.
  return { preset, from: `${addMonthsTo(month, -2)}-01`, to: today };
}

/**
 * Reads `?range=…&from=…&to=…`. Unknown or invalid input falls back to this month; a
 * custom range with `from` after `to` is swapped, and very long ones are shortened.
 */
export function resolveRange(
  params: { range?: string | undefined; from?: string | undefined; to?: string | undefined },
  today: LocalDate,
): DateRange {
  const preset = RANGE_PRESETS.find((p) => p === params.range) ?? "this-month";
  if (preset !== "custom") return presetRange(preset, today);

  const from = params.from && isLocalDate(params.from) ? params.from : undefined;
  const to = params.to && isLocalDate(params.to) ? params.to : undefined;
  if (!from || !to) return presetRange("this-month", today);

  const [start, end] = from <= to ? [from, to] : [to, from];
  const maxEnd = addLocalDays(start, MAX_CUSTOM_DAYS - 1);
  return { preset, from: start, to: end > maxEnd ? maxEnd : end };
}

/** `[from 00:00, the day after to 00:00)` in `tz`. */
export function rangeInstants(range: Pick<DateRange, "from" | "to">, tz: string): TimeRange {
  return { start: localDayRange(range.from, tz).start, end: localDayRange(range.to, tz).end };
}

/** Query string for links that keep the selected range. */
export function rangeQuery(range: DateRange): Record<string, string> {
  return range.preset === "custom"
    ? { range: "custom", from: range.from, to: range.to }
    : { range: range.preset };
}
