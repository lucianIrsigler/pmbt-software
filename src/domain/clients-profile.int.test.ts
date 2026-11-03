import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Database } from "@/db/client";
import { appointment, client, pet, service } from "@/db/schema";
import { seed } from "@/db/seed";
import { testDatabaseUrl } from "@/test/database";
import { resetBusinessTables } from "@/test/reset";
import {
  cancelByOwner,
  createBooking,
  markDone,
  markNoShow,
  updateAppointmentNotes,
} from "./booking";
import {
  archiveClient,
  archivePet,
  countUpcomingBookings,
  createClient,
  createPet,
  getClientProfile,
  getPet,
  listClientVisits,
  listRecentClients,
  searchClients,
  unarchiveClient,
  unarchivePet,
  updateClient,
  updateClientNotes,
  updatePet,
  updatePetNotes,
} from "./clients";
import { NotFoundError, PhoneInUseError } from "./errors";
import { zonedInstant } from "./time";

const TZ = "Africa/Johannesburg";
/** Wednesday 12 June 2030, 12:00 local. */
const NOW = new Date("2030-06-12T10:00:00Z");
const OWNER = { tz: TZ, now: NOW, ignoreMinNotice: true, ignoreHorizon: true };
/** Bookings in the past are made with an earlier clock. */
const PAST = { ...OWNER, now: new Date("2030-05-01T06:00:00Z") };

let db: Database;
let humanServiceId: string;
let animalServiceId: string;

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
});

afterAll(async () => {
  await db.$client.end();
});

async function book(
  clientId: string,
  start: Date,
  opts: { petId?: string; clock?: typeof OWNER } = {},
): Promise<string> {
  const booking = await createBooking(
    db,
    {
      serviceId: opts.petId ? animalServiceId : humanServiceId,
      start,
      client: { id: clientId },
      ...(opts.petId ? { pet: { id: opts.petId } } : {}),
      source: "app",
    },
    opts.clock ?? OWNER,
  );
  return booking.appointmentId;
}

describe("client profile and visits", () => {
  it("shows details, current and archived pets", async () => {
    const id = (
      await createClient(db, {
        name: "Lindiwe Profile",
        phone: "0831000001",
        email: "LINDI@Example.com",
      })
    ).id;
    const rex = await createPet(db, id, { name: "Rex", species: "Dog" });
    const old = await createPet(db, id, { name: "Old Tom", species: "Cat" });
    await archivePet(db, old, NOW);

    const profile = await getClientProfile(db, id);
    expect(profile).toMatchObject({
      name: "Lindiwe Profile",
      phone: "+27831000001",
      email: "lindi@example.com",
      notes: "",
      archivedAt: null,
    });
    expect(profile?.pets.map((p) => p.id)).toEqual([rex]);
    expect(profile?.archivedPets.map((p) => p.name)).toEqual(["Old Tom"]);
    expect(await getClientProfile(db, "not-a-uuid")).toBeNull();
  });

  it("lists upcoming visits soonest first and the rest newest first, labelled", async () => {
    const id = (await createClient(db, { name: "History Client", phone: "0831000002" })).id;
    const dog = await createPet(db, id, { name: "Bella", species: "Dog" });

    const done = await book(id, at("2030-05-06", "09:00"), { clock: PAST });
    await markDone(db, done);
    await updateAppointmentNotes(db, {
      appointmentId: done,
      notes: "Left hip, 8 min\nBetter after",
    });
    const missed = await book(id, at("2030-05-13", "09:00"), { petId: dog, clock: PAST });
    await markNoShow(db, missed);
    const cancelled = await book(id, at("2030-05-20", "09:00"), { clock: PAST });
    await cancelByOwner(db, cancelled);
    const later = await book(id, at("2030-06-20", "10:00"));
    const sooner = await book(id, at("2030-06-14", "10:00"), { petId: dog });

    const visits = await listClientVisits(db, id, NOW);
    expect(visits.upcoming.map((v) => v.id)).toEqual([sooner, later]);
    expect(visits.upcoming[0]?.petName).toBe("Bella");
    expect(visits.past.map((v) => [v.id, v.status])).toEqual([
      [cancelled, "cancelled"],
      [missed, "no_show"],
      [done, "done"],
    ]);
    expect(visits.past[2]?.notesFirstLine).toBe("Left hip, 8 min");
  });
});

describe("editing", () => {
  it("updates details and notes", async () => {
    const id = (await createClient(db, { name: "Edit Me", phone: "0831000003" })).id;
    await updateClient(db, id, { name: "Edited Name", phone: "083 100 0099", email: "" });
    await updateClientNotes(db, { clientId: id, notes: "Prefers mornings" });
    expect(await getClientProfile(db, id)).toMatchObject({
      name: "Edited Name",
      phone: "+27831000099",
      email: null,
      notes: "Prefers mornings",
    });
  });

  it("refuses another current client's phone number, but not an archived one's", async () => {
    const a = (await createClient(db, { name: "Phone A", phone: "0831000004" })).id;
    const b = (await createClient(db, { name: "Phone B", phone: "0831000005" })).id;
    await expect(
      updateClient(db, b, { name: "Phone B", phone: "0831000004" }),
    ).rejects.toBeInstanceOf(PhoneInUseError);
    // Keeping your own number is fine.
    await updateClient(db, a, { name: "Phone A2", phone: "0831000004" });

    await archiveClient(db, a, NOW);
    await updateClient(db, b, { name: "Phone B", phone: "0831000004" });
    const [row] = await db.select().from(client).where(eq(client.id, b));
    expect(row?.phone).toBe("+27831000004");
  });

  it("updates pets and their notes, only for their own client", async () => {
    const id = (await createClient(db, { name: "Pet Editor", phone: "0831000006" })).id;
    const other = (await createClient(db, { name: "Someone Else", phone: "0831000007" })).id;
    const petId = await createPet(db, id, { name: "Max", species: "Dog" });
    await updatePet(db, petId, { name: "Maxi", species: "Dog", breed: "Beagle" });
    await updatePetNotes(db, { petId, notes: "Nervous of the light" });

    expect(await getPet(db, id, petId)).toMatchObject({
      name: "Maxi",
      breed: "Beagle",
      notes: "Nervous of the light",
      clientName: "Pet Editor",
      archivedAt: null,
    });
    expect(await getPet(db, other, petId)).toBeNull();
    await expect(
      updatePet(db, "00000000-0000-4000-8000-000000000000", { name: "X", species: "Dog" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("archiving", () => {
  it("archives a client, cancels upcoming bookings only, and hides them", async () => {
    const id = (await createClient(db, { name: "Zanele Archive", phone: "0831000008" })).id;
    const past = await book(id, at("2030-05-07", "09:00"), { clock: PAST });
    const future1 = await book(id, at("2030-06-17", "09:00"));
    const future2 = await book(id, at("2030-06-18", "09:00"));

    expect(await countUpcomingBookings(db, { clientId: id }, NOW)).toBe(2);
    expect((await archiveClient(db, id, NOW)).sort()).toEqual([future1, future2].sort());

    const statuses = await db
      .select({ id: appointment.id, status: appointment.status })
      .from(appointment)
      .where(eq(appointment.clientId, id));
    expect(Object.fromEntries(statuses.map((r) => [r.id, r.status]))).toEqual({
      [past]: "booked", // in the past and not marked yet: left for her to mark
      [future1]: "cancelled",
      [future2]: "cancelled",
    });
    expect(await searchClients(db, "Zanele")).toEqual([]);
    expect((await listRecentClients(db)).map((c) => c.id)).not.toContain(id);
    expect((await getClientProfile(db, id))?.archivedAt).toEqual(NOW);

    await unarchiveClient(db, id);
    expect((await searchClients(db, "Zanele")).map((c) => c.id)).toEqual([id]);
    expect(await countUpcomingBookings(db, { clientId: id }, NOW)).toBe(0);
  });

  it("archives a pet and cancels only that pet's upcoming bookings", async () => {
    const id = (await createClient(db, { name: "Two Dogs", phone: "0831000009" })).id;
    const gone = await createPet(db, id, { name: "Gone", species: "Dog" });
    const stays = await createPet(db, id, { name: "Stays", species: "Dog" });
    const goneBooking = await book(id, at("2030-06-19", "09:00"), { petId: gone });
    const staysBooking = await book(id, at("2030-06-19", "10:00"), { petId: stays });

    expect(await countUpcomingBookings(db, { petId: gone }, NOW)).toBe(1);
    expect(await archivePet(db, gone, NOW)).toEqual([goneBooking]);
    const rows = await db
      .select({ id: appointment.id, status: appointment.status })
      .from(appointment)
      .where(eq(appointment.clientId, id));
    expect(Object.fromEntries(rows.map((r) => [r.id, r.status]))).toEqual({
      [goneBooking]: "cancelled",
      [staysBooking]: "booked",
    });
    const [row] = await db.select().from(pet).where(eq(pet.id, gone));
    expect(row?.archivedAt).toEqual(NOW);

    await unarchivePet(db, gone);
    expect((await getClientProfile(db, id))?.pets.map((p) => p.name)).toEqual(["Gone", "Stays"]);
  });

  it("orders recent clients by their latest appointment", async () => {
    const recent = await listRecentClients(db);
    expect(recent.length).toBeGreaterThan(0);
    expect(recent.length).toBeLessThanOrEqual(20);
    // "History Client" has a booking on 20 June, later than anyone else's.
    expect(recent[0]?.name).toBe("History Client");
  });
});
