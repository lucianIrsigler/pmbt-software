import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Database } from "@/db/client";
import { service, timeOff } from "@/db/schema";
import { seed } from "@/db/seed";
import { testDatabaseUrl } from "@/test/database";
import { resetBusinessTables } from "@/test/reset";
import { listOverlapping } from "./appointments";
import { findSlots } from "./availability";
import { createBooking } from "./booking";
import { cancelByOwner } from "./booking-status";
import { InvalidTimeOffError, NotFoundError } from "./errors";
import {
  addTimeOff,
  getTimeOff,
  listTimeOffDuring,
  listUpcomingTimeOff,
  removeTimeOff,
} from "./time-off";
import { localDayRange, zonedInstant } from "./time";

const TZ = "Africa/Johannesburg";
/** Saturday 1 June 2030, 08:00 local. */
const NOW = new Date("2030-06-01T06:00:00Z");
const clock = { tz: TZ, now: NOW };

let db: Database;
let humanServiceId: string;

function at(date: string, hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return zonedInstant(date, h * 60 + m, TZ);
}

beforeAll(async () => {
  db = createDb(testDatabaseUrl(), { max: 2 });
  await resetBusinessTables(db);
  await seed(db);
  const services = await db.select().from(service).orderBy(asc(service.sortOrder));
  humanServiceId = services.find((s) => s.forKind === "human" && s.durationMin === 30)?.id ?? "";
});

afterAll(async () => {
  await db.$client.end();
});

describe("time off", () => {
  it("blocks a whole day so nothing can be booked on it", async () => {
    const date = "2030-06-04"; // Tuesday
    const before = await findSlots(db, { serviceId: humanServiceId, date }, clock);
    expect(before.length).toBeGreaterThan(0);

    const id = await addTimeOff(db, { date, kind: "day", reason: "Holiday" }, clock);

    expect(await findSlots(db, { serviceId: humanServiceId, date }, clock)).toEqual([]);
    expect(await getTimeOff(db, id)).toEqual({
      id,
      during: localDayRange(date, TZ),
      reason: "Holiday",
    });
  });

  it("blocks part of a day", async () => {
    const date = "2030-06-05";
    await addTimeOff(db, { date, kind: "times", startTime: "09:00", endTime: "12:00" }, clock);
    const slots = await findSlots(db, { serviceId: humanServiceId, date }, clock);
    expect(slots[0]).toEqual(at(date, "12:00"));
  });

  it("refuses time that has already passed", async () => {
    await expect(addTimeOff(db, { date: "2030-05-31", kind: "day" }, clock)).rejects.toBeInstanceOf(
      InvalidTimeOffError,
    );
    // Earlier today is past, but the rest of today can still be blocked.
    await expect(
      addTimeOff(
        db,
        { date: "2030-06-01", kind: "times", startTime: "06:00", endTime: "07:00" },
        clock,
      ),
    ).rejects.toBeInstanceOf(InvalidTimeOffError);
    await expect(addTimeOff(db, { date: "2030-06-01", kind: "day" }, clock)).resolves.toBeTypeOf(
      "string",
    );
  });

  it("keeps existing bookings, which can be found to warn about them", async () => {
    const date = "2030-06-06";
    const kept = await createBooking(
      db,
      {
        serviceId: humanServiceId,
        start: at(date, "10:00"),
        client: { name: "Kept Client", phone: "0820001001" },
        source: "app",
      },
      clock,
    );
    const cancelled = await createBooking(
      db,
      {
        serviceId: humanServiceId,
        start: at(date, "11:00"),
        client: { name: "Gone Client", phone: "0820001002" },
        source: "app",
      },
      clock,
    );
    await cancelByOwner(db, cancelled.appointmentId);

    const id = await addTimeOff(db, { date, kind: "day" }, clock);
    const block = await getTimeOff(db, id);
    if (!block) throw new Error("block missing");

    const clashes = await listOverlapping(db, block.during, ["booked"]);
    expect(clashes.map((a) => a.id)).toEqual([kept.appointmentId]);
    expect(clashes[0]).toMatchObject({ clientName: "Kept Client", status: "booked" });
  });

  it("lists upcoming blocks soonest first and removes them", async () => {
    const upcoming = await listUpcomingTimeOff(db, NOW);
    const starts = upcoming.map((b) => b.during.start.getTime());
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    expect(upcoming.length).toBeGreaterThanOrEqual(4);

    const later = await listUpcomingTimeOff(db, at("2030-06-05", "13:00"));
    // 1 June, 4 June and the morning of 5 June have ended; 6 June hasn't.
    expect(later.length).toBe(upcoming.length - 3);

    const week = { start: at("2030-06-03", "00:00"), end: at("2030-06-10", "00:00") };
    const [first] = await listTimeOffDuring(db, week);
    if (!first) throw new Error("expected a block");
    await removeTimeOff(db, first.id, NOW);
    expect(await getTimeOff(db, first.id)).toBeNull();
    expect((await listTimeOffDuring(db, week)).map((b) => b.id)).not.toContain(first.id);
    expect((await listUpcomingTimeOff(db, NOW)).map((b) => b.id)).not.toContain(first.id);
    await expect(removeTimeOff(db, first.id)).rejects.toBeInstanceOf(NotFoundError);

    // Kept as a record.
    const [row] = await db.select().from(timeOff).where(eq(timeOff.id, first.id));
    expect(row?.removedAt).toEqual(NOW);
  });

  it("frees the time again once removed", async () => {
    const date = "2030-06-11";
    const id = await addTimeOff(db, { date, kind: "day" }, clock);
    expect(await findSlots(db, { serviceId: humanServiceId, date }, clock)).toEqual([]);
    await removeTimeOff(db, id);
    expect(
      (await findSlots(db, { serviceId: humanServiceId, date }, clock)).length,
    ).toBeGreaterThan(0);
  });

  it("returns null for unknown or malformed ids", async () => {
    expect(await getTimeOff(db, "not-a-uuid")).toBeNull();
  });
});
