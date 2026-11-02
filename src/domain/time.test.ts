import { describe, expect, it } from "vitest";
import {
  addLocalDays,
  addMonthsTo,
  daysInMonth,
  isLocalDate,
  localDateOf,
  localDayRange,
  monthOf,
  timeToMinutes,
  weekdayOf,
} from "./time";

const TZ = "Africa/Johannesburg";

describe("time helpers", () => {
  it("validates local dates", () => {
    expect(isLocalDate("2030-02-28")).toBe(true);
    expect(isLocalDate("2030-02-29")).toBe(false);
    expect(isLocalDate("2030-2-1")).toBe(false);
  });

  it("parses times", () => {
    expect(timeToMinutes("09:30")).toBe(570);
    expect(timeToMinutes("17:00:00")).toBe(1020);
    expect(() => timeToMinutes("25:00")).toThrow(RangeError);
  });

  it("knows weekdays and local dates", () => {
    expect(weekdayOf("2030-03-03")).toBe(0); // Sunday
    expect(localDateOf(new Date("2030-03-02T22:30:00Z"), TZ)).toBe("2030-03-03");
  });

  it("does calendar arithmetic", () => {
    expect(addLocalDays("2030-02-28", 1)).toBe("2030-03-01");
    expect(addLocalDays("2030-12-31", 1)).toBe("2031-01-01");
    expect(daysInMonth("2030-02")).toHaveLength(28);
    expect(daysInMonth("2032-02")).toHaveLength(29);
  });

  it("computes the local day as a UTC range", () => {
    const day = localDayRange("2030-03-04", TZ);
    expect(day.start.toISOString()).toBe("2030-03-03T22:00:00.000Z");
    expect(day.end.toISOString()).toBe("2030-03-04T22:00:00.000Z");
  });

  it("does month arithmetic", () => {
    expect(monthOf("2030-03-04")).toBe("2030-03");
    expect(addMonthsTo("2030-12", 1)).toBe("2031-01");
    expect(addMonthsTo("2030-01", -1)).toBe("2029-12");
  });
});
