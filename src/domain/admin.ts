import { and, asc, eq, ne } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import { product, service, settings, workingHours } from "@/db/schema";
import type { Queryable } from "./availability";
import { DomainError, NotFoundError } from "./errors";
import { randsSchema } from "./money";
import { idSchema, optionalEmailSchema, timeOfDaySchema } from "./schemas";
import { timeToMinutes } from "./time";

/**
 * Admin settings: services, products, working hours and business settings. Services
 * and products are never deleted (past bookings refer to them): they're hidden instead.
 * Write functions take the raw form values (strings) and validate them with Zod.
 */

// ---------------------------------------------------------------------------
// Shared form fields
// ---------------------------------------------------------------------------

const requiredText = (label: string, max: number) =>
  z
    .string()
    .trim()
    .min(1, `Please enter ${label}`)
    .max(max, `That's too long (at most ${max} characters)`);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `That's too long (at most ${max} characters)`)
    .transform((value) => (value === "" ? null : value));

/** A whole number typed into a form, within bounds. */
const wholeNumber = (label: string, min: number, max: number) =>
  z
    .string()
    .trim()
    .regex(/^-?\d+$/, `Please enter ${label} as a whole number`)
    .transform(Number)
    .pipe(z.number().min(min, `At least ${min}`).max(max, `At most ${max}`));

/** A checkbox: present ("on") means true. */
const checkbox = z
  .string()
  .optional()
  .transform((value) => value === "on" || value === "true");

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

export const serviceFormSchema = z.object({
  name: requiredText("a name", 100),
  description: z.string().trim().max(1000, "That's too long (at most 1000 characters)"),
  forKind: z.enum(["human", "animal"], "Please choose who it's for"),
  durationMin: wholeNumber("the duration", 5, 480),
  bufferMin: wholeNumber("the buffer", 0, 120),
  priceCents: randsSchema,
  sortOrder: wholeNumber("the order", -1000, 1000),
  active: checkbox,
});
export type ServiceForm = z.input<typeof serviceFormSchema>;
export type Service = typeof service.$inferSelect;

export async function listAllServices(db: Queryable): Promise<Service[]> {
  return db
    .select()
    .from(service)
    .orderBy(asc(service.forKind), asc(service.sortOrder), asc(service.name));
}

export async function getService(db: Queryable, rawId: string): Promise<Service | null> {
  const id = idSchema.safeParse(rawId);
  if (!id.success) return null;
  const [row] = await db.select().from(service).where(eq(service.id, id.data));
  return row ?? null;
}

export async function createService(db: Database, form: unknown): Promise<string> {
  const values = serviceFormSchema.parse(form);
  const [row] = await db.insert(service).values(values).returning({ id: service.id });
  if (!row) throw new Error("service insert returned no row");
  return row.id;
}

/** Changes a service. Existing bookings keep their saved price and time. */
export async function updateService(db: Database, rawId: string, form: unknown): Promise<void> {
  const id = idSchema.parse(rawId);
  const values = serviceFormSchema.parse(form);
  const updated = await db
    .update(service)
    .set(values)
    .where(eq(service.id, id))
    .returning({ id: service.id });
  if (updated.length === 0) throw new NotFoundError("service");
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

export const productFormSchema = z.object({
  name: requiredText("a name", 100),
  description: z.string().trim().max(1000, "That's too long (at most 1000 characters)"),
  priceCents: randsSchema,
  sortOrder: wholeNumber("the order", -1000, 1000),
  active: checkbox,
});
export type ProductForm = z.input<typeof productFormSchema>;
export type Product = typeof product.$inferSelect;

export async function listAllProducts(db: Queryable): Promise<Product[]> {
  return db.select().from(product).orderBy(asc(product.sortOrder), asc(product.name));
}

export async function getProduct(db: Queryable, rawId: string): Promise<Product | null> {
  const id = idSchema.safeParse(rawId);
  if (!id.success) return null;
  const [row] = await db.select().from(product).where(eq(product.id, id.data));
  return row ?? null;
}

export async function createProduct(db: Database, form: unknown): Promise<string> {
  const values = productFormSchema.parse(form);
  const [row] = await db.insert(product).values(values).returning({ id: product.id });
  if (!row) throw new Error("product insert returned no row");
  return row.id;
}

/** Changes a product. Products already sold keep the price they were sold at. */
export async function updateProduct(db: Database, rawId: string, form: unknown): Promise<void> {
  const id = idSchema.parse(rawId);
  const values = productFormSchema.parse(form);
  const updated = await db
    .update(product)
    .set(values)
    .where(eq(product.id, id))
    .returning({ id: product.id });
  if (updated.length === 0) throw new NotFoundError("product");
}

// ---------------------------------------------------------------------------
// Working hours
// ---------------------------------------------------------------------------

export const hoursFormSchema = z
  .object({
    weekday: wholeNumber("the day", 0, 6),
    startTime: timeOfDaySchema,
    endTime: timeOfDaySchema,
  })
  .refine((v) => v.endTime > v.startTime, {
    path: ["endTime"],
    message: "The closing time must be after the opening time",
  });
export type HoursForm = z.input<typeof hoursFormSchema>;

export interface HoursBlock {
  id: string;
  weekday: number;
  startTime: string;
  endTime: string;
}

/** A working-hours block that overlaps another on the same day. */
export class HoursOverlapError extends DomainError {
  readonly code = "hours_overlap";
  constructor() {
    super("These hours overlap other hours on the same day.");
  }
}

/** `HH:MM:SS` from Postgres to `HH:MM`. */
function hhmm(time: string): string {
  return time.slice(0, 5);
}

export async function listHours(db: Queryable): Promise<HoursBlock[]> {
  const rows = await db
    .select({
      id: workingHours.id,
      weekday: workingHours.weekday,
      startTime: workingHours.startTime,
      endTime: workingHours.endTime,
    })
    .from(workingHours)
    .orderBy(asc(workingHours.weekday), asc(workingHours.startTime));
  return rows.map((r) => ({ ...r, startTime: hhmm(r.startTime), endTime: hhmm(r.endTime) }));
}

async function assertNoOverlap(
  db: Queryable,
  block: { weekday: number; startTime: string; endTime: string },
  exceptId?: string,
): Promise<void> {
  const sameDay = await db
    .select({ startTime: workingHours.startTime, endTime: workingHours.endTime })
    .from(workingHours)
    .where(
      and(
        eq(workingHours.weekday, block.weekday),
        exceptId ? ne(workingHours.id, exceptId) : undefined,
      ),
    );
  const start = timeToMinutes(block.startTime);
  const end = timeToMinutes(block.endTime);
  const overlaps = sameDay.some(
    (b) => start < timeToMinutes(b.endTime) && timeToMinutes(b.startTime) < end,
  );
  if (overlaps) throw new HoursOverlapError();
}

/** Adds opening hours. Existing bookings are never affected. */
export async function addHours(db: Database, form: unknown): Promise<string> {
  const block = hoursFormSchema.parse(form);
  return db.transaction(async (tx) => {
    await assertNoOverlap(tx, block);
    const [row] = await tx.insert(workingHours).values(block).returning({ id: workingHours.id });
    if (!row) throw new Error("working_hours insert returned no row");
    return row.id;
  });
}

export async function updateHours(db: Database, rawId: string, form: unknown): Promise<void> {
  const id = idSchema.parse(rawId);
  const block = hoursFormSchema.parse(form);
  await db.transaction(async (tx) => {
    await assertNoOverlap(tx, block, id);
    const updated = await tx
      .update(workingHours)
      .set(block)
      .where(eq(workingHours.id, id))
      .returning({ id: workingHours.id });
    if (updated.length === 0) throw new NotFoundError("opening hours");
  });
}

/** Removes opening hours (configuration, not personal data, so a real delete). */
export async function removeHours(db: Database, rawId: string): Promise<void> {
  const id = idSchema.parse(rawId);
  await db.delete(workingHours).where(eq(workingHours.id, id));
}

// ---------------------------------------------------------------------------
// Business settings
// ---------------------------------------------------------------------------

export const SLOT_STEPS = [10, 15, 20, 30, 60] as const;

export const settingsFormSchema = z.object({
  businessName: requiredText("the business name", 100),
  contactPhone: optionalText(40),
  contactEmail: optionalEmailSchema.transform((value) => value ?? null),
  address: optionalText(300),
  minNoticeHours: wholeNumber("the notice", 0, 168),
  maxDaysAhead: wholeNumber("the number of days", 1, 365),
  slotStepMin: wholeNumber("the slot step", 10, 60).refine(
    (value) => (SLOT_STEPS as readonly number[]).includes(value),
    `Please choose one of ${SLOT_STEPS.join(", ")} minutes`,
  ),
  cancelCutoffHours: wholeNumber("the cutoff", 0, 168),
});
export type SettingsForm = z.input<typeof settingsFormSchema>;

export async function updateSettings(db: Database, form: unknown): Promise<void> {
  const values = settingsFormSchema.parse(form);
  const updated = await db
    .update(settings)
    .set(values)
    .where(eq(settings.id, 1))
    .returning({ id: settings.id });
  if (updated.length === 0) throw new Error("settings row missing; run pnpm db:seed");
}
