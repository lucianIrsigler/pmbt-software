import { asc, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type Database } from "@/db/client";
import { appointment, service, settings } from "@/db/schema";
import { seed } from "@/db/seed";
import { testDatabaseUrl } from "@/test/database";
import { cancelByOwner, createBooking } from "./booking";
import { createClient, updateClient } from "./clients";
import { getAppointmentEmailData } from "./notifications";
import { claimDueReminders, sendDueReminders } from "./reminders";
import { zonedInstant } from "./time";

const TZ = "Africa/Johannesburg";
/** Monday 3 June 2030, 17:00 local: when the reminder job runs. */
const NOW = zonedInstant("2030-06-03", 17 * 60, TZ);
const OPTIONS = { tz: TZ, now: NOW };
const OWNER = { tz: TZ, now: new Date("2030-06-01T06:00:00Z"), ignoreMinNotice: true };
const TUESDAY = "2030-06-04";

let db: Database;
let humanServiceId: string;

function at(date: string, hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return zonedInstant(date, h * 60 + m, TZ);
}

let phone = 0;
/** A new client with a booking. Pass `email: null` for a client without an email. */
async function booking(start: Date, email: string | null = "c@example.com"): Promise<string> {
  phone += 1;
  const { id } = await createClient(db, {
    name: "Reminder Client",
    phone: `083 200 ${String(phone).padStart(4, "0")}`,
    email: email ?? undefined,
  });
  const b = await createBooking(
    db,
    { serviceId: humanServiceId, start, client: { id }, source: "app" },
    OWNER,
  );
  return b.appointmentId;
}

beforeAll(async () => {
  db = createDb(testDatabaseUrl(), { max: 2 });
});

beforeEach(async () => {
  await db.execute(
    sql`truncate appointment_product, appointment, pet, client, service, product, working_hours, settings, time_off`,
  );
  await seed(db);
  const services = await db.select().from(service).orderBy(asc(service.sortOrder));
  humanServiceId = services.find((s) => s.forKind === "human" && s.durationMin === 30)?.id ?? "";
});

afterAll(async () => {
  await db.$client.end();
});

describe("claimDueReminders", () => {
  it("picks tomorrow's booked appointments for clients with an email, once", async () => {
    const due = await booking(at(TUESDAY, "09:00"));
    const lateInDay = await booking(at(TUESDAY, "16:00"));
    await booking(at(TUESDAY, "10:00"), null); // no email
    await booking(at("2030-06-05", "09:00")); // the day after tomorrow
    await booking(at("2030-06-03", "16:00")); // today
    const cancelled = await booking(at(TUESDAY, "11:00"));
    await cancelByOwner(db, cancelled);

    expect((await claimDueReminders(db, OPTIONS)).sort()).toEqual([due, lateInDay].sort());
    // Running again finds nothing: each is reminded at most once.
    expect(await claimDueReminders(db, OPTIONS)).toEqual([]);

    const [row] = await db.select().from(appointment).where(eq(appointment.id, due));
    expect(row?.reminderSentAt).toEqual(NOW);
  });

  it("uses the business time zone for 'tomorrow'", async () => {
    // 23:30 UTC on Monday is already Tuesday 01:30 in Johannesburg: tomorrow is Wednesday.
    const id = await booking(at("2030-06-05", "09:00"));
    await booking(at(TUESDAY, "09:00"));
    const lateUtc = new Date("2030-06-03T23:30:00Z");
    expect(await claimDueReminders(db, { tz: TZ, now: lateUtc })).toEqual([id]);
  });
});

describe("sendDueReminders", () => {
  it("counts outcomes and releases failures so the next run retries them", async () => {
    const ok = await booking(at(TUESDAY, "09:00"));
    const bad = await booking(at(TUESDAY, "10:00"));

    const sends: string[] = [];
    const first = await sendDueReminders(db, OPTIONS, async (id) => {
      sends.push(id);
      return id === bad ? "failed" : "sent";
    });
    expect(first).toEqual({ sent: 1, failed: 1, skipped: 0 });
    expect(sends.sort()).toEqual([ok, bad].sort());

    const second = await sendDueReminders(db, OPTIONS, async (id) => {
      expect(id).toBe(bad);
      return "sent";
    });
    expect(second).toEqual({ sent: 1, failed: 0, skipped: 0 });
    expect(await sendDueReminders(db, OPTIONS, async () => "sent")).toEqual({
      sent: 0,
      failed: 0,
      skipped: 0,
    });
  });
});

describe("getAppointmentEmailData", () => {
  it("has everything an email needs, without the buffer", async () => {
    await db
      .update(settings)
      .set({ businessName: "Healing Paws", contactPhone: "082 123 4567", address: "12 Oak St" });
    const id = await booking(at(TUESDAY, "09:00"), "Client@Example.com");
    const data = await getAppointmentEmailData(db, id);
    expect(data).toMatchObject({
      appointmentId: id,
      status: "booked",
      clientEmail: "client@example.com",
      petName: null,
      start: at(TUESDAY, "09:00"),
      end: at(TUESDAY, "09:30"),
      business: { name: "Healing Paws", phone: "082 123 4567", address: "12 Oak St" },
    });
    expect(data?.manageToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(data?.cancelDeadline).toEqual(at("2030-06-03", "09:00")); // 24 h before

    const [row] = await db.select().from(appointment).where(eq(appointment.id, id));
    await updateClient(db, row?.clientId ?? "", { name: "No Email", phone: "0832009999" });
    expect((await getAppointmentEmailData(db, id))?.clientEmail).toBeNull();
    expect(await getAppointmentEmailData(db, "00000000-0000-4000-8000-000000000000")).toBeNull();
  });
});
