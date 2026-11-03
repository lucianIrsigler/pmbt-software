import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Database } from "@/db/client";
import {
  appointment,
  appointmentProduct,
  client,
  pet,
  product,
  service,
  timeOff,
} from "@/db/schema";
import { seed } from "@/db/seed";
import { testDatabaseUrl } from "@/test/database";
import { resetBusinessTables } from "@/test/reset";
import { findDates, findSlots } from "./availability";
import {
  addProductToAppointment,
  cancelBookingByToken,
  cancelByOwner,
  createBooking,
  getBookingByToken,
  markDone,
  markNoShow,
  removeProductFromAppointment,
  updateAppointmentNotes,
} from "./booking";
import {
  CancelTooLateError,
  InvalidBookingError,
  InvalidStatusError,
  NotFoundError,
  SlotTakenError,
  SlotUnavailableError,
  TooManyBookingsError,
} from "./errors";
import { zonedInstant } from "./time";

const TZ = "Africa/Johannesburg";
/** Friday 1 March 2030, 08:00 local. Seeded settings: 12 h notice, 42 days ahead, 24 h cutoff. */
const NOW = new Date("2030-03-01T06:00:00Z");
const clock = { tz: TZ, now: NOW };

let db: Database;
let humanServiceId: string; // 30 min + 10 buffer
let animalServiceId: string;
let productId: string;

function at(date: string, hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return zonedInstant(date, h * 60 + m, TZ);
}

let phoneCounter = 0;
/** A fresh SA mobile number per test, written the way people type them. */
function freshPhone(): string {
  phoneCounter += 1;
  return `082 ${String(phoneCounter).padStart(3, "0")} 0000`;
}

function webBooking(start: Date, phone = freshPhone()) {
  return {
    serviceId: humanServiceId,
    start,
    client: { name: "Test Client", phone },
    source: "web" as const,
  };
}

beforeAll(async () => {
  db = createDb(testDatabaseUrl(), { max: 4 });
  await resetBusinessTables(db);
  await seed(db);
  const services = await db.select().from(service).orderBy(asc(service.sortOrder));
  const human = services.find((s) => s.forKind === "human" && s.durationMin === 30);
  const animal = services.find((s) => s.forKind === "animal");
  const [prod] = await db.select().from(product).orderBy(asc(product.sortOrder)).limit(1);
  if (!human || !animal || !prod) throw new Error("seed data missing");
  humanServiceId = human.id;
  animalServiceId = animal.id;
  productId = prod.id;
});

afterAll(async () => {
  await db.$client.end();
});

describe("createBooking", () => {
  it("books a human service for a new client", async () => {
    const start = at("2030-03-04", "09:00");
    const booking = await createBooking(db, webBooking(start, "082 555 0001"), clock);

    expect(booking.petId).toBeNull();
    expect(booking.manageToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(booking.during).toEqual({ start, end: at("2030-03-04", "09:40") });

    const [row] = await db
      .select()
      .from(appointment)
      .where(eq(appointment.id, booking.appointmentId));
    expect(row).toMatchObject({ status: "booked", source: "web", clientId: booking.clientId });
    const [c] = await db.select().from(client).where(eq(client.id, booking.clientId));
    expect(c?.phone).toBe("+27825550001");
  });

  it("matches a returning client by normalised phone and keeps their name", async () => {
    const first = await createBooking(
      db,
      webBooking(at("2030-03-05", "09:00"), "0821110000"),
      clock,
    );
    const second = await createBooking(
      db,
      {
        ...webBooking(at("2030-03-05", "10:00"), "+27 82 111 0000"),
        client: { name: "Different Spelling", phone: "+27 82 111 0000", email: "a@b.co" },
      },
      clock,
    );
    expect(second.clientId).toBe(first.clientId);
    const [c] = await db.select().from(client).where(eq(client.id, first.clientId));
    expect(c).toMatchObject({ name: "Test Client", email: "a@b.co" });
  });

  it("books an animal service, creating the pet once and reusing it by name", async () => {
    const phone = freshPhone();
    const input = (start: Date, petName: string) => ({
      serviceId: animalServiceId,
      start,
      client: { name: "Dog Owner", phone },
      pet: { name: petName, species: "Dog", breed: "Labrador" },
      source: "web" as const,
    });
    const first = await createBooking(db, input(at("2030-03-06", "09:00"), "Rex"), clock);
    const second = await createBooking(db, input(at("2030-03-06", "11:00"), "rex"), clock);

    expect(first.petId).not.toBeNull();
    expect(second.petId).toBe(first.petId);
    const pets = await db.select().from(pet).where(eq(pet.clientId, first.clientId));
    expect(pets).toHaveLength(1);
  });

  it("requires a pet for animal services and none for human services", async () => {
    await expect(
      createBooking(
        db,
        { ...webBooking(at("2030-03-07", "09:00")), serviceId: animalServiceId },
        clock,
      ),
    ).rejects.toBeInstanceOf(InvalidBookingError);
    await expect(
      createBooking(
        db,
        { ...webBooking(at("2030-03-07", "09:00")), pet: { name: "Rex", species: "Dog" } },
        clock,
      ),
    ).rejects.toBeInstanceOf(InvalidBookingError);
  });

  it("raises SlotTakenError for an overlapping booking", async () => {
    await createBooking(db, webBooking(at("2030-03-08", "09:00")), clock);
    // 09:30 overlaps 09:00–09:40.
    await expect(
      createBooking(db, webBooking(at("2030-03-08", "09:30")), clock),
    ).rejects.toBeInstanceOf(SlotTakenError);
  });

  it("lets exactly one of several simultaneous requests win", async () => {
    const start = at("2030-03-11", "10:00");
    const results = await Promise.allSettled(
      [1, 2, 3, 4].map(() => createBooking(db, webBooking(start), clock)),
    );
    const won = results.filter((r) => r.status === "fulfilled");
    const lost = results.filter((r) => r.status === "rejected");
    expect(won).toHaveLength(1);
    for (const r of lost) expect(r.reason).toBeInstanceOf(SlotTakenError);
  });

  it("rolls back the new client when the slot is taken", async () => {
    await createBooking(db, webBooking(at("2030-03-12", "09:00")), clock);
    const phone = "082 999 0000";
    await expect(
      createBooking(db, webBooking(at("2030-03-12", "09:00"), phone), clock),
    ).rejects.toBeInstanceOf(SlotTakenError);
    const rows = await db.select().from(client).where(eq(client.phone, "+27829990000"));
    expect(rows).toHaveLength(0);
  });

  it.each([
    ["on a closed day (Sunday)", at("2030-03-03", "10:00")],
    ["outside working hours", at("2030-03-04", "18:00")],
    ["off the slot step", at("2030-03-04", "09:10")],
    ["at too short notice", at("2030-03-01", "15:00")],
    ["beyond the horizon", at("2030-04-15", "09:00")],
  ])("raises SlotUnavailableError %s", async (_label, start) => {
    await expect(createBooking(db, webBooking(start), clock)).rejects.toBeInstanceOf(
      SlotUnavailableError,
    );
  });

  it("raises SlotUnavailableError during time off", async () => {
    await db.insert(timeOff).values({
      during: { start: at("2030-03-13", "00:00"), end: at("2030-03-14", "00:00") },
      reason: "Away",
    });
    await expect(
      createBooking(db, webBooking(at("2030-03-13", "09:00")), clock),
    ).rejects.toBeInstanceOf(SlotUnavailableError);
  });

  it("lets the owner book at short notice for an existing client", async () => {
    const existing = await createBooking(db, webBooking(at("2030-04-10", "15:00")), clock);
    const shortNotice = at("2030-03-01", "15:00");
    const booking = await createBooking(
      db,
      {
        serviceId: humanServiceId,
        start: shortNotice,
        client: { id: existing.clientId },
        source: "app",
      },
      { ...clock, ignoreMinNotice: true },
    );
    expect(booking.clientId).toBe(existing.clientId);
  });

  it("rejects an existing pet that belongs to someone else", async () => {
    const owner = await createBooking(
      db,
      {
        serviceId: animalServiceId,
        start: at("2030-03-15", "09:00"),
        client: { name: "Owner", phone: freshPhone() },
        pet: { name: "Bella", species: "Dog" },
        source: "web",
      },
      clock,
    );
    const other = await createBooking(db, webBooking(at("2030-03-15", "11:00")), clock);
    if (!owner.petId) throw new Error("expected a pet");
    await expect(
      createBooking(
        db,
        {
          serviceId: animalServiceId,
          start: at("2030-03-15", "13:00"),
          client: { id: other.clientId },
          pet: { id: owner.petId },
          source: "app",
        },
        clock,
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("findSlots / findDates", () => {
  it("hides booked times and shows them again after cancelling", async () => {
    const date = "2030-03-18";
    const booking = await createBooking(db, webBooking(at(date, "09:00")), clock);
    const before = await findSlots(db, { serviceId: humanServiceId, date }, clock);
    expect(before.map((d) => d.getTime())).not.toContain(at(date, "09:00").getTime());

    await cancelByOwner(db, booking.appointmentId);
    const after = await findSlots(db, { serviceId: humanServiceId, date }, clock);
    expect(after.map((d) => d.getTime())).toContain(at(date, "09:00").getTime());
  });

  it("lists bookable dates, skipping time off", async () => {
    const dates = await findDates(db, { serviceId: humanServiceId, month: "2030-03" }, clock);
    expect(dates).toContain("2030-03-02");
    expect(dates).not.toContain("2030-03-03"); // Sunday
    expect(dates).not.toContain("2030-03-13"); // time off (above)
  });
});

describe("cancelBookingByToken", () => {
  it("cancels before the cutoff and frees the slot", async () => {
    const start = at("2030-03-19", "09:00");
    const booking = await createBooking(db, webBooking(start), clock);
    const result = await cancelBookingByToken(db, booking.manageToken, { now: NOW });
    expect(result).toEqual({ appointmentId: booking.appointmentId, alreadyCancelled: false });

    const [row] = await db
      .select()
      .from(appointment)
      .where(eq(appointment.id, booking.appointmentId));
    expect(row?.status).toBe("cancelled");
    expect(row?.cancelledAt).toEqual(NOW);
    await expect(createBooking(db, webBooking(start), clock)).resolves.toBeDefined();
  });

  it("is idempotent", async () => {
    const booking = await createBooking(db, webBooking(at("2030-03-19", "11:00")), clock);
    await cancelBookingByToken(db, booking.manageToken, { now: NOW });
    await expect(cancelBookingByToken(db, booking.manageToken, { now: NOW })).resolves.toEqual({
      appointmentId: booking.appointmentId,
      alreadyCancelled: true,
    });
  });

  it("refuses after the cutoff (24 h before)", async () => {
    const start = at("2030-03-20", "09:00");
    const booking = await createBooking(db, webBooking(start), clock);
    const justInTime = new Date(start.getTime() - 24 * 3_600_000);
    const tooLate = new Date(justInTime.getTime() + 1);

    await expect(
      cancelBookingByToken(db, booking.manageToken, { now: tooLate }),
    ).rejects.toBeInstanceOf(CancelTooLateError);
    await expect(
      cancelBookingByToken(db, booking.manageToken, { now: justInTime }),
    ).resolves.toMatchObject({ alreadyCancelled: false });
  });

  it("treats unknown or malformed tokens as not found", async () => {
    await expect(cancelBookingByToken(db, "a".repeat(43))).rejects.toBeInstanceOf(NotFoundError);
    await expect(cancelBookingByToken(db, "short")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("can't cancel a completed appointment", async () => {
    const booking = await createBooking(db, webBooking(at("2030-03-20", "11:00")), clock);
    await markDone(db, booking.appointmentId);
    await expect(
      cancelBookingByToken(db, booking.manageToken, { now: NOW }),
    ).rejects.toBeInstanceOf(InvalidStatusError);
  });
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

describe("products sold", () => {
  it("adds at the current price, increments qty, and removes", async () => {
    const a = await createBooking(db, webBooking(at("2030-03-25", "09:00")), clock);
    const ids = { appointmentId: a.appointmentId, productId };

    const first = await addProductToAppointment(db, ids);
    expect(first.qty).toBe(1);

    // A later price change doesn't affect the recorded sale.
    await db.update(product).set({ priceCents: 1 }).where(eq(product.id, productId));
    const second = await addProductToAppointment(db, { ...ids, qty: 2 });
    expect(second).toEqual({ productId, qty: 3, priceCents: first.priceCents });

    expect(await removeProductFromAppointment(db, ids)).toBe(true);
    expect(await removeProductFromAppointment(db, ids)).toBe(false);
    const lines = await db
      .select()
      .from(appointmentProduct)
      .where(eq(appointmentProduct.appointmentId, a.appointmentId));
    expect(lines).toEqual([]);
  });

  it("refuses cancelled appointments and inactive products", async () => {
    const a = await createBooking(db, webBooking(at("2030-03-25", "11:00")), clock);
    const [inactive] = await db
      .insert(product)
      .values({ name: "Old cream", priceCents: 100, active: false })
      .returning();
    if (!inactive) throw new Error("insert failed");

    await expect(
      addProductToAppointment(db, { appointmentId: a.appointmentId, productId: inactive.id }),
    ).rejects.toBeInstanceOf(NotFoundError);

    await cancelByOwner(db, a.appointmentId);
    await expect(
      addProductToAppointment(db, { appointmentId: a.appointmentId, productId }),
    ).rejects.toBeInstanceOf(InvalidStatusError);
  });
});

describe("spam guard: upcoming bookings per phone", () => {
  it("refuses a third upcoming public booking for the same phone", async () => {
    const phone = freshPhone();
    const opts = { ...clock, maxUpcomingPerClient: 2 };
    await createBooking(db, webBooking(at("2030-03-26", "09:00"), phone), opts);
    await createBooking(db, webBooking(at("2030-03-26", "10:00"), phone), opts);
    await expect(
      createBooking(db, webBooking(at("2030-03-26", "11:00"), phone), opts),
    ).rejects.toBeInstanceOf(TooManyBookingsError);
  });

  it("doesn't count cancelled or past bookings", async () => {
    const phone = freshPhone();
    const opts = { ...clock, maxUpcomingPerClient: 1 };
    const first = await createBooking(db, webBooking(at("2030-03-27", "09:00"), phone), opts);
    await cancelByOwner(db, first.appointmentId);
    await expect(
      createBooking(db, webBooking(at("2030-03-27", "10:00"), phone), opts),
    ).resolves.toBeDefined();
  });

  it("doesn't apply when no limit is given (owner bookings)", async () => {
    const phone = freshPhone();
    for (const time of ["09:00", "10:00", "11:00"]) {
      await createBooking(db, webBooking(at("2030-03-28", time), phone), clock);
    }
  });
});

describe("getBookingByToken", () => {
  it("returns the client-facing view, with the end time excluding the buffer", async () => {
    const start = at("2030-03-29", "09:00");
    const booking = await createBooking(db, webBooking(start), clock);
    const view = await getBookingByToken(db, booking.manageToken, { now: NOW });
    expect(view).toMatchObject({
      appointmentId: booking.appointmentId,
      status: "booked",
      start,
      end: at("2030-03-29", "09:30"),
      clientName: "Test Client",
      petName: null,
      canCancel: true,
    });
    expect(view?.cancelDeadline).toEqual(at("2030-03-28", "09:00"));
  });

  it("says when it's too late to cancel", async () => {
    const start = at("2030-03-29", "11:00");
    const booking = await createBooking(db, webBooking(start), clock);
    const view = await getBookingByToken(db, booking.manageToken, {
      now: at("2030-03-28", "12:00"),
    });
    expect(view?.canCancel).toBe(false);
  });

  it("returns null for unknown or malformed tokens", async () => {
    expect(await getBookingByToken(db, "x".repeat(43))).toBeNull();
    expect(await getBookingByToken(db, "../etc")).toBeNull();
  });
});

describe("cancel grace period", () => {
  it("lets a client cancel a late booking within an hour of making it", async () => {
    // Booked at 20:00 the evening before a 09:00 session: inside the 24 h cutoff.
    const start = at("2030-04-01", "09:00");
    const madeAt = at("2030-03-31", "20:00");
    const booking = await createBooking(db, webBooking(start), {
      tz: TZ,
      now: new Date("2030-03-25T06:00:00Z"),
    });
    await db
      .update(appointment)
      .set({ createdAt: madeAt })
      .where(eq(appointment.id, booking.appointmentId));

    const inGrace = new Date(madeAt.getTime() + 30 * 60_000);
    const view = await getBookingByToken(db, booking.manageToken, { now: inGrace });
    expect(view?.canCancel).toBe(true);
    expect(view?.cancelDeadline).toEqual(at("2030-03-31", "21:00"));

    const afterGrace = new Date(madeAt.getTime() + 61 * 60_000);
    await expect(
      cancelBookingByToken(db, booking.manageToken, { now: afterGrace }),
    ).rejects.toBeInstanceOf(CancelTooLateError);
    await expect(
      cancelBookingByToken(db, booking.manageToken, { now: inGrace }),
    ).resolves.toMatchObject({ alreadyCancelled: false });
  });
});

describe("price snapshot", () => {
  it("stores the service price when booked, unaffected by later price changes", async () => {
    const booking = await createBooking(db, webBooking(at("2030-04-02", "14:00")), clock);
    const [svc] = await db.select().from(service).where(eq(service.id, humanServiceId));
    const original = svc?.priceCents ?? 0;
    await db
      .update(service)
      .set({ priceCents: original + 10_000 })
      .where(eq(service.id, humanServiceId));
    try {
      const [row] = await db
        .select({ priceCents: appointment.priceCents })
        .from(appointment)
        .where(eq(appointment.id, booking.appointmentId));
      expect(row?.priceCents).toBe(original);
    } finally {
      await db.update(service).set({ priceCents: original }).where(eq(service.id, humanServiceId));
    }
  });
});
