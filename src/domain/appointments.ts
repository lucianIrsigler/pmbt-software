import { and, asc, desc, eq, inArray, isNull, ne, sql, type SQL } from "drizzle-orm";
import type { Database } from "@/db/client";
import { PG_ERROR, pgErrorCode } from "@/db/errors";
import { formatTstzRange } from "@/db/range";
import { appointment, appointmentProduct, client, pet, product, service } from "@/db/schema";
import type { Queryable } from "./availability";
import { InvalidStatusError, NotFoundError, SlotTakenError } from "./errors";
import { idSchema } from "./schemas";
import { BLOCKING_STATUSES } from "./slots";
import { addMinutesTo, localDayRange, type LocalDate, type TimeRange } from "./time";

/** Owner-facing reads (Today list, appointment detail) and the "Undo" status change. */

type AppointmentStatus = (typeof appointment.$inferSelect)["status"];

export interface DayAppointment {
  id: string;
  status: AppointmentStatus;
  /** Session start and end, without the buffer. */
  start: Date;
  end: Date;
  /** The time it occupies, including the buffer. */
  during: TimeRange;
  clientName: string;
  petName: string | null;
  petSpecies: string | null;
  serviceName: string;
}

/** Appointments with client, pet and service names, earliest first. */
async function listAppointments(db: Queryable, where: SQL | undefined): Promise<DayAppointment[]> {
  const rows = await db
    .select({
      id: appointment.id,
      status: appointment.status,
      during: appointment.during,
      durationMin: service.durationMin,
      clientName: client.name,
      petName: pet.name,
      petSpecies: pet.species,
      serviceName: service.name,
    })
    .from(appointment)
    .innerJoin(service, eq(service.id, appointment.serviceId))
    .innerJoin(client, eq(client.id, appointment.clientId))
    .leftJoin(pet, eq(pet.id, appointment.petId))
    .where(where)
    .orderBy(sql`lower(${appointment.during})`);

  return rows.map(({ durationMin, ...row }) => ({
    ...row,
    start: row.during.start,
    end: addMinutesTo(row.during.start, durationMin),
  }));
}

/** Non-cancelled appointments starting on `date` (business tz), earliest first. */
export async function listDay(
  db: Queryable,
  date: LocalDate,
  tz: string,
): Promise<DayAppointment[]> {
  const day = localDayRange(date, tz);
  return listAppointments(
    db,
    and(
      ne(appointment.status, "cancelled"),
      sql`lower(${appointment.during}) <@ ${formatTstzRange(day)}::tstzrange`,
    ),
  );
}

/**
 * Appointments in the given statuses whose time (including buffer) overlaps `range`.
 * Defaults to those that occupy time (booked and done), for the calendar.
 */
export async function listOverlapping(
  db: Queryable,
  range: TimeRange,
  statuses: readonly AppointmentStatus[] = BLOCKING_STATUSES,
): Promise<DayAppointment[]> {
  return listAppointments(
    db,
    and(
      inArray(appointment.status, [...statuses]),
      sql`${appointment.during} && ${formatTstzRange(range)}::tstzrange`,
    ),
  );
}

export interface PreviousVisit {
  id: string;
  /** done, no_show (didn't come) or cancelled. */
  status: Exclude<AppointmentStatus, "booked">;
  start: Date;
  serviceName: string;
  /** First line of the visit notes, or empty. */
  notesFirstLine: string;
}

export interface ProductLine {
  productId: string;
  name: string;
  qty: number;
  priceCents: number;
}

export interface AppointmentDetail {
  id: string;
  status: AppointmentStatus;
  start: Date;
  end: Date;
  notes: string;
  source: "web" | "app";
  service: { id: string; name: string; forKind: "human" | "animal"; priceCents: number };
  client: { id: string; name: string; phone: string; email: string | null; notes: string };
  pet: { id: string; name: string; species: string; breed: string | null; notes: string } | null;
  products: ProductLine[];
  previousVisits: PreviousVisit[];
}

const PREVIOUS_VISITS_LIMIT = 10;

export function firstLine(text: string): string {
  return text.trim().split(/\r?\n/, 1)[0]?.trim() ?? "";
}

/**
 * Earlier appointments for the same client, or for the same pet when the appointment
 * is for an animal: done, didn't come and cancelled (so missed visits are visible
 * too). Newest first.
 */
async function previousVisits(
  db: Database,
  current: { id: string; clientId: string; petId: string | null; start: Date },
): Promise<PreviousVisit[]> {
  const rows = await db
    .select({
      id: appointment.id,
      status: appointment.status,
      during: appointment.during,
      serviceName: service.name,
      notes: appointment.notes,
    })
    .from(appointment)
    .innerJoin(service, eq(service.id, appointment.serviceId))
    .where(
      and(
        eq(appointment.clientId, current.clientId),
        current.petId ? eq(appointment.petId, current.petId) : isNull(appointment.petId),
        inArray(appointment.status, ["done", "no_show", "cancelled"]),
        ne(appointment.id, current.id),
        sql`lower(${appointment.during}) < ${current.start.toISOString()}::timestamptz`,
      ),
    )
    .orderBy(desc(sql`lower(${appointment.during})`))
    .limit(PREVIOUS_VISITS_LIMIT);

  return rows.flatMap((r) =>
    r.status === "booked"
      ? []
      : [
          {
            id: r.id,
            status: r.status,
            start: r.during.start,
            serviceName: r.serviceName,
            notesFirstLine: firstLine(r.notes),
          },
        ],
  );
}

export async function getAppointmentDetail(
  db: Database,
  rawId: string,
): Promise<AppointmentDetail | null> {
  const id = idSchema.safeParse(rawId);
  if (!id.success) return null;

  const [row] = await db
    .select({
      appointment: {
        id: appointment.id,
        status: appointment.status,
        during: appointment.during,
        notes: appointment.notes,
        source: appointment.source,
        clientId: appointment.clientId,
        petId: appointment.petId,
      },
      service: {
        id: service.id,
        name: service.name,
        forKind: service.forKind,
        priceCents: service.priceCents,
        durationMin: service.durationMin,
      },
      client: {
        id: client.id,
        name: client.name,
        phone: client.phone,
        email: client.email,
        notes: client.notes,
      },
      pet: { id: pet.id, name: pet.name, species: pet.species, breed: pet.breed, notes: pet.notes },
    })
    .from(appointment)
    .innerJoin(service, eq(service.id, appointment.serviceId))
    .innerJoin(client, eq(client.id, appointment.clientId))
    .leftJoin(pet, eq(pet.id, appointment.petId))
    .where(eq(appointment.id, id.data));
  if (!row) return null;

  const a = row.appointment;
  const start = a.during.start;
  const [products, visits] = await Promise.all([
    db
      .select({
        productId: appointmentProduct.productId,
        name: product.name,
        qty: appointmentProduct.qty,
        priceCents: appointmentProduct.priceCents,
      })
      .from(appointmentProduct)
      .innerJoin(product, eq(product.id, appointmentProduct.productId))
      .where(eq(appointmentProduct.appointmentId, a.id))
      .orderBy(asc(product.sortOrder), asc(product.name)),
    previousVisits(db, { id: a.id, clientId: a.clientId, petId: a.petId, start }),
  ]);

  const { durationMin, ...serviceInfo } = row.service;
  return {
    id: a.id,
    status: a.status,
    start,
    end: addMinutesTo(start, durationMin),
    notes: a.notes,
    source: a.source,
    service: serviceInfo,
    client: row.client,
    pet: row.pet,
    products,
    previousVisits: visits,
  };
}

/**
 * Undo "Done" or "Didn't come": back to booked. If someone has since booked an
 * overlapping time (possible once a slot was freed), raises `SlotTakenError`.
 */
export async function undoStatus(db: Database, rawId: string): Promise<void> {
  const id = idSchema.parse(rawId);
  try {
    const [updated] = await db
      .update(appointment)
      .set({ status: "booked" })
      .where(and(eq(appointment.id, id), sql`${appointment.status} in ('done', 'no_show')`))
      .returning({ id: appointment.id });
    if (updated) return;
  } catch (error) {
    if (pgErrorCode(error) === PG_ERROR.exclusionViolation) throw new SlotTakenError();
    throw error;
  }

  const [current] = await db
    .select({ status: appointment.status })
    .from(appointment)
    .where(eq(appointment.id, id));
  if (!current) throw new NotFoundError("appointment");
  throw new InvalidStatusError(current.status, "undone");
}
