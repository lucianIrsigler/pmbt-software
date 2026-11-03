import { count } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import type { Database } from "./client";
import { product, service, settings, workingHours } from "./schema";

type ServiceInsert = typeof service.$inferInsert;
type ProductInsert = typeof product.$inferInsert;
type WorkingHoursInsert = typeof workingHours.$inferInsert;

/** Mon–Fri 09:00–17:00, Sat 09:00–13:00. Weekday 0 = Sunday. */
export const SEED_WORKING_HOURS: WorkingHoursInsert[] = [
  ...[1, 2, 3, 4, 5].map((weekday) => ({ weekday, startTime: "09:00", endTime: "17:00" })),
  { weekday: 6, startTime: "09:00", endTime: "13:00" },
];

/** Sample services for the owner to edit in /admin. Prices in ZAR cents. */
export const SEED_SERVICES: ServiceInsert[] = [
  {
    name: "PBMT session (30 min)",
    description: "A focused light therapy session for one area.",
    forKind: "human",
    durationMin: 30,
    priceCents: 45000,
    sortOrder: 10,
  },
  {
    name: "PBMT session (60 min)",
    description: "A longer session covering several areas.",
    forKind: "human",
    durationMin: 60,
    priceCents: 75000,
    sortOrder: 20,
  },
  {
    name: "First visit: consultation and PBMT",
    description: "We talk through your needs, then a first treatment.",
    forKind: "human",
    durationMin: 60,
    priceCents: 80000,
    sortOrder: 30,
  },
  {
    name: "Dog PBMT session (small or medium dog)",
    description: "Gentle light therapy for joints, wounds and recovery.",
    forKind: "animal",
    durationMin: 30,
    priceCents: 35000,
    sortOrder: 40,
  },
  {
    name: "Dog PBMT session (large dog)",
    description: "Extra time for bigger dogs.",
    forKind: "animal",
    durationMin: 45,
    priceCents: 45000,
    sortOrder: 50,
  },
  {
    name: "Cat or small animal PBMT session",
    description: "A calm, short session for cats and small pets.",
    forKind: "animal",
    durationMin: 30,
    priceCents: 30000,
    sortOrder: 60,
  },
];

export const SEED_PRODUCTS: ProductInsert[] = [
  {
    name: "Healing cream (50 ml)",
    description: "Natural cream for skin and minor wounds.",
    priceCents: 18000,
    sortOrder: 10,
  },
  {
    name: "Joint and muscle ointment (100 ml)",
    description: "Warming ointment for stiff joints and sore muscles.",
    priceCents: 25000,
    sortOrder: 20,
  },
  {
    name: "Paw balm (30 ml)",
    description: "Soothes dry and cracked paw pads.",
    priceCents: 12000,
    sortOrder: 30,
  },
];

export interface SeedResult {
  settings: number;
  workingHours: number;
  services: number;
  products: number;
}

async function isEmpty(tx: Pick<Database, "select">, table: PgTable): Promise<boolean> {
  const [row] = await tx.select({ n: count() }).from(table);
  return (row?.n ?? 0) === 0;
}

/**
 * Inserts default data. Idempotent: each table is only seeded while it is empty,
 * so re-running never duplicates rows or overwrites the owner's changes.
 */
export async function seed(db: Database): Promise<SeedResult> {
  return db.transaction(async (tx) => {
    const settingsRows = await tx
      .insert(settings)
      .values({ id: 1, businessName: "PBMT & Natural Products" })
      .onConflictDoNothing()
      .returning({ id: settings.id });

    const result: SeedResult = {
      settings: settingsRows.length,
      workingHours: 0,
      services: 0,
      products: 0,
    };

    if (await isEmpty(tx, workingHours)) {
      result.workingHours = (
        await tx.insert(workingHours).values(SEED_WORKING_HOURS).returning({ id: workingHours.id })
      ).length;
    }
    if (await isEmpty(tx, service)) {
      result.services = (
        await tx.insert(service).values(SEED_SERVICES).returning({ id: service.id })
      ).length;
    }
    if (await isEmpty(tx, product)) {
      result.products = (
        await tx.insert(product).values(SEED_PRODUCTS).returning({ id: product.id })
      ).length;
    }
    return result;
  });
}
