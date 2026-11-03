import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Database } from "@/db/client";
import { appointment, client, pet, product, service } from "@/db/schema";
import { seed } from "@/db/seed";
import { testDatabaseUrl } from "@/test/database";
import { resetBusinessTables } from "@/test/reset";
import { firstLine, getAppointmentDetail, listDay } from "./appointments";
import { createBooking } from "./booking";
import { addProductToAppointment } from "./booking-products";
import {
  cancelByOwner,
  markDone,
  markNoShow,
  updateAppointmentNotes,
  undoStatus,
} from "./booking-status";
import { InvalidStatusError, NotFoundError, SlotTakenError } from "./errors";
import { zonedInstant } from "./time";

const TZ = "Africa/Johannesburg";
const clock = { tz: TZ, now: new Date("2030-06-01T06:00:00Z") };
const DAY = "2030-06-04"; // Tuesday

let db: Database;
let humanServiceId: string;
let animalServiceId: string;
let productId: string;

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
  animalServiceId = services.find((s) => s.forKind === "animal")?.id ?? "";
  const [prod] = await db.select().from(product).orderBy(asc(product.sortOrder)).limit(1);
  productId = prod?.id ?? "";
});

afterAll(async () => {
  await db.$client.end();
});

describe("listDay", () => {
  it("lists the day's non-cancelled appointments in time order, without the buffer", async () => {
    const later = await createBooking(
      db,
      {
        serviceId: animalServiceId,
        start: at(DAY, "11:00"),
        client: { name: "Dog Owner", phone: "0820000001" },
        pet: { name: "Rex", species: "Dog" },
        source: "web",
      },
      clock,
    );
    const earlier = await createBooking(
      db,
      {
        serviceId: humanServiceId,
        start: at(DAY, "09:00"),
        client: { name: "Thandi", phone: "0820000002" },
        source: "app",
      },
      clock,
    );
    const cancelled = await createBooking(
      db,
      {
        serviceId: humanServiceId,
        start: at(DAY, "14:00"),
        client: { name: "Gone", phone: "0820000003" },
        source: "web",
      },
      clock,
    );
    await cancelByOwner(db, cancelled.appointmentId);
    // Another day: not listed.
    await createBooking(
      db,
      {
        serviceId: humanServiceId,
        start: at("2030-06-05", "09:00"),
        client: { name: "Tomorrow", phone: "0820000004" },
        source: "web",
      },
      clock,
    );

    const day = await listDay(db, DAY, TZ);
    expect(day.map((a) => a.id)).toEqual([earlier.appointmentId, later.appointmentId]);
    expect(day[0]).toMatchObject({
      clientName: "Thandi",
      petName: null,
      start: at(DAY, "09:00"),
      end: at(DAY, "09:30"),
      status: "booked",
    });
    expect(day[1]).toMatchObject({ clientName: "Dog Owner", petName: "Rex", petSpecies: "Dog" });
  });

  it("returns an empty list for a day without bookings", async () => {
    expect(await listDay(db, "2030-06-09", TZ)).toEqual([]);
  });
});

describe("getAppointmentDetail", () => {
  it("includes client, pet, notes, products and earlier visits for the same pet", async () => {
    const phone = "0820000010";
    const book = (date: string, petName: string) =>
      createBooking(
        db,
        {
          serviceId: animalServiceId,
          start: at(date, "10:00"),
          client: { name: "Annelie", phone },
          pet: { name: petName, species: "Dog", breed: "Collie" },
          source: "web",
        },
        clock,
      );
    const first = await book("2030-06-10", "Bella");
    const second = await book("2030-06-11", "Bella");
    const otherPet = await book("2030-06-12", "Max");
    const current = await book("2030-06-13", "Bella");

    await updateAppointmentNotes(db, {
      appointmentId: first.appointmentId,
      notes: "Hips, 6 min\nCalm",
    });
    await markDone(db, first.appointmentId);
    await markNoShow(db, second.appointmentId); // shown as "didn't come"
    await markDone(db, otherPet.appointmentId); // different pet
    await db
      .update(client)
      .set({ notes: "Prefers mornings" })
      .where(eq(client.id, current.clientId));
    await db
      .update(pet)
      .set({ notes: "Nervous of men" })
      .where(eq(pet.id, current.petId ?? ""));
    await addProductToAppointment(db, { appointmentId: current.appointmentId, productId, qty: 2 });

    const detail = await getAppointmentDetail(db, current.appointmentId);
    expect(detail).toMatchObject({
      status: "booked",
      start: at("2030-06-13", "10:00"),
      client: { name: "Annelie", phone: "+27820000010", notes: "Prefers mornings" },
      pet: { name: "Bella", species: "Dog", breed: "Collie", notes: "Nervous of men" },
      products: [{ productId, qty: 2 }],
    });
    expect(detail?.previousVisits).toEqual([
      {
        id: second.appointmentId,
        status: "no_show",
        start: at("2030-06-11", "10:00"),
        serviceName: expect.any(String),
        notesFirstLine: "",
      },
      {
        id: first.appointmentId,
        status: "done",
        start: at("2030-06-10", "10:00"),
        serviceName: expect.any(String),
        notesFirstLine: "Hips, 6 min",
      },
    ]);
  });

  it("returns null for unknown or malformed ids", async () => {
    expect(await getAppointmentDetail(db, "00000000-0000-4000-8000-000000000000")).toBeNull();
    expect(await getAppointmentDetail(db, "nope")).toBeNull();
  });
});

describe("previous visits", () => {
  it("include cancelled ones but not upcoming bookings", async () => {
    const phone = "0820000040";
    const book = (date: string) =>
      createBooking(
        db,
        {
          serviceId: humanServiceId,
          start: at(date, "15:00"),
          client: { name: "History", phone },
          source: "web",
        },
        clock,
      );
    const cancelled = await book("2030-06-19");
    const stillBooked = await book("2030-06-20");
    const current = await book("2030-06-21");
    await cancelByOwner(db, cancelled.appointmentId);

    const detail = await getAppointmentDetail(db, current.appointmentId);
    expect(detail?.previousVisits.map((v) => [v.id, v.status])).toEqual([
      [cancelled.appointmentId, "cancelled"],
    ]);
    expect(detail?.previousVisits.map((v) => v.id)).not.toContain(stillBooked.appointmentId);
  });
});

describe("done keeps its time", () => {
  it("doesn't free the slot when a visit is marked done", async () => {
    const start = at("2030-06-24", "09:00");
    const a = await createBooking(
      db,
      {
        serviceId: humanServiceId,
        start,
        client: { name: "Done", phone: "0820000050" },
        source: "app",
      },
      clock,
    );
    await markDone(db, a.appointmentId);
    await expect(
      createBooking(
        db,
        {
          serviceId: humanServiceId,
          start,
          client: { name: "Other", phone: "0820000051" },
          source: "app",
        },
        clock,
      ),
    ).rejects.toBeInstanceOf(SlotTakenError);
    // ...so undoing "done" can never clash.
    await undoStatus(db, a.appointmentId);
  });
});

describe("undoStatus", () => {
  it("puts a done or no-show appointment back to booked", async () => {
    const a = await createBooking(
      db,
      {
        serviceId: humanServiceId,
        start: at("2030-06-17", "09:00"),
        client: { name: "Undo", phone: "0820000020" },
        source: "web",
      },
      clock,
    );
    await markDone(db, a.appointmentId);
    await undoStatus(db, a.appointmentId);
    await markNoShow(db, a.appointmentId);
    await undoStatus(db, a.appointmentId);
    const [row] = await db.select().from(appointment).where(eq(appointment.id, a.appointmentId));
    expect(row?.status).toBe("booked");
  });

  it("refuses booked/cancelled appointments and unknown ids", async () => {
    const a = await createBooking(
      db,
      {
        serviceId: humanServiceId,
        start: at("2030-06-17", "11:00"),
        client: { name: "Undo", phone: "0820000020" },
        source: "web",
      },
      clock,
    );
    await expect(undoStatus(db, a.appointmentId)).rejects.toBeInstanceOf(InvalidStatusError);
    await cancelByOwner(db, a.appointmentId);
    await expect(undoStatus(db, a.appointmentId)).rejects.toBeInstanceOf(InvalidStatusError);
    await expect(undoStatus(db, "00000000-0000-4000-8000-000000000000")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("raises SlotTakenError if the time has been booked since", async () => {
    const a = await createBooking(
      db,
      {
        serviceId: humanServiceId,
        start: at("2030-06-18", "09:00"),
        client: { name: "Missed", phone: "0820000030" },
        source: "web",
      },
      clock,
    );
    await markNoShow(db, a.appointmentId);
    // The freed slot gets booked by someone else.
    await createBooking(
      db,
      {
        serviceId: humanServiceId,
        start: at("2030-06-18", "09:00"),
        client: { name: "Walk-in", phone: "0820000031" },
        source: "app",
      },
      clock,
    );
    await expect(undoStatus(db, a.appointmentId)).rejects.toBeInstanceOf(SlotTakenError);
  });
});

describe("firstLine", () => {
  it("returns the first non-empty line, trimmed", () => {
    expect(firstLine("  Left knee \nsecond")).toBe("Left knee");
    expect(firstLine("")).toBe("");
  });
});
