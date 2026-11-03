import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Database } from "@/db/client";
import { appointmentProduct, product, service } from "@/db/schema";
import { seed } from "@/db/seed";
import { testDatabaseUrl } from "@/test/database";
import { resetBusinessTables } from "@/test/reset";
import { createBooking } from "./booking";
import { addProductToAppointment, removeProductFromAppointment } from "./booking-products";
import { cancelByOwner } from "./booking-status";
import { InvalidStatusError, NotFoundError } from "./errors";
import { zonedInstant } from "./time";

const TZ = "Africa/Johannesburg";
/** Friday 1 March 2030, 08:00 local. */
const NOW = new Date("2030-03-01T06:00:00Z");
const clock = { tz: TZ, now: NOW };

let db: Database;
let humanServiceId: string;
let productId: string;

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
  const [prod] = await db.select().from(product).orderBy(asc(product.sortOrder)).limit(1);
  productId = prod?.id ?? "";
});

afterAll(async () => {
  await db.$client.end();
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
