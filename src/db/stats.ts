import { sql, type SQL } from "drizzle-orm";
import type { Database } from "./client";
import { formatTstzRange, type TimeRange } from "./range";

/**
 * Dashboard statistics, as SQL. An appointment belongs to a range by its start time.
 * "Visits" are appointments marked done: what actually happened. Money is in cents,
 * using the prices saved at the time (appointment.price_cents, appointment_product.price_cents).
 */

export interface BookingCounts {
  total: number;
  booked: number;
  done: number;
  noShow: number;
  cancelled: number;
  /** Didn't come ÷ (done + didn't come); null when there were none. */
  noShowRate: number | null;
}

export interface ClientCounts {
  /** Clients whose first-ever visit falls in the range. */
  new: number;
  /** Clients with a visit in the range who had visited before it. */
  returning: number;
}

export interface KindSplit {
  human: number;
  animal: number;
}

export interface Revenue {
  servicesCents: number;
  productsCents: number;
  totalCents: number;
}

export interface TopItem {
  id: string;
  name: string;
  count: number;
  revenueCents: number;
}

export interface DashboardStats {
  bookings: BookingCounts;
  clients: ClientCounts;
  kinds: KindSplit;
  revenue: Revenue;
  topServices: TopItem[];
  topProducts: TopItem[];
  /** Visits per weekday, Monday first (7 entries). */
  weekdays: number[];
}

const TOP_LIMIT = 5;

/** `lower(appointment.during)` inside the range. */
function startsIn(range: TimeRange, alias = "a"): SQL {
  return sql`lower(${sql.raw(alias)}.during) <@ ${formatTstzRange(range)}::tstzrange`;
}

/** Postgres returns count/sum as bigint strings (or null for an empty sum). */
function num(value: unknown): number {
  return value === null || value === undefined ? 0 : Number(value);
}

export async function bookingCounts(db: Database, range: TimeRange): Promise<BookingCounts> {
  const rows = await db.execute<{ status: string; n: string }>(sql`
    select a.status, count(*) as n from appointment a
    where ${startsIn(range)}
    group by a.status`);
  const by = (status: string): number => num(rows.find((r) => r.status === status)?.n);
  const done = by("done");
  const noShow = by("no_show");
  return {
    total: rows.reduce((sum, r) => sum + num(r.n), 0),
    booked: by("booked"),
    done,
    noShow,
    cancelled: by("cancelled"),
    noShowRate: done + noShow === 0 ? null : noShow / (done + noShow),
  };
}

export async function clientCounts(db: Database, range: TimeRange): Promise<ClientCounts> {
  const [row] = await db.execute<{ new: string; returning: string }>(sql`
    with in_range as (
      select distinct a.client_id from appointment a
      where a.status = 'done' and ${startsIn(range)}
    ),
    first_visit as (
      select a.client_id, min(lower(a.during)) as first_at from appointment a
      where a.status = 'done' and a.client_id in (select client_id from in_range)
      group by a.client_id
    )
    select
      count(*) filter (where first_at >= ${range.start.toISOString()}::timestamptz) as new,
      count(*) filter (where first_at < ${range.start.toISOString()}::timestamptz) as returning
    from first_visit`);
  return { new: num(row?.new), returning: num(row?.returning) };
}

export async function kindSplit(db: Database, range: TimeRange): Promise<KindSplit> {
  const rows = await db.execute<{ for_kind: string; n: string }>(sql`
    select s.for_kind, count(*) as n
    from appointment a join service s on s.id = a.service_id
    where a.status = 'done' and ${startsIn(range)}
    group by s.for_kind`);
  const by = (kind: string): number => num(rows.find((r) => r.for_kind === kind)?.n);
  return { human: by("human"), animal: by("animal") };
}

export async function revenue(db: Database, range: TimeRange): Promise<Revenue> {
  const [row] = await db.execute<{ services: string | null; products: string | null }>(sql`
    select
      (select sum(a.price_cents) from appointment a
        where a.status = 'done' and ${startsIn(range)}) as services,
      (select sum(ap.qty * ap.price_cents)
        from appointment_product ap join appointment a on a.id = ap.appointment_id
        where a.status = 'done' and ${startsIn(range)}) as products`);
  const servicesCents = num(row?.services);
  const productsCents = num(row?.products);
  return { servicesCents, productsCents, totalCents: servicesCents + productsCents };
}

function toTopItems(rows: { id: string; name: string; n: string; cents: string | null }[]) {
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    count: num(r.n),
    revenueCents: num(r.cents),
  }));
}

/** Most-done services: visits and their revenue. */
export async function topServices(db: Database, range: TimeRange): Promise<TopItem[]> {
  const rows = await db.execute<{ id: string; name: string; n: string; cents: string | null }>(sql`
    select s.id, s.name, count(*) as n, sum(a.price_cents) as cents
    from appointment a join service s on s.id = a.service_id
    where a.status = 'done' and ${startsIn(range)}
    group by s.id, s.name
    order by n desc, cents desc, s.name
    limit ${TOP_LIMIT}`);
  return toTopItems(rows);
}

/** Best-selling products: units sold at done visits and their revenue. */
export async function topProducts(db: Database, range: TimeRange): Promise<TopItem[]> {
  const rows = await db.execute<{ id: string; name: string; n: string; cents: string | null }>(sql`
    select p.id, p.name, sum(ap.qty) as n, sum(ap.qty * ap.price_cents) as cents
    from appointment_product ap
      join appointment a on a.id = ap.appointment_id
      join product p on p.id = ap.product_id
    where a.status = 'done' and ${startsIn(range)}
    group by p.id, p.name
    order by n desc, cents desc, p.name
    limit ${TOP_LIMIT}`);
  return toTopItems(rows);
}

export interface MonthlyProductSales {
  /** `YYYY-MM` in the business time zone. */
  month: string;
  product: string;
  units: number;
  revenueCents: number;
}

/**
 * Products sold per month (for stock): units and revenue at done visits, the same rule
 * as `topProducts`, so totals match the dashboard. Oldest month first, then by name.
 */
export async function productSalesByMonth(
  db: Database,
  range: TimeRange,
  tz: string,
): Promise<MonthlyProductSales[]> {
  const rows = await db.execute<{ month: string; product: string; units: string; cents: string }>(
    sql`
    select to_char(lower(a.during) at time zone ${tz}, 'YYYY-MM') as month,
      p.name as product, sum(ap.qty) as units, sum(ap.qty * ap.price_cents) as cents
    from appointment_product ap
      join appointment a on a.id = ap.appointment_id
      join product p on p.id = ap.product_id
    where a.status = 'done' and ${startsIn(range)}
    group by month, p.id, p.name
    order by month, p.name`,
  );
  return rows.map((r) => ({
    month: r.month,
    product: r.product,
    units: num(r.units),
    revenueCents: num(r.cents),
  }));
}

/** Visits per weekday in the business time zone, Monday first. */
export async function busiestWeekdays(
  db: Database,
  range: TimeRange,
  tz: string,
): Promise<number[]> {
  const rows = await db.execute<{ dow: number; n: string }>(sql`
    select extract(isodow from lower(a.during) at time zone ${tz})::int as dow, count(*) as n
    from appointment a
    where a.status = 'done' and ${startsIn(range)}
    group by dow`);
  return [1, 2, 3, 4, 5, 6, 7].map((dow) => num(rows.find((r) => Number(r.dow) === dow)?.n));
}

export async function dashboardStats(
  db: Database,
  range: TimeRange,
  tz: string,
): Promise<DashboardStats> {
  const [bookings, clients, kinds, money, services, products, weekdays] = await Promise.all([
    bookingCounts(db, range),
    clientCounts(db, range),
    kindSplit(db, range),
    revenue(db, range),
    topServices(db, range),
    topProducts(db, range),
    busiestWeekdays(db, range, tz),
  ]);
  return {
    bookings,
    clients,
    kinds,
    revenue: money,
    topServices: services,
    topProducts: products,
    weekdays,
  };
}
