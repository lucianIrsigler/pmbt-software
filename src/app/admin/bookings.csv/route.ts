import { bookingFilterSchema, EXPORT_LIMIT, listAdminBookings } from "@/domain/admin-bookings";
import { rangeInstants, resolveRange } from "@/domain/date-range";
import { localDateOf } from "@/domain/time";
import { getCurrentUser } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { formatPhone, formatTime } from "@/lib/format";
import { logInfo } from "@/lib/log";
import { can } from "@/lib/permissions";
import { requestContext } from "@/lib/request";
import { SOURCE_LABELS, STATUS_LABELS } from "../bookings/labels";

/** Rands with two decimals, as a plain number spreadsheets can add up. */
function rands(cents: number): string {
  return (cents / 100).toFixed(2);
}

/**
 * CSV export of the bookings table, with the same filters. Contains personal
 * information (POPIA), so it needs a login and is never cached.
 */
export async function GET(request: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return new Response("Please sign in.", { status: 401 });
  if (!(await can(user.role, "admin"))) return new Response("Not allowed.", { status: 403 });

  const { db, tz, now } = await requestContext();
  const params = new URL(request.url).searchParams;
  const range = resolveRange(
    {
      range: params.get("range") ?? undefined,
      from: params.get("from") ?? undefined,
      to: params.get("to") ?? undefined,
    },
    localDateOf(now, tz),
  );
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

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="bookings-${range.from}-to-${range.to}.csv"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
