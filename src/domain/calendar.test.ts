import { describe, expect, it } from "vitest";
import { buildDayColumn, gridWindow, weekDates, weekStart, type DayColumnInput } from "./calendar";
import type { SlotWorkingHours } from "./slots";
import { minutesOfDay, zonedInstant, type TimeRange } from "./time";

const TZ = "Africa/Johannesburg";

/** Seeded hours: Mon–Fri 09:00–17:00, Sat 09:00–13:00. */
const HOURS: SlotWorkingHours[] = [
  ...[1, 2, 3, 4, 5].map((weekday) => ({ weekday, startTime: "09:00", endTime: "17:00" })),
  { weekday: 6, startTime: "09:00:00", endTime: "13:00:00" },
];

const MONDAY = "2030-03-04";
const SATURDAY = "2030-03-09";
const SUNDAY = "2030-03-10";

function at(date: string, hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return zonedInstant(date, h * 60 + m, TZ);
}

function range(date: string, from: string, to: string): { during: TimeRange } {
  return { during: { start: at(date, from), end: at(date, to) } };
}

function hhmm(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function column(overrides: Partial<DayColumnInput<{ during: TimeRange }, { during: TimeRange }>>) {
  return buildDayColumn({
    date: MONDAY,
    window: { from: 9 * 60, to: 17 * 60 },
    workingHours: HOURS,
    appointments: [],
    timeOff: [],
    stepMin: 30,
    // Friday before, so every cell is in the future.
    now: at("2030-03-01", "08:00"),
    tz: TZ,
    ...overrides,
  });
}

/** Free cells as local start times. */
function freeTimes(col: ReturnType<typeof column>): string[] {
  return col.free.map((c) => hhmm(minutesOfDay(c.start, TZ)));
}

describe("weekStart / weekDates", () => {
  it("starts weeks on Monday", () => {
    expect(weekStart(MONDAY)).toBe(MONDAY);
    expect(weekStart("2030-03-06")).toBe(MONDAY);
    expect(weekStart(SUNDAY)).toBe(MONDAY);
  });

  it("lists Monday to Sunday, across month ends", () => {
    expect(weekDates("2030-04-02")).toEqual([
      "2030-04-01",
      "2030-04-02",
      "2030-04-03",
      "2030-04-04",
      "2030-04-05",
      "2030-04-06",
      "2030-04-07",
    ]);
    expect(weekDates("2030-03-31")[0]).toBe("2030-03-25");
  });
});

describe("gridWindow", () => {
  it("spans the earliest opening to the latest closing", () => {
    expect(gridWindow(weekDates(MONDAY), HOURS, [], TZ)).toEqual({ from: 540, to: 1020 });
    expect(gridWindow([SATURDAY], HOURS, [], TZ)).toEqual({ from: 540, to: 780 });
  });

  it("widens to fit appointments outside hours, rounded to whole hours", () => {
    const early = range(MONDAY, "07:30", "08:10");
    const late = range(MONDAY, "17:00", "17:40");
    expect(gridWindow([MONDAY], HOURS, [early, late], TZ)).toEqual({ from: 420, to: 1080 });
  });

  it("ignores appointments on other days", () => {
    expect(gridWindow([SATURDAY], HOURS, [range(MONDAY, "07:00", "08:00")], TZ)).toEqual({
      from: 540,
      to: 780,
    });
  });

  it("is null for a closed, empty day", () => {
    expect(gridWindow([SUNDAY], HOURS, [], TZ)).toBeNull();
  });

  it("shows a closed day that has an appointment", () => {
    expect(gridWindow([SUNDAY], HOURS, [range(SUNDAY, "10:00", "10:40")], TZ)).toEqual({
      from: 600,
      to: 660,
    });
  });
});

describe("buildDayColumn", () => {
  it("offers every step of an empty working day", () => {
    const col = column({});
    expect(col.open).toBe(true);
    expect(col.free).toHaveLength(16);
    expect(freeTimes(col)[0]).toBe("09:00");
    expect(freeTimes(col).at(-1)).toBe("16:30");
    expect(col.free[1]).toMatchObject({ top: 30, height: 30 });
  });

  it("places an appointment (with its buffer) and frees cells around it", () => {
    const appt = range(MONDAY, "10:00", "10:40");
    const col = column({ appointments: [appt] });
    expect(col.appointments).toEqual([{ item: appt, top: 60, height: 40 }]);
    expect(freeTimes(col)).not.toContain("10:00");
    expect(freeTimes(col)).not.toContain("10:30"); // the buffer runs to 10:40
    expect(freeTimes(col)).toContain("09:30");
    expect(freeTimes(col)).toContain("11:00");
  });

  it("shows time off and offers no cells inside it", () => {
    const away = range(MONDAY, "13:00", "15:00");
    const col = column({ timeOff: [away] });
    expect(col.away).toEqual([{ item: away, top: 240, height: 120 }]);
    expect(freeTimes(col)).not.toContain("13:00");
    expect(freeTimes(col)).not.toContain("14:30");
    expect(freeTimes(col)).toContain("15:00");
  });

  it("clips time off spanning several days to the window", () => {
    const away = { during: { start: at("2030-03-03", "12:00"), end: at("2030-03-06", "00:00") } };
    const col = column({ timeOff: [away] });
    expect(col.away).toEqual([{ item: away, top: 0, height: 480 }]);
    expect(col.free).toEqual([]);
  });

  it("offers no cells in the past", () => {
    const col = column({ now: at(MONDAY, "15:10") });
    expect(freeTimes(col)).toEqual(["15:30", "16:00", "16:30"]);
  });

  it("marks a closed day", () => {
    const col = column({ date: SUNDAY });
    expect(col.open).toBe(false);
    expect(col.free).toEqual([]);
  });

  it("only offers cells within the window and working hours", () => {
    const col = column({ date: SATURDAY });
    expect(freeTimes(col)).toEqual([
      "09:00",
      "09:30",
      "10:00",
      "10:30",
      "11:00",
      "11:30",
      "12:00",
      "12:30",
    ]);
  });
});
