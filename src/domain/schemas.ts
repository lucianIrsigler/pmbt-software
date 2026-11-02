import { z } from "zod";
import { normalizePhone } from "./phone";
import { isLocalDate } from "./time";

/**
 * Zod schemas for every domain input. Shared by forms (client-side hints) and
 * server actions / domain functions (the real check).
 */

const trimmed = (label: string, max: number) =>
  z
    .string()
    .trim()
    .min(1, `Please enter ${label}`)
    .max(max, `${label[0]?.toUpperCase()}${label.slice(1)} is too long`);

export const idSchema = z.uuid();

export const localDateSchema = z.string().refine(isLocalDate, "Please choose a valid date");

export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Invalid month");

export const phoneSchema = z.string().transform((value, ctx) => {
  const phone = normalizePhone(value);
  if (!phone) {
    ctx.addIssue({ code: "custom", message: "Please enter a valid phone number" });
    return z.NEVER;
  }
  return phone;
});

/** Optional email: blank becomes `undefined`. Stored lower-case. */
export const optionalEmailSchema = z
  .string()
  .trim()
  .transform((value) => (value === "" ? undefined : value.toLowerCase()))
  .pipe(z.email("Please enter a valid email address").max(254).optional())
  .optional();

export const notesSchema = z.string().max(10_000, "Notes are too long");

export const newClientSchema = z.strictObject({
  name: trimmed("your name", 100),
  phone: phoneSchema,
  email: optionalEmailSchema,
});

export const newPetSchema = z.strictObject({
  name: trimmed("your animal's name", 60),
  species: trimmed("the species", 40),
  breed: z
    .string()
    .trim()
    .max(60, "Breed is too long")
    .transform((value) => (value === "" ? undefined : value))
    .optional(),
});

const existingRef = z.strictObject({ id: idSchema });

export const createBookingSchema = z.strictObject({
  serviceId: idSchema,
  start: z.coerce.date(),
  /** An existing client (owner app) or new details (public site; matched by phone). */
  client: z.union([existingRef, newClientSchema]),
  /** Required for animal services, absent for human services. */
  pet: z.union([existingRef, newPetSchema]).optional(),
  source: z.enum(["web", "app"]),
  notes: notesSchema.optional(),
});
export type CreateBookingInput = z.input<typeof createBookingSchema>;

/** 32 random bytes, base64url: 43 characters. */
export const manageTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/, "Invalid link");

export const updateNotesSchema = z.strictObject({
  appointmentId: idSchema,
  notes: notesSchema,
});
export type UpdateNotesInput = z.input<typeof updateNotesSchema>;

export const addProductSchema = z.strictObject({
  appointmentId: idSchema,
  productId: idSchema,
  qty: z.coerce.number().int().min(1).max(99).default(1),
});
export type AddProductInput = z.input<typeof addProductSchema>;

export const removeProductSchema = z.strictObject({
  appointmentId: idSchema,
  productId: idSchema,
});
export type RemoveProductInput = z.input<typeof removeProductSchema>;

export const slotsQuerySchema = z.strictObject({
  serviceId: idSchema,
  date: localDateSchema,
});

export const datesQuerySchema = z.strictObject({
  serviceId: idSchema,
  month: monthSchema,
});
