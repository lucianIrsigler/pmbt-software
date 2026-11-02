import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testDatabaseUrl } from "@/test/database";
import { createDb, type Database } from "./client";
import { PG_ERROR, pgErrorCode } from "./errors";
import { appointment, client, pet, service, settings, workingHours } from "./schema";

let db: Database;

beforeAll(() => {
  db = createDb(testDatabaseUrl(), { max: 2 });
});

afterAll(async () => {
  await db.$client.end();
});

async function expectPgError(promise: Promise<unknown>, code: string): Promise<void> {
  const error: unknown = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error, `expected SQLSTATE ${code}`).toBeDefined();
  expect(pgErrorCode(error)).toBe(code);
}

async function makeFixtures(): Promise<{ clientId: string; serviceId: string }> {
  const [c] = await db
    .insert(client)
    .values({ name: "Test Client", phone: "+27820000000" })
    .returning();
  const [s] = await db
    .insert(service)
    .values({ name: "Test service", forKind: "human", durationMin: 30, priceCents: 1000 })
    .returning();
  if (!c || !s) throw new Error("fixture insert failed");
  return { clientId: c.id, serviceId: s.id };
}

function slot(startIso: string, minutes: number): { start: Date; end: Date } {
  const start = new Date(startIso);
  return { start, end: new Date(start.getTime() + minutes * 60_000) };
}

function bookingValues(
  ids: { clientId: string; serviceId: string },
  during: { start: Date; end: Date },
  status: "booked" | "cancelled" = "booked",
): typeof appointment.$inferInsert {
  return {
    ...ids,
    during,
    status,
    source: "web",
    manageToken: randomBytes(32).toString("base64url"),
    cancelledAt: status === "cancelled" ? new Date() : null,
  };
}

describe("appointment_no_overlap", () => {
  it("rejects two overlapping booked appointments with 23P01", async () => {
    const ids = await makeFixtures();
    await db.insert(appointment).values(bookingValues(ids, slot("2030-01-07T07:00:00Z", 40)));

    await expectPgError(
      db.insert(appointment).values(bookingValues(ids, slot("2030-01-07T07:30:00Z", 40))),
      PG_ERROR.exclusionViolation,
    );
  });

  it("allows an overlap when one of the appointments is cancelled", async () => {
    const ids = await makeFixtures();
    await db
      .insert(appointment)
      .values(bookingValues(ids, slot("2030-01-08T07:00:00Z", 40), "cancelled"));

    const rows = await db
      .insert(appointment)
      .values(bookingValues(ids, slot("2030-01-08T07:30:00Z", 40)))
      .returning({ id: appointment.id });
    expect(rows).toHaveLength(1);
  });

  it("allows back-to-back appointments (ranges are half-open)", async () => {
    const ids = await makeFixtures();
    await db.insert(appointment).values(bookingValues(ids, slot("2030-01-09T07:00:00Z", 40)));
    const rows = await db
      .insert(appointment)
      .values(bookingValues(ids, slot("2030-01-09T07:40:00Z", 40)))
      .returning({ id: appointment.id });
    expect(rows).toHaveLength(1);
  });

  it("rejects re-booking a cancelled appointment onto a taken slot", async () => {
    const ids = await makeFixtures();
    const [cancelled] = await db
      .insert(appointment)
      .values(bookingValues(ids, slot("2030-01-10T07:00:00Z", 40), "cancelled"))
      .returning({ id: appointment.id });
    await db.insert(appointment).values(bookingValues(ids, slot("2030-01-10T07:00:00Z", 40)));
    if (!cancelled) throw new Error("fixture insert failed");

    await expectPgError(
      db
        .update(appointment)
        .set({ status: "booked", cancelledAt: null })
        .where(eq(appointment.id, cancelled.id)),
      PG_ERROR.exclusionViolation,
    );
  });
});

describe("schema constraints", () => {
  it("round-trips tstzrange values", async () => {
    const ids = await makeFixtures();
    const during = slot("2030-02-04T07:00:00Z", 70);
    const [row] = await db
      .insert(appointment)
      .values(bookingValues(ids, during))
      .returning({ during: appointment.during });
    expect(row?.during).toEqual(during);
  });

  it("rejects a pet that belongs to a different client", async () => {
    const ids = await makeFixtures();
    const other = await makeFixtures();
    const [otherPet] = await db
      .insert(pet)
      .values({ clientId: other.clientId, name: "Rex", species: "dog" })
      .returning();
    if (!otherPet) throw new Error("fixture insert failed");

    await expectPgError(
      db
        .insert(appointment)
        .values({ ...bookingValues(ids, slot("2030-02-05T07:00:00Z", 40)), petId: otherPet.id }),
      PG_ERROR.foreignKeyViolation,
    );
  });

  it("requires cancelled_at exactly when status is cancelled", async () => {
    const ids = await makeFixtures();
    await expectPgError(
      db.insert(appointment).values({
        ...bookingValues(ids, slot("2030-02-06T07:00:00Z", 40)),
        cancelledAt: new Date(),
      }),
      PG_ERROR.checkViolation,
    );
  });

  it("allows only one settings row", async () => {
    await expectPgError(
      db.insert(settings).values({ id: 2, businessName: "Second" }),
      PG_ERROR.checkViolation,
    );
  });

  it("rejects working hours that end before they start", async () => {
    await expectPgError(
      db.insert(workingHours).values({ weekday: 1, startTime: "17:00", endTime: "09:00" }),
      PG_ERROR.checkViolation,
    );
  });
});
