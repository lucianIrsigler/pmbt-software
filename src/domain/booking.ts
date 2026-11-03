import { randomBytes } from "node:crypto";
import { and, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import { PG_ERROR, pgErrorCode } from "@/db/errors";
import { appointment, appointmentProduct, client, pet, product, service } from "@/db/schema";
import {
  loadActiveService,
  loadAvailability,
  loadSettings,
  type ClockOptions,
} from "./availability";
import {
  CancelTooLateError,
  InvalidBookingError,
  InvalidStatusError,
  NotFoundError,
  SlotTakenError,
  SlotUnavailableError,
  TooManyBookingsError,
} from "./errors";
import {
  addProductSchema,
  createBookingSchema,
  idSchema,
  manageTokenSchema,
  removeProductSchema,
  updateNotesSchema,
  type AddProductInput,
  type CreateBookingInput,
  type RemoveProductInput,
  type UpdateNotesInput,
} from "./schemas";
import { appointmentRange, isSlotAvailable } from "./slots";
import { addMinutesTo, localDayRange, localDateOf, type TimeRange } from "./time";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type AppointmentStatus = (typeof appointment.$inferSelect)["status"];

/** 32 random bytes, base64url (43 characters). */
export function generateManageToken(): string {
  return randomBytes(32).toString("base64url");
}

// ---------------------------------------------------------------------------
// createBooking
// ---------------------------------------------------------------------------

export interface CreateBookingOptions extends ClockOptions {
  /** Owner bookings (phone calls) may be made at short notice. */
  ignoreMinNotice?: boolean;
  /** Owner bookings may be made further ahead than `max_days_ahead`. */
  ignoreHorizon?: boolean;
  /**
   * Spam guard for public bookings: refuse if the client (matched by phone) already has
   * this many upcoming `booked` appointments. Unlimited when omitted.
   */
  maxUpcomingPerClient?: number;
}

export interface CreatedBooking {
  appointmentId: string;
  clientId: string;
  petId: string | null;
  manageToken: string;
  during: TimeRange;
}

type ClientRef = { id: string } | { name: string; phone: string; email?: string | undefined };
type PetRef = { id: string } | { name: string; species: string; breed?: string | undefined };

/** Finds the client by normalised phone (reusing archived ones) or creates them. */
async function findOrCreateClient(tx: Transaction, ref: ClientRef): Promise<string> {
  if ("id" in ref) {
    const [row] = await tx
      .update(client)
      .set({ archivedAt: null })
      .where(eq(client.id, ref.id))
      .returning({ id: client.id });
    if (!row) throw new NotFoundError("client");
    return row.id;
  }

  // Serialise concurrent first bookings from the same phone so we don't create duplicates.
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`client:${ref.phone}`}))`);

  const [existing] = await tx
    .select({ id: client.id, email: client.email })
    .from(client)
    .where(eq(client.phone, ref.phone))
    .orderBy(sql`${client.archivedAt} is not null`, desc(client.createdAt))
    .limit(1);

  if (existing) {
    // Keep the name the owner knows them by; only fill in a missing email.
    await tx
      .update(client)
      .set({ archivedAt: null, ...(existing.email ? {} : { email: ref.email ?? null }) })
      .where(eq(client.id, existing.id));
    return existing.id;
  }

  const [created] = await tx
    .insert(client)
    .values({ name: ref.name, phone: ref.phone, email: ref.email ?? null })
    .returning({ id: client.id });
  if (!created) throw new Error("client insert returned no row");
  return created.id;
}

/** Upcoming `booked` appointments for a client. */
async function countUpcoming(tx: Transaction, clientId: string, now: Date): Promise<number> {
  const [row] = await tx
    .select({ n: count() })
    .from(appointment)
    .where(
      and(
        eq(appointment.clientId, clientId),
        eq(appointment.status, "booked"),
        sql`upper(${appointment.during}) > ${now.toISOString()}::timestamptz`,
      ),
    );
  return row?.n ?? 0;
}

/** Uses the given pet of this client, or reuses/creates one by name (case-insensitive). */
async function findOrCreatePet(tx: Transaction, clientId: string, ref: PetRef): Promise<string> {
  if ("id" in ref) {
    const [row] = await tx
      .select({ id: pet.id })
      .from(pet)
      .where(and(eq(pet.id, ref.id), eq(pet.clientId, clientId)));
    if (!row) throw new NotFoundError("pet");
    return row.id;
  }

  const [existing] = await tx
    .select({ id: pet.id })
    .from(pet)
    .where(
      and(
        eq(pet.clientId, clientId),
        isNull(pet.archivedAt),
        sql`lower(${pet.name}) = lower(${ref.name})`,
      ),
    )
    .limit(1);
  if (existing) return existing.id;

  const [created] = await tx
    .insert(pet)
    .values({ clientId, name: ref.name, species: ref.species, breed: ref.breed ?? null })
    .returning({ id: pet.id });
  if (!created) throw new Error("pet insert returned no row");
  return created.id;
}

/**
 * Books an appointment in one transaction: checks the time is bookable (working hours,
 * time off, notice, horizon, step), finds or creates the client (by normalised phone)
 * and pet, then inserts the appointment.
 *
 * Overlaps are rejected by the database's exclusion constraint and surface as
 * `SlotTakenError`; other unbookable times raise `SlotUnavailableError`.
 */
export async function createBooking(
  db: Database,
  rawInput: CreateBookingInput,
  {
    tz,
    now = new Date(),
    ignoreMinNotice = false,
    ignoreHorizon = false,
    maxUpcomingPerClient,
  }: CreateBookingOptions,
): Promise<CreatedBooking> {
  const input = createBookingSchema.parse(rawInput);

  try {
    return await db.transaction(async (tx) => {
      const svc = await loadActiveService(tx, input.serviceId);
      if (svc.forKind === "animal" && !input.pet) {
        throw new InvalidBookingError("Please tell us about your animal.");
      }
      if (svc.forKind === "human" && input.pet) {
        throw new InvalidBookingError("This service is for people, not animals.");
      }

      // Check hours, time off, notice and horizon. Overlaps with other bookings are left to
      // the exclusion constraint, so a race can never double-book.
      const data = await loadAvailability(tx, localDayRange(localDateOf(input.start, tz), tz));
      const bookable = isSlotAvailable(input.start, {
        ...data,
        appointments: [],
        service: svc,
        now,
        tz,
        ignoreMinNotice,
        ignoreHorizon,
      });
      if (!bookable) throw new SlotUnavailableError();

      const clientId = await findOrCreateClient(tx, input.client);
      if (maxUpcomingPerClient !== undefined) {
        const upcoming = await countUpcoming(tx, clientId, now);
        if (upcoming >= maxUpcomingPerClient) throw new TooManyBookingsError(maxUpcomingPerClient);
      }
      const petId = input.pet ? await findOrCreatePet(tx, clientId, input.pet) : null;
      const during = appointmentRange(input.start, svc);
      const manageToken = generateManageToken();

      const [row] = await tx
        .insert(appointment)
        .values({
          clientId,
          petId,
          serviceId: svc.id,
          during,
          source: input.source,
          notes: input.notes ?? "",
          manageToken,
        })
        .returning({ id: appointment.id });
      if (!row) throw new Error("appointment insert returned no row");

      return { appointmentId: row.id, clientId, petId, manageToken, during };
    });
  } catch (error) {
    if (pgErrorCode(error) === PG_ERROR.exclusionViolation) throw new SlotTakenError();
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Cancelling
// ---------------------------------------------------------------------------

/**
 * Grace period after booking during which a client can always cancel online, even
 * inside the cutoff (e.g. a booking made tonight for tomorrow morning).
 */
export const CANCEL_GRACE_MINUTES = 60;

/**
 * Last moment a client may cancel online: `cancel_cutoff_hours` before the start, or
 * `CANCEL_GRACE_MINUTES` after booking, whichever is later, but never after the start.
 */
export function cancelDeadline(start: Date, createdAt: Date, cancelCutoffHours: number): Date {
  const cutoff = addMinutesTo(start, -cancelCutoffHours * 60).getTime();
  const grace = Math.min(addMinutesTo(createdAt, CANCEL_GRACE_MINUTES).getTime(), start.getTime());
  return new Date(Math.max(cutoff, grace));
}

export function canClientCancel(
  booking: { start: Date; createdAt: Date },
  now: Date,
  cancelCutoffHours: number,
): boolean {
  const deadline = cancelDeadline(booking.start, booking.createdAt, cancelCutoffHours);
  return now.getTime() <= deadline.getTime() && now.getTime() < booking.start.getTime();
}

export interface CancelResult {
  appointmentId: string;
  /** True if it was already cancelled (cancelling is idempotent). */
  alreadyCancelled: boolean;
}

/** Client cancels via their private link. Respects `cancel_cutoff_hours` and the grace period. */
export async function cancelBookingByToken(
  db: Database,
  rawToken: string,
  { now = new Date() }: { now?: Date } = {},
): Promise<CancelResult> {
  const token = manageTokenSchema.safeParse(rawToken);
  if (!token.success) throw new NotFoundError("appointment");

  const [row] = await db
    .select({
      id: appointment.id,
      status: appointment.status,
      during: appointment.during,
      createdAt: appointment.createdAt,
    })
    .from(appointment)
    .where(eq(appointment.manageToken, token.data));
  if (!row) throw new NotFoundError("appointment");
  if (row.status === "cancelled") return { appointmentId: row.id, alreadyCancelled: true };
  if (row.status !== "booked") throw new InvalidStatusError(row.status, "cancelled");

  const { cancelCutoffHours } = await loadSettings(db);
  if (
    !canClientCancel({ start: row.during.start, createdAt: row.createdAt }, now, cancelCutoffHours)
  ) {
    throw new CancelTooLateError(cancelCutoffHours);
  }

  await setStatus(db, row.id, ["booked"], "cancelled", "cancelled", now);
  return { appointmentId: row.id, alreadyCancelled: false };
}

// ---------------------------------------------------------------------------
// Owner actions
// ---------------------------------------------------------------------------

/**
 * Moves an appointment from one of `from` to `to`, atomically.
 * Throws NotFoundError / InvalidStatusError if it can't.
 */
async function setStatus(
  db: Database,
  rawId: string,
  from: AppointmentStatus[],
  to: AppointmentStatus,
  action: string,
  now: Date = new Date(),
): Promise<void> {
  const id = idSchema.parse(rawId);
  const [updated] = await db
    .update(appointment)
    .set({ status: to, cancelledAt: to === "cancelled" ? now : null })
    .where(and(eq(appointment.id, id), inArray(appointment.status, from)))
    .returning({ id: appointment.id });
  if (updated) return;

  const [current] = await db
    .select({ status: appointment.status })
    .from(appointment)
    .where(eq(appointment.id, id));
  if (!current) throw new NotFoundError("appointment");
  throw new InvalidStatusError(current.status, action);
}

export async function markDone(db: Database, id: string): Promise<void> {
  await setStatus(db, id, ["booked"], "done", "marked done");
}

export async function markNoShow(db: Database, id: string): Promise<void> {
  await setStatus(db, id, ["booked"], "no_show", "marked as didn't come");
}

/** Owner cancels: no cutoff applies. */
export async function cancelByOwner(
  db: Database,
  id: string,
  { now = new Date() }: { now?: Date } = {},
): Promise<void> {
  await setStatus(db, id, ["booked"], "cancelled", "cancelled", now);
}

export async function updateNotes(db: Database, rawInput: UpdateNotesInput): Promise<void> {
  const input = updateNotesSchema.parse(rawInput);
  const [row] = await db
    .update(appointment)
    .set({ notes: input.notes })
    .where(eq(appointment.id, input.appointmentId))
    .returning({ id: appointment.id });
  if (!row) throw new NotFoundError("appointment");
}

// ---------------------------------------------------------------------------
// Products sold in a session
// ---------------------------------------------------------------------------

export interface AppointmentProductLine {
  productId: string;
  qty: number;
  priceCents: number;
}

/**
 * Records a product sold during an appointment, at its current price.
 * Adding the same product again increases the quantity (keeping the first price).
 */
export async function addProductToAppointment(
  db: Database,
  rawInput: AddProductInput,
): Promise<AppointmentProductLine> {
  const input = addProductSchema.parse(rawInput);
  return db.transaction(async (tx) => {
    const [appt] = await tx
      .select({ status: appointment.status })
      .from(appointment)
      .where(eq(appointment.id, input.appointmentId));
    if (!appt) throw new NotFoundError("appointment");
    if (appt.status === "cancelled") throw new InvalidStatusError(appt.status, "given products");

    const [prod] = await tx
      .select({ priceCents: product.priceCents, active: product.active })
      .from(product)
      .where(eq(product.id, input.productId));
    if (!prod || !prod.active) throw new NotFoundError("product");

    const [line] = await tx
      .insert(appointmentProduct)
      .values({
        appointmentId: input.appointmentId,
        productId: input.productId,
        qty: input.qty,
        priceCents: prod.priceCents,
      })
      .onConflictDoUpdate({
        target: [appointmentProduct.appointmentId, appointmentProduct.productId],
        set: { qty: sql`${appointmentProduct.qty} + excluded.qty` },
      })
      .returning({
        productId: appointmentProduct.productId,
        qty: appointmentProduct.qty,
        priceCents: appointmentProduct.priceCents,
      });
    if (!line) throw new Error("appointment_product upsert returned no row");
    return line;
  });
}

/** Removes a product line from an appointment. Returns false if it wasn't there. */
export async function removeProductFromAppointment(
  db: Database,
  rawInput: RemoveProductInput,
): Promise<boolean> {
  const input = removeProductSchema.parse(rawInput);
  const removed = await db
    .delete(appointmentProduct)
    .where(
      and(
        eq(appointmentProduct.appointmentId, input.appointmentId),
        eq(appointmentProduct.productId, input.productId),
      ),
    )
    .returning({ productId: appointmentProduct.productId });
  return removed.length > 0;
}

// ---------------------------------------------------------------------------
// Client-facing view (manage link)
// ---------------------------------------------------------------------------

export interface BookingView {
  appointmentId: string;
  status: AppointmentStatus;
  serviceName: string;
  forKind: "human" | "animal";
  /** Session start and end, without the buffer. */
  start: Date;
  end: Date;
  clientName: string;
  petName: string | null;
  /** Whether the client may still cancel online. */
  canCancel: boolean;
  cancelDeadline: Date;
}

/** The booking behind a manage link, or null if the token is unknown. */
export async function getBookingByToken(
  db: Database,
  rawToken: string,
  { now = new Date() }: { now?: Date } = {},
): Promise<BookingView | null> {
  const token = manageTokenSchema.safeParse(rawToken);
  if (!token.success) return null;

  const [row] = await db
    .select({
      appointmentId: appointment.id,
      status: appointment.status,
      during: appointment.during,
      createdAt: appointment.createdAt,
      serviceName: service.name,
      forKind: service.forKind,
      durationMin: service.durationMin,
      clientName: client.name,
      petName: pet.name,
    })
    .from(appointment)
    .innerJoin(service, eq(service.id, appointment.serviceId))
    .innerJoin(client, eq(client.id, appointment.clientId))
    .leftJoin(pet, eq(pet.id, appointment.petId))
    .where(eq(appointment.manageToken, token.data));
  if (!row) return null;

  const { cancelCutoffHours } = await loadSettings(db);
  const start = row.during.start;
  return {
    appointmentId: row.appointmentId,
    status: row.status,
    serviceName: row.serviceName,
    forKind: row.forKind,
    start,
    end: addMinutesTo(start, row.durationMin),
    clientName: row.clientName,
    petName: row.petName,
    canCancel:
      row.status === "booked" &&
      canClientCancel({ start, createdAt: row.createdAt }, now, cancelCutoffHours),
    cancelDeadline: cancelDeadline(start, row.createdAt, cancelCutoffHours),
  };
}
