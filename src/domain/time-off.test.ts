import { describe, expect, it } from "vitest";
import { addTimeOffSchema } from "./schemas";
import { timeOffRange } from "./time-off";

const TZ = "Africa/Johannesburg";

describe("addTimeOffSchema", () => {
  it("accepts a whole day and drops a blank reason", () => {
    expect(addTimeOffSchema.parse({ date: "2030-03-04", kind: "day", reason: "  " })).toEqual({
      kind: "day",
      date: "2030-03-04",
      reason: undefined,
    });
  });

  it("ignores times for a whole day", () => {
    const parsed = addTimeOffSchema.parse({
      date: "2030-03-04",
      kind: "day",
      startTime: "",
      endTime: "",
    });
    expect(parsed.kind).toBe("day");
  });

  it("accepts part of a day", () => {
    expect(
      addTimeOffSchema.parse({
        date: "2030-03-04",
        kind: "times",
        startTime: "13:00",
        endTime: "15:30",
        reason: "Dentist",
      }),
    ).toEqual({
      kind: "times",
      date: "2030-03-04",
      startTime: "13:00",
      endTime: "15:30",
      reason: "Dentist",
    });
  });

  it("needs both times, with the end after the start", () => {
    const missing = addTimeOffSchema.safeParse({ date: "2030-03-04", kind: "times" });
    expect(missing.error?.issues.map((i) => i.path[0])).toEqual(["startTime", "endTime"]);

    const backwards = addTimeOffSchema.safeParse({
      date: "2030-03-04",
      kind: "times",
      startTime: "15:00",
      endTime: "15:00",
    });
    expect(backwards.error?.issues[0]?.message).toBe("The end time must be after the start time");
  });

  it("rejects invalid dates", () => {
    expect(addTimeOffSchema.safeParse({ date: "2030-02-30", kind: "day" }).success).toBe(false);
  });
});

describe("timeOffRange", () => {
  it("covers local midnight to midnight for a whole day", () => {
    expect(timeOffRange({ kind: "day", date: "2030-03-04" }, TZ)).toEqual({
      start: new Date("2030-03-03T22:00:00Z"),
      end: new Date("2030-03-04T22:00:00Z"),
    });
  });

  it("uses business time for part of a day", () => {
    expect(
      timeOffRange({ kind: "times", date: "2030-03-04", startTime: "13:00", endTime: "15:30" }, TZ),
    ).toEqual({
      start: new Date("2030-03-04T11:00:00Z"),
      end: new Date("2030-03-04T13:30:00Z"),
    });
  });
});
