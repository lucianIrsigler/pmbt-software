import { describe, expect, it } from "vitest";
import { formatTstzRange, parseTstzRange } from "./range";

const start = new Date("2026-11-03T07:00:00.000Z");
const end = new Date("2026-11-03T08:10:00.000Z");

describe("formatTstzRange", () => {
  it("formats a half-open range in UTC", () => {
    expect(formatTstzRange({ start, end })).toBe(
      "[2026-11-03T07:00:00.000Z,2026-11-03T08:10:00.000Z)",
    );
  });

  it("rejects empty or inverted ranges", () => {
    expect(() => formatTstzRange({ start, end: start })).toThrow(RangeError);
    expect(() => formatTstzRange({ start: end, end: start })).toThrow(RangeError);
  });
});

describe("parseTstzRange", () => {
  it("parses Postgres output (quoted, short UTC offset)", () => {
    expect(parseTstzRange('["2026-11-03 07:00:00+00","2026-11-03 08:10:00+00")')).toEqual({
      start,
      end,
    });
  });

  it("parses non-UTC offsets and microseconds", () => {
    const range = parseTstzRange('["2026-11-03 09:00:00.123456+02","2026-11-03 10:10:00+02:00")');
    expect(range.start.toISOString()).toBe("2026-11-03T07:00:00.123Z");
    expect(range.end).toEqual(end);
  });

  it("round-trips with formatTstzRange", () => {
    expect(parseTstzRange(formatTstzRange({ start, end }))).toEqual({ start, end });
  });

  it("rejects unbounded, empty and other bound types", () => {
    expect(() => parseTstzRange("empty")).toThrow(RangeError);
    expect(() => parseTstzRange('["2026-11-03 07:00:00+00",)')).toThrow(RangeError);
    expect(() => parseTstzRange('("2026-11-03 07:00:00+00","2026-11-03 08:00:00+00"]')).toThrow(
      RangeError,
    );
  });
});
