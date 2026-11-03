import { rangeInstants } from "@/domain/date-range";
import { productSalesByMonth } from "@/db/stats";
import { toCsv } from "@/lib/csv";
import { logInfo } from "@/lib/log";
import { adminCsvContext, csvResponse, rands } from "../csv-export";

/**
 * Products sold per month, for stock: units and revenue at done visits (the same rule as
 * "Top products" on the dashboard). No client details.
 */
export async function GET(request: Request): Promise<Response> {
  const ctx = await adminCsvContext(request);
  if (ctx instanceof Response) return ctx;
  const { db, tz, user, range } = ctx;

  const rows = await productSalesByMonth(db, rangeInstants(range, tz), tz);
  logInfo("admin.products_export", { userId: user.id, rows: rows.length });

  const csv = toCsv([
    ["Month", "Product", "Units", "Revenue (R)"],
    ...rows.map((r) => [r.month, r.product, r.units, rands(r.revenueCents)]),
  ]);
  return csvResponse(csv, `products-sold-${range.from}-to-${range.to}.csv`);
}
