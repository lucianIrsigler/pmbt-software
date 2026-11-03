import "server-only";
import { resolveRange, type DateRange } from "@/domain/date-range";
import { localDateOf } from "@/domain/time";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { requestContext, type RequestContext } from "@/lib/request";
import type { SessionUser } from "@/lib/session";

/** Shared plumbing for the admin CSV downloads (route handlers, so no redirects). */

export interface CsvExportContext extends RequestContext {
  user: SessionUser;
  params: URLSearchParams;
  range: DateRange;
}

/**
 * The signed-in admin, the request and the date range from `?range=…&from=…&to=…`;
 * or a 401/403 response to return as is.
 */
export async function adminCsvContext(request: Request): Promise<CsvExportContext | Response> {
  const user = await getCurrentUser();
  if (!user) return new Response("Please sign in.", { status: 401 });
  if (!(await can(user.role, "admin"))) return new Response("Not allowed.", { status: 403 });

  const ctx = await requestContext();
  const params = new URL(request.url).searchParams;
  const range = resolveRange(
    {
      range: params.get("range") ?? undefined,
      from: params.get("from") ?? undefined,
      to: params.get("to") ?? undefined,
    },
    localDateOf(ctx.now, ctx.tz),
  );
  return { ...ctx, user, params, range };
}

/** Rands with two decimals, as a plain number spreadsheets can add up. */
export function rands(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** A CSV download that is never cached or indexed. */
export function csvResponse(csv: string, filename: string): Response {
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
