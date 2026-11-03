import { describe, expect, it } from "vitest";
import { isPastTodaysRun, nextDailyRun } from "./schedule";

const TZ = "Africa/Johannesburg"; // UTC+2

describe("nextDailyRun", () => {
  it("runs later today if the time hasn't come yet", () => {
    expect(nextDailyRun(new Date("2026-11-03T08:00:00Z"), "17:00", TZ)).toEqual(
      new Date("2026-11-03T15:00:00Z"),
    );
  });

  it("runs tomorrow once today's time has passed (or is exactly now)", () => {
    expect(nextDailyRun(new Date("2026-11-03T15:00:00Z"), "17:00", TZ)).toEqual(
      new Date("2026-11-04T15:00:00Z"),
    );
    expect(nextDailyRun(new Date("2026-11-03T20:00:00Z"), "17:00", TZ)).toEqual(
      new Date("2026-11-04T15:00:00Z"),
    );
  });

  it("uses the business date, not UTC's", () => {
    // 23:30 UTC on the 3rd is already 01:30 on the 4th in Johannesburg.
    expect(nextDailyRun(new Date("2026-11-03T23:30:00Z"), "17:00", TZ)).toEqual(
      new Date("2026-11-04T15:00:00Z"),
    );
  });
});

describe("isPastTodaysRun", () => {
  it("is true from the run time until local midnight", () => {
    expect(isPastTodaysRun(new Date("2026-11-03T14:59:00Z"), "17:00", TZ)).toBe(false);
    expect(isPastTodaysRun(new Date("2026-11-03T15:00:00Z"), "17:00", TZ)).toBe(true);
    expect(isPastTodaysRun(new Date("2026-11-03T21:59:00Z"), "17:00", TZ)).toBe(true);
    expect(isPastTodaysRun(new Date("2026-11-03T22:00:00Z"), "17:00", TZ)).toBe(false);
  });
});
