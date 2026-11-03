import { bookingFilterSchema, EXPORT_LIMIT, listAdminBookings } from "@/domain/admin-bookings";
import { rangeInstants } from "@/domain/date-range";
import { localDateOf } from "@/domain/time";
import { toCsv } from "@/lib/csv";
import { formatPhone, formatTime } from "@/lib/format";
import { logInfo } from "@/lib/log";
import { SOURCE_LABELS, STATUS_LABELS } from "../bookings/labels";
import { adminCsvContext, csvResponse, rands } from "../csv-export";

/**
 * CSV export of the bookings table, with the same filters. Contains personal
 * information (POPIA), so it needs an admin login and is never cached.
 */
export async function GET(request: Request): Promise<Response> {
  const ctx = await adminCsvContext(request);
  if (ctx instanceof Response) return ctx;
  const { db, tz, user, params, range } = ctx;

  const filter = bookingFilterSchema.parse({
    status: params.get("status") ?? undefined,
    source: params.get("source") ?? undefined,
  });
  const rows = await listAdminBookings(db, rangeInstants(range, tz), filter, {
    limit: EXPORT_LIMIT,
  });
  logInfo("admin.bookings_export", { userId: user.id, rows: rows.length });

  const csv = toCsv([
    [
      "Date",
      "Time",
      "Client",
      "Phone",
      "Email",
      "Animal",
      "Service",
      "Status",
      "Booked by",
      "Price (R)",
      "Products (R)",
    ],
    ...rows.map((r) => [
      localDateOf(r.start, tz),
      formatTime(r.start, tz),
      r.clientName,
      formatPhone(r.clientPhone),
      r.clientEmail,
      r.petName,
      r.serviceName,
      STATUS_LABELS[r.status],
      SOURCE_LABELS[r.source],
      rands(r.priceCents),
      rands(r.productsCents),
    ]),
  ]);

  return csvResponse(csv, `bookings-${range.from}-to-${range.to}.csv`);
}
