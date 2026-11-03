import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { input } from "@/components/ui";
import {
  bookingFilterSchema,
  countAdminBookings,
  listAdminBookings,
  PAGE_SIZE,
} from "@/domain/admin-bookings";
import { rangeInstants, rangeQuery, resolveRange } from "@/domain/date-range";
import { localDateOf } from "@/domain/time";
import { formatPrice, formatTime } from "@/lib/format";
import { requestContext } from "@/lib/request";
import { adminButton, adminButtonSecondary, RangePicker } from "../components";
import { SOURCE_LABELS, STATUS_LABELS } from "./labels";

export const metadata: Metadata = { title: "Bookings" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function shortDate(instant: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(instant);
}

export default async function AdminBookingsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<ReactNode> {
  const { db, tz, now } = await requestContext();
  const params = await searchParams;
  const range = resolveRange(
    { range: one(params.range), from: one(params.from), to: one(params.to) },
    localDateOf(now, tz),
  );
  const filter = bookingFilterSchema.parse({
    status: one(params.status),
    source: one(params.source),
  });
  const page = Math.max(1, Math.floor(Number(one(params.page) ?? "1")) || 1);
  const instants = rangeInstants(range, tz);
  const [rows, total] = await Promise.all([
    listAdminBookings(db, instants, filter, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
    countAdminBookings(db, instants, filter),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const filterParams: Record<string, string> = {
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.source ? { source: filter.source } : {}),
  };
  const query = (extra: Record<string, string> = {}): string =>
    new URLSearchParams({ ...rangeQuery(range), ...filterParams, ...extra }).toString();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">Bookings</h1>
        <a href={`/admin/bookings.csv?${query()}`} className={adminButton} download>
          Download CSV
        </a>
      </div>

      <RangePicker range={range} path="/admin/bookings" keep={filterParams} />

      <form action="/admin/bookings" className="flex flex-wrap items-end gap-3">
        {Object.entries(rangeQuery(range)).map(([key, value]) => (
          <input key={key} type="hidden" name={key} value={value} />
        ))}
        <label className="flex flex-col gap-1 font-semibold">
          Status
          <select name="status" defaultValue={filter.status ?? ""} className={input}>
            <option value="">Any</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 font-semibold">
          Booked by
          <select name="source" defaultValue={filter.source ?? ""} className={input}>
            <option value="">Anyone</option>
            {Object.entries(SOURCE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className={adminButton}>
          Filter
        </button>
      </form>

      <p className="text-ink-soft">
        {total === 1 ? "1 booking" : `${total} bookings`}
        {pages > 1 && `, page ${page} of ${pages}`}.
      </p>

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-line bg-card">
          <table className="w-full min-w-[56rem] border-collapse text-left">
            <thead className="border-b-2 border-line">
              <tr>
                {[
                  "When",
                  "Client",
                  "Animal",
                  "Service",
                  "Status",
                  "Booked by",
                  "Price",
                  "Products",
                ].map((heading) => (
                  <th key={heading} scope="col" className="px-3 py-2 font-semibold">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-0">
                  <td className="px-3 py-2 whitespace-nowrap">
                    <Link href={`/app/appointment/${r.id}`} className="text-accent underline">
                      {shortDate(r.start, tz)} {formatTime(r.start, tz)}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{r.clientName}</td>
                  <td className="px-3 py-2">{r.petName ?? "–"}</td>
                  <td className="px-3 py-2">{r.serviceName}</td>
                  <td className="px-3 py-2">{STATUS_LABELS[r.status]}</td>
                  <td className="px-3 py-2">{SOURCE_LABELS[r.source]}</td>
                  <td className="px-3 py-2 tabular-nums">{formatPrice(r.priceCents)}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {r.productsCents ? formatPrice(r.productsCents) : "–"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <nav aria-label="Pages" className="flex gap-3">
          {page > 1 && (
            <Link
              href={`/admin/bookings?${query({ page: String(page - 1) })}`}
              className={adminButtonSecondary}
            >
              ← Newer
            </Link>
          )}
          {page < pages && (
            <Link
              href={`/admin/bookings?${query({ page: String(page + 1) })}`}
              className={adminButtonSecondary}
            >
              Older →
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
