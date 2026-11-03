import { and, count, desc, eq, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { formatTstzRange } from "@/db/range";
import { appointment, client, pet, service } from "@/db/schema";
import type { Queryable } from "./availability";
import { addMinutesTo, type TimeRange } from "./time";

/** The admin's bookings table and CSV export. */

export const bookingFilterSchema = z.object({
  status: z.enum(["booked", "done", "no_show", "cancelled"]).optional().catch(undefined),
  source: z.enum(["web", "app"]).optional().catch(undefined),
});
export type BookingFilter = z.infer<typeof bookingFilterSchema>;

export interface AdminBookingRow {
  id: string;
  start: Date;
  end: Date;
  status: (typeof appointment.$inferSelect)["status"];
  source: (typeof appointment.$inferSelect)["source"];
  clientName: string;
  clientPhone: string;
  clientEmail: string | null;
  petName: string | null;
  serviceName: string;
  priceCents: number;
  /** Products sold at this appointment. */
  productsCents: number;
}

export const PAGE_SIZE = 50;
/** An export never returns more rows than this. */
export const EXPORT_LIMIT = 10_000;

function conditions(range: TimeRange, filter: BookingFilter): SQL | undefined {
  return and(
    sql`lower(${appointment.during}) <@ ${formatTstzRange(range)}::tstzrange`,
    filter.status ? eq(appointment.status, filter.status) : undefined,
    filter.source ? eq(appointment.source, filter.source) : undefined,
  );
}

/** Bookings starting in `range`, newest first. */
export async function listAdminBookings(
  db: Queryable,
  range: TimeRange,
  filter: BookingFilter,
  { limit, offset = 0 }: { limit: number; offset?: number },
): Promise<AdminBookingRow[]> {
  const rows = await db
    .select({
      id: appointment.id,
      during: appointment.during,
      durationMin: service.durationMin,
      status: appointment.status,
      source: appointment.source,
      clientName: client.name,
      clientPhone: client.phone,
      clientEmail: client.email,
      petName: pet.name,
      serviceName: service.name,
      priceCents: appointment.priceCents,
      // Qualified by hand: Drizzle leaves column names unqualified in a select list.
      productsCents: sql<string>`coalesce((
        select sum(ap.qty * ap.price_cents) from appointment_product ap
        where ap.appointment_id = "appointment"."id"
      ), 0)`,
    })
    .from(appointment)
    .innerJoin(service, eq(service.id, appointment.serviceId))
    .innerJoin(client, eq(client.id, appointment.clientId))
    .leftJoin(pet, eq(pet.id, appointment.petId))
    .where(conditions(range, filter))
    .orderBy(desc(sql`lower(${appointment.during})`))
    .limit(limit)
    .offset(offset);

  return rows.map(({ during, durationMin, productsCents, ...row }) => ({
    ...row,
    start: during.start,
    end: addMinutesTo(during.start, durationMin),
    productsCents: Number(productsCents),
  }));
}

export async function countAdminBookings(
  db: Queryable,
  range: TimeRange,
  filter: BookingFilter,
): Promise<number> {
  const [row] = await db.select({ n: count() }).from(appointment).where(conditions(range, filter));
  return row?.n ?? 0;
}
