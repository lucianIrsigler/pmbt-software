import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Database } from "@/db/client";
import { client, service } from "@/db/schema";
import { seed } from "@/db/seed";
import { testDatabaseUrl } from "@/test/database";
import { resetBusinessTables } from "@/test/reset";
import { servicesBookableAt } from "./availability";
import { createBooking } from "./booking";
import {
  countArchivedClients,
  createClient,
  createPet,
  getClientWithPets,
  listArchivedClients,
  searchClients,
} from "./clients";
import { NotFoundError, SlotUnavailableError } from "./errors";
import { addTimeOff } from "./time-off";
import { zonedInstant } from "./time";

const TZ = "Africa/Johannesburg";
/** Monday 3 June 2030, 10:05 local. Seeded settings: 12 h notice, 42 days ahead. */
const NOW = new Date("2030-06-03T08:05:00Z");
const clock = { tz: TZ, now: NOW };
const OWNER = { ...clock, ignoreMinNotice: true, ignoreHorizon: true };

let db: Database;
let humanServiceId: string; // 30 min + 10 buffer

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

describe("createClient / createPet", () => {
  it("creates a client with a normalised phone, and reuses them by phone", async () => {
    const id = (await createClient(db, { name: "Annelie Botha", phone: "082 300 0001" })).id;
    const [row] = await db.select().from(client).where(eq(client.id, id));
    expect(row).toMatchObject({ name: "Annelie Botha", phone: "+27823000001" });

    const again = await createClient(db, { name: "A. Botha", phone: "+27 82 300 0001" });
    expect(again).toEqual({ id, existing: true });
  });

  it("adds pets, reusing one with the same name", async () => {
    const clientId = (await createClient(db, { name: "Pet Owner", phone: "0823000002" })).id;
    const rex = await createPet(db, clientId, { name: "Rex", species: "Dog", breed: "" });
    expect(await createPet(db, clientId, { name: "rex", species: "Dog" })).toBe(rex);
    await createPet(db, clientId, { name: "Bella", species: "Cat", breed: "Siamese" });

    const found = await getClientWithPets(db, clientId);
    expect(found?.pets.map((p) => [p.name, p.species, p.breed])).toEqual([
      ["Bella", "Cat", "Siamese"],
      ["Rex", "Dog", null],
    ]);
  });

  it("refuses a pet for an unknown client, and validates input", async () => {
    await expect(
      createPet(db, "00000000-0000-4000-8000-000000000000", { name: "X", species: "Dog" }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(createClient(db, { name: " ", phone: "123" })).rejects.toThrow();
    expect(await getClientWithPets(db, "nope")).toBeNull();
  });
});

describe("searchClients", () => {
  beforeAll(async () => {
    await createClient(db, { name: "Thandi Mokoena", phone: "0824441111" });
    await createClient(db, { name: "Thandeka Dlamini", phone: "0835552222" });
    const archived = (await createClient(db, { name: "Thandi Archived", phone: "0846663333" })).id;
    await db.update(client).set({ archivedAt: new Date() }).where(eq(client.id, archived));
  });

  it("finds clients by part of their name, ignoring case, without archived ones", async () => {
    const names = (await searchClients(db, "thand")).map((c) => c.name);
    expect(names).toEqual(["Thandeka Dlamini", "Thandi Mokoena"]);
  });

  it("finds clients by phone, typed with a leading 0 or spaces", async () => {
    expect((await searchClients(db, "082 444")).map((c) => c.name)).toEqual(["Thandi Mokoena"]);
    expect((await searchClients(db, "5552222")).map((c) => c.name)).toEqual(["Thandeka Dlamini"]);
  });

  it("shows pet names to tell clients apart", async () => {
    const [owner] = await searchClients(db, "Pet Owner");
    expect(owner?.petNames).toBe("Bella, Rex");
  });

  it("needs at least two characters and treats LIKE wildcards literally", async () => {
    expect(await searchClients(db, "t")).toEqual([]);
    expect(await searchClients(db, "%%")).toEqual([]);
    expect(await searchClients(db, "__")).toEqual([]);
  });
});

describe("archived clients", () => {
  it("lists only archived clients, and says who is archived", async () => {
    const archived = await listArchivedClients(db);
    expect(archived.map((c) => c.name)).toEqual(["Thandi Archived"]);
    expect(await countArchivedClients(db)).toBe(1);

    const [one] = archived;
    expect((await getClientWithPets(db, one?.id ?? ""))?.archived).toBe(true);
    const [current] = await searchClients(db, "Thandi Mokoena");
    expect((await getClientWithPets(db, current?.id ?? ""))?.archived).toBe(false);
  });
});

describe("owner bookings", () => {
  const TUESDAY = "2030-06-04";

  it("can be made at short notice", async () => {
    const clientId = (await createClient(db, { name: "Short Notice", phone: "0827770001" })).id;
    const booking = await createBooking(
      db,
      {
        serviceId: humanServiceId,
        start: at("2030-06-03", "11:00"),
        client: { id: clientId },
        source: "app",
      },
      OWNER,
    );
    expect(booking.clientId).toBe(clientId);
    await expect(
      createBooking(
        db,
        {
          serviceId: humanServiceId,
          start: at("2030-06-03", "11:30"),
          client: { id: clientId },
          source: "web",
        },
        clock,
      ),
    ).rejects.toBeInstanceOf(SlotUnavailableError);
  });

  it("can be made beyond the public booking horizon", async () => {
    const clientId = (await createClient(db, { name: "Far Ahead", phone: "0827770002" })).id;
    const start = at("2030-09-02", "09:00"); // 91 days ahead
    await expect(
      createBooking(
        db,
        { serviceId: humanServiceId, start, client: { id: clientId }, source: "app" },
        clock,
      ),
    ).rejects.toBeInstanceOf(SlotUnavailableError);
    await expect(
      createBooking(
        db,
        { serviceId: humanServiceId, start, client: { id: clientId }, source: "app" },
        OWNER,
      ),
    ).resolves.toMatchObject({ clientId });
  });

  it("only offers services that fit before the next booking, closing or time off", async () => {
    const clientId = (await createClient(db, { name: "Fit Check", phone: "0827770003" })).id;
    await createBooking(
      db,
      {
        serviceId: humanServiceId,
        start: at(TUESDAY, "10:00"),
        client: { id: clientId },
        source: "app",
      },
      OWNER,
    );
    await addTimeOff(
      db,
      { date: TUESDAY, kind: "times", startTime: "14:00", endTime: "15:00" },
      clock,
    );

    const durations = async (hhmm: string) =>
      (await servicesBookableAt(db, at(TUESDAY, hhmm), "human", clock)).map((s) => s.durationMin);

    const all = await durations("11:00");
    expect(all.length).toBeGreaterThan(1);
    // 09:00 leaves an hour before the 10:00 booking: only services up to 50 min (+10 buffer) fit.
    expect((await durations("09:00")).every((d) => d <= 50)).toBe(true);
    expect(await durations("10:00")).toEqual([]);
    expect(await durations("14:00")).toEqual([]);
    expect(await durations("16:30")).toEqual([]); // 30 min + 10 buffer runs past 17:00
    expect(await servicesBookableAt(db, at("2030-06-02", "10:00"), "human", clock)).toEqual([]); // Sunday
    expect(await servicesBookableAt(db, at("2030-06-03", "09:00"), "human", clock)).toEqual([]); // past
  });
});
