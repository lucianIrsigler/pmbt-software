/**
 * Half-open time range `[start, end)`, stored in Postgres as `tstzrange`.
 * We only ever use bounded, non-empty, `[)` ranges.
 */
export interface TimeRange {
  start: Date;
  end: Date;
}

/** Serialises a range to Postgres' `tstzrange` literal, e.g. `[2026-11-03T07:00:00.000Z,...)`. */
export function formatTstzRange(range: TimeRange): string {
  if (!(range.end.getTime() > range.start.getTime())) {
    throw new RangeError("TimeRange end must be after start");
  }
  return `[${range.start.toISOString()},${range.end.toISOString()})`;
}

/** Postgres prints `2026-11-03 07:00:00+00`; JS needs `2026-11-03T07:00:00+00:00`. */
function parsePgTimestamp(raw: string): Date {
  const iso = raw
    .trim()
    .replace(/^"|"$/g, "")
    .replace(" ", "T")
    .replace(/(\.\d{3})\d+/, "$1")
    .replace(/([+-]\d{2})$/, "$1:00");
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) throw new RangeError("Invalid timestamp in tstzrange");
  return date;
}

/** Parses a `tstzrange` value as returned by Postgres. Only accepts bounded `[)` ranges. */
export function parseTstzRange(value: string): TimeRange {
  const match = /^\[([^,]+),([^)]+)\)$/.exec(value.trim());
  if (!match) throw new RangeError("Unsupported tstzrange (expected bounded [) range)");
  const [, start, end] = match as unknown as [string, string, string];
  return { start: parsePgTimestamp(start), end: parsePgTimestamp(end) };
}
