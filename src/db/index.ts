import "server-only";
import { getEnv } from "@/lib/env";
import { createDb, type Database } from "./client";

export type { Database } from "./client";

// One connection pool per process, reused across hot reloads in development.
const globalForDb = globalThis as unknown as { db?: Database };

/**
 * The app's database client, created on first use (not at import time, so
 * `next build` never needs DATABASE_URL).
 */
export function getDb(): Database {
  globalForDb.db ??= createDb(getEnv().DATABASE_URL);
  return globalForDb.db;
}
