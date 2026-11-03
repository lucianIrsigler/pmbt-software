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

/** A new client entered by the owner (e.g. during a phone call). */
export const ownerClientSchema = z.strictObject({
  name: trimmed("the client's name", 100),
  phone: phoneSchema,
});
export type OwnerClientInput = z.input<typeof ownerClientSchema>;

/** A new pet entered by the owner. */
export const ownerPetSchema = z.strictObject({
  name: trimmed("the animal's name", 60),
  species: newPetSchema.shape.species,
  breed: newPetSchema.shape.breed,
});
export type OwnerPetInput = z.input<typeof ownerPetSchema>;

export const clientSearchSchema = z.string().trim().max(100);

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

/** `HH:MM`, as an `<input type="time">` sends it. */
export const timeOfDaySchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Please choose a time");

/** Time off: a whole day, or part of one (`startTime` to `endTime`, business tz). */
export const addTimeOffSchema = z
  .strictObject({
    date: localDateSchema,
    kind: z.enum(["day", "times"]),
    startTime: z.string().optional(),
    endTime: z.string().optional(),
    reason: z
      .string()
      .trim()
      .max(200, "The reason is too long")
      .transform((value) => (value === "" ? undefined : value))
      .optional(),
  })
  .transform((value, ctx) => {
    const { date, reason } = value;
    if (value.kind === "day") return { kind: "day" as const, date, reason };
    const start = timeOfDaySchema.safeParse(value.startTime ?? "");
    const end = timeOfDaySchema.safeParse(value.endTime ?? "");
    if (!start.success)
      ctx.addIssue({ code: "custom", path: ["startTime"], message: "Please choose a start time" });
    if (!end.success)
      ctx.addIssue({ code: "custom", path: ["endTime"], message: "Please choose an end time" });
    if (!start.success || !end.success) return z.NEVER;
    if (end.data <= start.data) {
      ctx.addIssue({
        code: "custom",
        path: ["endTime"],
        message: "The end time must be after the start time",
      });
      return z.NEVER;
    }
    return { kind: "times" as const, date, startTime: start.data, endTime: end.data, reason };
  });
export type AddTimeOffInput = z.input<typeof addTimeOffSchema>;
