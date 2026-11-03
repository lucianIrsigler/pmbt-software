import type { Metadata } from "next";
import type { ReactNode } from "react";
import { dashboardStats } from "@/db/stats";
import { rangeInstants, resolveRange } from "@/domain/date-range";
import { localDateOf } from "@/domain/time";
import { formatPrice } from "@/lib/format";
import { requestContext } from "@/lib/request";
import { adminCard, BarList, RangePicker, Stat } from "./components";

export const metadata: Metadata = { title: "Dashboard" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function one(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function percent(rate: number | null): string {
  return rate === null ? "–" : `${Math.round(rate * 100)}%`;
}

export default async function DashboardPage({
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
  const stats = await dashboardStats(db, rangeInstants(range, tz), tz);
  const { bookings, clients, kinds, revenue } = stats;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold">Dashboard</h1>
      <RangePicker range={range} path="/admin" />

      <div className="grid gap-4 md:grid-cols-2">
        <section className={adminCard} aria-label="Bookings">
          <h2 className="mb-3 text-xl font-bold">Bookings</h2>
          <dl className="grid grid-cols-3 gap-4">
            <Stat label="Total" value={String(bookings.total)} />
            <Stat label="Done" value={String(bookings.done)} />
            <Stat label="Didn't come" value={String(bookings.noShow)} />
            <Stat label="Cancelled" value={String(bookings.cancelled)} />
            <Stat label="Still booked" value={String(bookings.booked)} />
            <Stat
              label="No-show rate"
              value={percent(bookings.noShowRate)}
              note="of done + didn't come"
            />
          </dl>
        </section>

        <section className={adminCard} aria-label="Estimated revenue">
          <h2 className="mb-3 text-xl font-bold">Estimated revenue</h2>
          <dl className="grid grid-cols-3 gap-4">
            <Stat label="Total" value={formatPrice(revenue.totalCents)} />
            <Stat label="Services" value={formatPrice(revenue.servicesCents)} />
            <Stat label="Products" value={formatPrice(revenue.productsCents)} />
          </dl>
          <p className="mt-3 text-sm text-ink-soft">
            From visits marked done, at the prices at the time.
          </p>
        </section>

        <section className={adminCard} aria-label="Clients">
          <h2 className="mb-3 text-xl font-bold">Clients with a visit</h2>
          <dl className="grid grid-cols-3 gap-4">
            <Stat label="New" value={String(clients.new)} note="first visit ever" />
            <Stat label="Returning" value={String(clients.returning)} />
          </dl>
        </section>

        <section className={adminCard} aria-label="People and animals">
          <h2 className="mb-3 text-xl font-bold">Visits: people and animals</h2>
          <dl className="grid grid-cols-3 gap-4">
            <Stat label="People" value={String(kinds.human)} />
            <Stat label="Animals" value={String(kinds.animal)} />
          </dl>
        </section>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <BarList
          title="Top services"
          bars={stats.topServices.map((s) => ({
            label: s.name,
            value: s.count,
            display: `${s.count} · ${formatPrice(s.revenueCents)}`,
          }))}
        />
        <BarList
          title="Top products"
          bars={stats.topProducts.map((p) => ({
            label: p.name,
            value: p.count,
            display: `${p.count} sold · ${formatPrice(p.revenueCents)}`,
          }))}
        />
      </div>

      <BarList
        title="Busiest weekdays (visits)"
        bars={stats.weekdays.map((n, i) => ({ label: WEEKDAYS[i] ?? "", value: n }))}
      />
    </div>
  );
}
