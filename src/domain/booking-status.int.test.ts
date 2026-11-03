import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Database } from "@/db/client";
import { appointment, service } from "@/db/schema";
import { seed } from "@/db/seed";
import { testDatabaseUrl } from "@/test/database";
import { resetBusinessTables } from "@/test/reset";
import { createBooking } from "./booking";
import { cancelByOwner, markDone, markNoShow, updateAppointmentNotes } from "./booking-status";
import { InvalidStatusError, NotFoundError } from "./errors";
import { zonedInstant } from "./time";

const TZ = "Africa/Johannesburg";
/** Friday 1 March 2030, 08:00 local. */
const NOW = new Date("2030-03-01T06:00:00Z");
const clock = { tz: TZ, now: NOW };

let db: Database;
let humanServiceId: string;

function at(date: string, hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return zonedInstant(date, h * 60 + m, TZ);
}

let phoneCounter = 0;
function webBooking(start: Date) {
  phoneCounter += 1;
  return {
    serviceId: humanServiceId,
    start,
    client: { name: "Test Client", phone: `082 ${String(phoneCounter).padStart(3, "0")} 1111` },
    source: "web" as const,
  };
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

describe("owner actions", () => {
  async function status(id: string): Promise<string | undefined> {
    const [row] = await db
      .select({ status: appointment.status })
      .from(appointment)
      .where(eq(appointment.id, id));
    return row?.status;
  }

  it("marks done and no-show only from booked", async () => {
    const a = await createBooking(db, webBooking(at("2030-03-21", "09:00")), clock);
    const b = await createBooking(db, webBooking(at("2030-03-21", "10:00")), clock);
    await markDone(db, a.appointmentId);
    await markNoShow(db, b.appointmentId);
    expect(await status(a.appointmentId)).toBe("done");
    expect(await status(b.appointmentId)).toBe("no_show");

    await expect(markNoShow(db, a.appointmentId)).rejects.toBeInstanceOf(InvalidStatusError);
    await expect(cancelByOwner(db, b.appointmentId)).rejects.toBeInstanceOf(InvalidStatusError);
  });

  it("cancels without a cutoff", async () => {
    const start = at("2030-03-22", "09:00");
    const a = await createBooking(db, webBooking(start), clock);
    await cancelByOwner(db, a.appointmentId, { now: start });
    expect(await status(a.appointmentId)).toBe("cancelled");
  });

  it("raises NotFoundError for unknown appointments", async () => {
    const missing = "00000000-0000-4000-8000-000000000000";
    await expect(markDone(db, missing)).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      updateAppointmentNotes(db, { appointmentId: missing, notes: "x" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("updates notes in any status", async () => {
    const a = await createBooking(db, webBooking(at("2030-03-22", "11:00")), clock);
    await markDone(db, a.appointmentId);
    await updateAppointmentNotes(db, {
      appointmentId: a.appointmentId,
      notes: "Left knee, 8 min.",
    });
    const [row] = await db.select().from(appointment).where(eq(appointment.id, a.appointmentId));
    expect(row?.notes).toBe("Left knee, 8 min.");
  });
});
