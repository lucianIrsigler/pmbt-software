import { describe, expect, it } from "vitest";
import {
  formatDateTime,
  formatDayLong,
  formatDuration,
  formatLocalDate,
  formatMonth,
  formatPhone,
  formatPrice,
  formatTime,
} from "./format";

const TZ = "Africa/Johannesburg";

describe("formatPrice", () => {
  it.each([
    [45000, "R450"],
    [45050, "R450.50"],
    [5, "R0.05"],
    [0, "R0"],
    [123456700, "R1 234 567"],
  ])("%i cents → %s", (cents, expected) => {
    expect(formatPrice(cents)).toBe(expected);
  });
});

describe("formatDuration", () => {
  it.each([
    [30, "30 min"],
    [60, "1 hour"],
    [90, "1 hour 30 min"],
    [120, "2 hours"],
  ])("%i → %s", (minutes, expected) => {
    expect(formatDuration(minutes)).toBe(expected);
  });
});

describe("dates and times", () => {
  // 07:30 UTC = 09:30 in Johannesburg.
  const instant = new Date("2026-11-03T07:30:00Z");

  it("formats in the business time zone", () => {
    expect(formatTime(instant, TZ)).toBe("09:30");
    expect(formatDayLong(instant, TZ)).toBe("Tuesday 3 November");
    expect(formatDateTime(instant, TZ)).toBe("Tuesday 3 November 2026 at 09:30");
  });

  it("uses the business date, not UTC, near midnight", () => {
    expect(formatDayLong(new Date("2026-11-02T23:00:00Z"), TZ)).toBe("Tuesday 3 November");
  });

  it("formats calendar dates and months", () => {
    expect(formatLocalDate("2026-11-03")).toBe("Tuesday 3 November");
    expect(formatMonth("2026-11")).toBe("November 2026");
  });
});

describe("formatPhone", () => {
  it("shows South African numbers the local way", () => {
    expect(formatPhone("+27821234567")).toBe("082 123 4567");
    expect(formatPhone("+27215551234")).toBe("021 555 1234");
  });

  it("leaves other numbers alone", () => {
    expect(formatPhone("+442079460958")).toBe("+442079460958");
  });
});
