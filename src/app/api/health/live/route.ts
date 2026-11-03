/**
 * Liveness: the app process is up and answering. Deliberately doesn't touch the
 * database, so a database outage never marks the app container itself as broken.
 * Used by Docker's HEALTHCHECK. See also /api/health (readiness, checks the database).
 */
export const dynamic = "force-dynamic";

export function GET(): Response {
  return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
}
