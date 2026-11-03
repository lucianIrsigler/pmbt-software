import { randomBytes } from "node:crypto";
import { asc } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { countAdminBookings, listAdminBookings } from "@/domain/admin-bookings";
import { rangeInstants } from "@/domain/date-range";
import { zonedInstant } from "@/domain/time";
import { testDatabaseUrl } from "@/test/database";
import { resetBusinessTables } from "@/test/reset";
import { createDb, type Database } from "./client";
import { appointment, appointmentProduct, client, product, service } from "./schema";
import { seed } from "./seed";
import { dashboardStats, productSalesByMonth, type DashboardStats } from "./stats";

const TZ = "Africa/Johannesburg";
const NOVEMBER = rangeInstants({ from: "2030-11-01", to: "2030-11-30" }, TZ);

let db: Database;
let stats: DashboardStats;
let humanId: string;
let animalId: string;
let balmId: string;
let creamId: string;

function at(date: string, hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return zonedInstant(date, h * 60 + m, TZ);
}

async function newClient(name: string): Promise<string> {
  const [row] = await db
    .insert(client)
    .values({ name, phone: `+2782${randomBytes(4).readUInt32BE() % 10_000_000}` })
    .returning({ id: client.id });
  if (!row) throw new Error("insert failed");
  return row.id;
}

async function visit(
  clientId: string,
  start: Date,
  opts: {
    status: "booked" | "done" | "no_show" | "cancelled";
    serviceId: string;
    priceCents: number;
    products?: { productId: string; qty: number; priceCents: number }[];
  },
): Promise<void> {
  const [row] = await db
    .insert(appointment)
    .values({
      clientId,
      serviceId: opts.serviceId,
      during: { start, end: new Date(start.getTime() + 40 * 60_000) },
      status: opts.status,
      source: "app",
      priceCents: opts.priceCents,
      manageToken: randomBytes(32).toString("base64url"),
      cancelledAt: opts.status === "cancelled" ? start : null,
    })
    .returning({ id: appointment.id });
  if (!row) throw new Error("insert failed");
  for (const p of opts.products ?? []) {
    await db.insert(appointmentProduct).values({ appointmentId: row.id, ...p });
  }
}

beforeAll(async () => {
  db = createDb(testDatabaseUrl(), { max: 2 });
  await resetBusinessTables(db);
  await seed(db);
  const services = await db.select().from(service).orderBy(asc(service.sortOrder));
  const products = await db.select().from(product).orderBy(asc(product.sortOrder));
  humanId = services.find((s) => s.forKind === "human")?.id ?? "";
  animalId = services.find((s) => s.forKind === "animal")?.id ?? "";
  balmId = products[0]?.id ?? "";
  creamId = products[1]?.id ?? "";

  const returning = await newClient("Returning");
  const fresh = await newClient("New");
  const cancelledOnly = await newClient("Cancelled only");
  const missedOnly = await newClient("Missed only");
  const H = { serviceId: humanId, priceCents: 40_000 };
  const A = { serviceId: animalId, priceCents: 50_000 };

  // Before the range: makes "Returning" a returning client.
  await visit(returning, at("2030-10-15", "09:00"), {
    status: "done",
    ...H,
    // An older price: the monthly product report keeps the price of the day.
    products: [{ productId: balmId, qty: 1, priceCents: 11_000 }],
  });
  // In the range.
  await visit(returning, at("2030-11-04", "09:00"), { status: "done", ...H }); // Mon
  await visit(fresh, at("2030-11-04", "10:00"), {
    status: "done",
    ...A,
    products: [
      { productId: balmId, qty: 2, priceCents: 12_000 },
      { productId: creamId, qty: 1, priceCents: 9_000 },
    ],
  }); // Mon
  await visit(fresh, at("2030-11-06", "09:00"), {
    status: "done",
    ...A,
    products: [{ productId: balmId, qty: 1, priceCents: 12_000 }],
  }); // Wed
  await visit(cancelledOnly, at("2030-11-05", "09:00"), { status: "cancelled", ...H });
  await visit(missedOnly, at("2030-11-05", "10:00"), {
    status: "no_show",
    ...H,
    // Products on a missed visit are not revenue.
    products: [{ productId: balmId, qty: 5, priceCents: 12_000 }],
  });
  await visit(returning, at("2030-11-28", "09:00"), { status: "booked", ...H });
  // Edges of the range in Johannesburg time: 23:30 on the 30th is in, 00:15 on 1 Dec is out.
  await visit(returning, at("2030-11-30", "23:30"), { status: "done", ...H }); // Sat
  await visit(returning, at("2030-12-01", "00:15"), {
    status: "done",
    ...H,
    // 22:15 on 30 November in UTC: must count in December (business time zone).
    products: [{ productId: creamId, qty: 4, priceCents: 9_000 }],
  });

  stats = await dashboardStats(db, NOVEMBER, TZ);
});

afterAll(async () => {
  await db.$client.end();
});

describe("dashboardStats", () => {
  it("counts bookings by status, with the no-show rate over done + didn't come", () => {
    expect(stats.bookings).toEqual({
      total: 7,
      booked: 1,
      done: 4,
      noShow: 1,
      cancelled: 1,
      noShowRate: 0.2,
    });
  });

  it("splits clients with a visit into new and returning", () => {
    expect(stats.clients).toEqual({ new: 1, returning: 1 });
  });

  it("splits done visits into people and animals", () => {
    expect(stats.kinds).toEqual({ human: 2, animal: 2 });
  });

  it("adds up revenue from done visits only, at the saved prices", () => {
    expect(stats.revenue).toEqual({
      servicesCents: 180_000,
      productsCents: 45_000,
      totalCents: 225_000,
    });
  });

  it("ranks services and products", () => {
    expect(stats.topServices.map((s) => [s.id, s.count, s.revenueCents])).toEqual([
      [animalId, 2, 100_000],
      [humanId, 2, 80_000],
    ]);
    expect(stats.topProducts.map((p) => [p.id, p.count, p.revenueCents])).toEqual([
      [balmId, 3, 36_000],
      [creamId, 1, 9_000],
    ]);
  });

  it("counts visits per weekday in the business time zone, Monday first", () => {
    expect(stats.weekdays).toEqual([2, 0, 1, 0, 0, 1, 0]);
  });

  it("is all zeros for an empty range", async () => {
    const empty = await dashboardStats(
      db,
      rangeInstants({ from: "2031-01-01", to: "2031-01-31" }, TZ),
      TZ,
    );
    expect(empty.bookings).toEqual({
      total: 0,
      booked: 0,
      done: 0,
      noShow: 0,
      cancelled: 0,
      noShowRate: null,
    });
    expect(empty.revenue.totalCents).toBe(0);
    expect(empty.topServices).toEqual([]);
    expect(empty.weekdays).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });
});

describe("productSalesByMonth", () => {
  it("sums units and revenue per product per month, done visits only", async () => {
    const [balm, cream] = await db.select().from(product).orderBy(asc(product.sortOrder));
    const rows = await productSalesByMonth(
      db,
      rangeInstants({ from: "2030-10-01", to: "2030-12-31" }, TZ),
      TZ,
    );
    expect(rows).toEqual(
      [
        { month: "2030-10", product: balm?.name, units: 1, revenueCents: 11_000 },
        { month: "2030-11", product: balm?.name, units: 3, revenueCents: 36_000 },
        { month: "2030-11", product: cream?.name, units: 1, revenueCents: 9_000 },
        { month: "2030-12", product: cream?.name, units: 4, revenueCents: 36_000 },
      ].sort(
        (a, b) =>
          a.month.localeCompare(b.month) || String(a.product).localeCompare(String(b.product)),
      ),
    );
  });

  it("matches the dashboard's top products for the same range", async () => {
    const rows = await productSalesByMonth(db, NOVEMBER, TZ);
    const units = rows.reduce((sum, r) => sum + r.units, 0);
    const cents = rows.reduce((sum, r) => sum + r.revenueCents, 0);
    expect(units).toBe(stats.topProducts.reduce((sum, p) => sum + p.count, 0));
    expect(cents).toBe(stats.revenue.productsCents);
  });
});

describe("admin bookings table", () => {
  it("lists bookings in the range newest first, with products sold", async () => {
    const rows = await listAdminBookings(db, NOVEMBER, {}, { limit: 50 });
    expect(rows).toHaveLength(7);
    expect(await countAdminBookings(db, NOVEMBER, {})).toBe(7);
    const starts = rows.map((r) => r.start.getTime());
    expect(starts).toEqual([...starts].sort((a, b) => b - a));
    expect(rows[0]?.start).toEqual(at("2030-11-30", "23:30"));

    const withProducts = rows.find(
      (r) => r.start.getTime() === at("2030-11-04", "10:00").getTime(),
    );
    expect(withProducts).toMatchObject({
      clientName: "New",
      priceCents: 50_000,
      productsCents: 33_000,
    });
    expect(rows.find((r) => r.status === "booked")?.productsCents).toBe(0);
  });

  it("filters by status and source, and pages", async () => {
    expect(await countAdminBookings(db, NOVEMBER, { status: "done" })).toBe(4);
    expect(await countAdminBookings(db, NOVEMBER, { source: "web" })).toBe(0);
    const page2 = await listAdminBookings(db, NOVEMBER, {}, { limit: 5, offset: 5 });
    expect(page2).toHaveLength(2);
  });
});
