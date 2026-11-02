import { asc, count, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testDatabaseUrl } from "@/test/database";
import { createDb, type Database } from "./client";
import { product, service, settings, workingHours } from "./schema";
import { seed, SEED_PRODUCTS, SEED_SERVICES, SEED_WORKING_HOURS } from "./seed";

let db: Database;

beforeAll(async () => {
  db = createDb(testDatabaseUrl(), { max: 1 });
  await db.execute(
    sql`truncate appointment_product, appointment, pet, client, service, product, working_hours, settings, time_off`,
  );
});

afterAll(async () => {
  await db.$client.end();
});

describe("seed", () => {
  it("fills an empty database", async () => {
    expect(await seed(db)).toEqual({
      settings: 1,
      workingHours: SEED_WORKING_HOURS.length,
      services: SEED_SERVICES.length,
      products: SEED_PRODUCTS.length,
    });

    const [row] = await db.select().from(settings);
    expect(row).toMatchObject({
      minNoticeHours: 12,
      maxDaysAhead: 42,
      slotStepMin: 30,
      cancelCutoffHours: 24,
    });

    const hours = await db
      .select({
        weekday: workingHours.weekday,
        start: workingHours.startTime,
        end: workingHours.endTime,
      })
      .from(workingHours)
      .orderBy(asc(workingHours.weekday));
    expect(hours).toEqual([
      ...[1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: "09:00:00", end: "17:00:00" })),
      { weekday: 6, start: "09:00:00", end: "13:00:00" },
    ]);

    const kinds = await db
      .select({ kind: service.forKind, n: count() })
      .from(service)
      .groupBy(service.forKind)
      .orderBy(asc(service.forKind));
    expect(kinds).toEqual([
      { kind: "human", n: 3 },
      { kind: "animal", n: 3 },
    ]);
  });

  it("is idempotent and never touches edited rows", async () => {
    await db.update(settings).set({ minNoticeHours: 2 });
    await db.update(product).set({ priceCents: 99 });

    expect(await seed(db)).toEqual({ settings: 0, workingHours: 0, services: 0, products: 0 });

    const [row] = await db.select().from(settings);
    expect(row?.minNoticeHours).toBe(2);
    const [products] = await db.select({ n: count() }).from(product);
    expect(products?.n).toBe(3);
    const [services] = await db.select({ n: count() }).from(service);
    expect(services?.n).toBe(6);
  });
});
