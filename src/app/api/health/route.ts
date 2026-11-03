import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { logError } from "@/lib/log";

/**
 * Readiness: the app can serve requests, including reaching the database. Used by the
 * deploy workflow after each deploy. Never reveals error details.
 */
export const dynamic = "force-dynamic";

const DB_TIMEOUT_MS = 3_000;

async function databaseReachable(): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("health check timed out")), DB_TIMEOUT_MS);
  });
  try {
    await Promise.race([getDb().execute(sql`select 1`), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(): Promise<Response> {
  const headers = { "Cache-Control": "no-store" };
  try {
    await databaseReachable();
    return Response.json({ status: "ok", database: "ok" }, { headers });
  } catch (error) {
    logError("health.database", error);
    return Response.json({ status: "error", database: "unreachable" }, { status: 503, headers });
  }
}
