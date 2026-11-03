import { randomBytes } from "node:crypto";
import { and, count, eq, sql } from "drizzle-orm";
import type { Database, Transaction } from "@/db/client";
import { PG_ERROR, pgErrorCode } from "@/db/errors";
import { appointment, client, pet, service } from "@/db/schema";
import {
  loadActiveService,
  loadAvailability,
  loadSettings,
  type ClockOptions,
} from "./availability";
import { findOrCreateClient, findOrCreatePet } from "./clients";
import { setStatus } from "./booking-status";
import {
  CancelTooLateError,
  InvalidBookingError,
  InvalidStatusError,
  NotFoundError,
  SlotTakenError,
  SlotUnavailableError,
  TooManyBookingsError,
} from "./errors";
import { createBookingSchema, manageTokenSchema, type CreateBookingInput } from "./schemas";
import { appointmentRange, isSlotAvailable } from "./slots";
import { addMinutesTo, localDayRange, localDateOf, type TimeRange } from "./time";

/**
 * The client side of a booking: creating it, cancelling by the private link, and what
 * that link shows. The owner's changes are in `booking-status.ts` and
 * `booking-products.ts`.
 */

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
          priceCents: svc.priceCents,
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
