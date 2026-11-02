import { describe, expect, it } from "vitest";
import {
  appointmentRange,
  getAvailableDates,
  getAvailableSlots,
  isSlotAvailable,
  lastBookableDate,
  type SlotQuery,
  type SlotWorkingHours,
} from "./slots";
import { zonedInstant } from "./time";

const TZ = "Africa/Johannesburg"; // UTC+2, no DST

/** Seeded hours: Mon–Fri 09:00–17:00, Sat 09:00–13:00. */
const HOURS: SlotWorkingHours[] = [
  ...[1, 2, 3, 4, 5].map((weekday) => ({ weekday, startTime: "09:00", endTime: "17:00" })),
  { weekday: 6, startTime: "09:00:00", endTime: "13:00:00" },
];

const MONDAY = "2030-03-04";
const SUNDAY = "2030-03-03";
const SATURDAY = "2030-03-09";

/** Local business time on a date, as an instant. */
function at(date: string, hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return zonedInstant(date, h * 60 + m, TZ);
}

/** Slot start times as local `HH:MM` strings. */
function times(slots: Date[]): string[] {
  return slots.map((d) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: TZ,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(d),
  );
}

function query(overrides: Partial<SlotQuery> = {}): SlotQuery {
  return {
    date: MONDAY,
    service: { durationMin: 30, bufferMin: 10 },
    workingHours: HOURS,
    timeOff: [],
    appointments: [],
    settings: { minNoticeHours: 12, maxDaysAhead: 42, slotStepMin: 30 },
    // Friday 1 March 2030, 08:00 local.
    now: new Date("2030-03-01T06:00:00Z"),
    tz: TZ,
    ...overrides,
  };
}

function withoutDate(): Omit<SlotQuery, "date"> {
  const { date, ...rest } = query();
  void date;
  return rest;
}

describe("getAvailableSlots", () => {
  it("returns every step inside working hours on an open day", () => {
    const slots = getAvailableSlots(query());
    // 30 min + 10 min buffer: last start is 16:00 (ends 16:40); 16:30 would end 17:10.
    expect(times(slots)).toEqual([
      "09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30",
      "13:00", "13:30", "14:00", "14:30", "15:00", "15:30", "16:00",
    ]); // prettier-ignore
  });

  it("returns instants in the business time zone (09:00 SAST = 07:00 UTC)", () => {
    const [first] = getAvailableSlots(query());
    expect(first?.toISOString()).toBe("2030-03-04T07:00:00.000Z");
  });

  it("returns nothing on a closed day", () => {
    expect(getAvailableSlots(query({ date: SUNDAY }))).toEqual([]);
  });

  it("uses that weekday's own hours (Saturday closes at 13:00)", () => {
    const slots = getAvailableSlots(query({ date: SATURDAY }));
    expect(times(slots).at(-1)).toBe("12:00");
  });

  it("drops starts where the service would run past closing", () => {
    const slots = getAvailableSlots(query({ service: { durationMin: 60, bufferMin: 10 } }));
    // 15:30 + 70 min = 16:40 fits; 16:00 + 70 = 17:10 doesn't.
    expect(times(slots).at(-1)).toBe("15:30");
  });

  it("returns nothing when the service is longer than the opening hours", () => {
    const slots = getAvailableSlots(
      query({ date: SATURDAY, service: { durationMin: 240, bufferMin: 10 } }),
    );
    expect(slots).toEqual([]);
  });

  describe("a booking in the middle of the day", () => {
    const booking = { during: { start: at(MONDAY, "11:00"), end: at(MONDAY, "11:40") } };

    it("blocks every slot that would overlap it", () => {
      const slots = times(getAvailableSlots(query({ appointments: [booking] })));
      // 10:30 + 40 = 11:10 overlaps; 11:30 starts before 11:40.
      expect(slots).toContain("10:00");
      expect(slots).not.toContain("10:30");
      expect(slots).not.toContain("11:00");
      expect(slots).not.toContain("11:30");
      expect(slots).toContain("12:00");
    });

    it("allows a slot that starts exactly when the booking ends", () => {
      const ends1200 = { during: { start: at(MONDAY, "11:20"), end: at(MONDAY, "12:00") } };
      expect(times(getAvailableSlots(query({ appointments: [ends1200] })))).toContain("12:00");
    });

    it("ignores cancelled and no-show appointments", () => {
      const others = (["cancelled", "no_show"] as const).map((status) => ({
        ...booking,
        status,
      }));
      expect(getAvailableSlots(query({ appointments: others }))).toHaveLength(15);
    });

    it("keeps a done appointment's time blocked", () => {
      const done = { ...booking, status: "done" as const };
      expect(times(getAvailableSlots(query({ appointments: [done] })))).not.toContain("11:00");
    });
  });

  describe("buffer handling", () => {
    it("counts the buffer when checking closing time", () => {
      const noBuffer = getAvailableSlots(query({ service: { durationMin: 30, bufferMin: 0 } }));
      const withBuffer = getAvailableSlots(query({ service: { durationMin: 30, bufferMin: 10 } }));
      expect(times(noBuffer).at(-1)).toBe("16:30");
      expect(times(withBuffer).at(-1)).toBe("16:00");
    });

    it("counts the buffer when checking against the next booking", () => {
      const at1100 = { during: { start: at(MONDAY, "11:00"), end: at(MONDAY, "11:40") } };
      const noBuffer = getAvailableSlots(
        query({ service: { durationMin: 30, bufferMin: 0 }, appointments: [at1100] }),
      );
      const withBuffer = getAvailableSlots(query({ appointments: [at1100] }));
      expect(times(noBuffer)).toContain("10:30"); // ends 11:00 exactly
      expect(times(withBuffer)).not.toContain("10:30"); // ends 11:10
    });

    it("builds appointment ranges that include the buffer", () => {
      const start = at(MONDAY, "09:00");
      expect(appointmentRange(start, { durationMin: 45, bufferMin: 10 })).toEqual({
        start,
        end: at(MONDAY, "09:55"),
      });
    });
  });

  describe("time off", () => {
    // Monday 14:00 to Wednesday 10:00.
    const away = { start: at(MONDAY, "14:00"), end: at("2030-03-06", "10:00") };

    it("cuts the afternoon of the first day", () => {
      expect(times(getAvailableSlots(query({ timeOff: [away] }))).at(-1)).toBe("13:00");
    });

    it("blocks whole days in the middle", () => {
      expect(getAvailableSlots(query({ date: "2030-03-05", timeOff: [away] }))).toEqual([]);
    });

    it("opens again when it ends", () => {
      const slots = getAvailableSlots(query({ date: "2030-03-06", timeOff: [away] }));
      expect(times(slots)[0]).toBe("10:00");
    });
  });

  describe("minimum notice", () => {
    it("hides slots less than min_notice_hours from now", () => {
      // Monday 00:00 local + 12 h = 12:00.
      const slots = getAvailableSlots(query({ now: at(MONDAY, "00:00") }));
      expect(times(slots)[0]).toBe("12:00");
    });

    it("includes a slot exactly at the notice boundary", () => {
      const slots = getAvailableSlots(query({ now: at(MONDAY, "00:30") }));
      expect(times(slots)[0]).toBe("12:30");
    });

    it("can be ignored for owner bookings, but never offers past times", () => {
      const slots = getAvailableSlots(query({ now: at(MONDAY, "10:05"), ignoreMinNotice: true }));
      expect(times(slots)[0]).toBe("10:30");
    });
  });

  describe("booking horizon", () => {
    // Today is Friday 2030-03-01; 42 days ahead is Friday 2030-04-12.
    it("computes the last bookable date in the business time zone", () => {
      expect(lastBookableDate(new Date("2030-03-01T06:00:00Z"), 42, TZ)).toBe("2030-04-12");
      // 23:30 UTC on 28 Feb is already 1 March in Johannesburg.
      expect(lastBookableDate(new Date("2030-02-28T23:30:00Z"), 42, TZ)).toBe("2030-04-12");
    });

    it("includes the last day of the horizon", () => {
      expect(getAvailableSlots(query({ date: "2030-04-12" })).length).toBeGreaterThan(0);
    });

    it("excludes days beyond it", () => {
      expect(getAvailableSlots(query({ date: "2030-04-13" }))).toEqual([]);
    });

    it("excludes past days", () => {
      expect(getAvailableSlots(query({ date: "2030-02-25" }))).toEqual([]);
    });
  });

  describe("slot step", () => {
    it("aligns starts to the step, counted from midnight", () => {
      const hours = [{ weekday: 1, startTime: "09:15", endTime: "11:00" }];
      expect(times(getAvailableSlots(query({ workingHours: hours })))).toEqual(["09:30", "10:00"]);
    });

    it("supports smaller steps", () => {
      const slots = getAvailableSlots(
        query({ settings: { minNoticeHours: 12, maxDaysAhead: 42, slotStepMin: 15 } }),
      );
      expect(times(slots).slice(0, 3)).toEqual(["09:00", "09:15", "09:30"]);
    });
  });

  it("supports split days without duplicates", () => {
    const hours = [
      { weekday: 1, startTime: "09:00", endTime: "11:00" },
      { weekday: 1, startTime: "10:00", endTime: "12:00" },
      { weekday: 1, startTime: "14:00", endTime: "15:00" },
    ];
    expect(times(getAvailableSlots(query({ workingHours: hours })))).toEqual([
      "09:00", "09:30", "10:00", "10:30", "11:00", "14:00",
    ]); // prettier-ignore
  });

  it("works in a time zone with daylight saving", () => {
    const slots = getAvailableSlots(
      query({ tz: "Europe/London", date: "2030-07-01", now: new Date("2030-06-20T00:00:00Z") }),
    );
    // 09:00 BST = 08:00 UTC.
    expect(slots[0]?.toISOString()).toBe("2030-07-01T08:00:00.000Z");
  });
});

describe("isSlotAvailable", () => {
  const base = withoutDate();

  it("accepts an offered slot", () => {
    expect(isSlotAvailable(at(MONDAY, "09:30"), base)).toBe(true);
  });

  it("rejects off-step, closed or busy times", () => {
    expect(isSlotAvailable(at(MONDAY, "09:10"), base)).toBe(false);
    expect(isSlotAvailable(at(SUNDAY, "10:00"), base)).toBe(false);
    const busy = { during: { start: at(MONDAY, "09:00"), end: at(MONDAY, "10:00") } };
    expect(isSlotAvailable(at(MONDAY, "09:30"), { ...base, appointments: [busy] })).toBe(false);
  });
});

describe("getAvailableDates", () => {
  const base = withoutDate();

  it("lists open days with at least one slot", () => {
    const dates = getAvailableDates("2030-03", base);
    // 1 March: min notice pushes past closing. Sundays are closed.
    expect(dates).not.toContain("2030-03-01");
    expect(dates).toContain("2030-03-02");
    for (const sunday of ["2030-03-03", "2030-03-10", "2030-03-17", "2030-03-24", "2030-03-31"]) {
      expect(dates).not.toContain(sunday);
    }
    expect(dates).toHaveLength(25);
  });

  it("drops fully blocked days", () => {
    const dayOff = { start: at("2030-03-05", "00:00"), end: at("2030-03-06", "00:00") };
    const dates = getAvailableDates("2030-03", { ...base, timeOff: [dayOff] });
    expect(dates).not.toContain("2030-03-05");
    expect(dates).toHaveLength(24);
  });

  it("returns nothing for months beyond the horizon", () => {
    expect(getAvailableDates("2030-05", base)).toEqual([]);
  });

  it("stops at the horizon inside a month", () => {
    const dates = getAvailableDates("2030-04", base);
    expect(dates.at(-1)).toBe("2030-04-12");
  });
});
