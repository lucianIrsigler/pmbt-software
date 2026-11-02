import "server-only";
import { getEnv } from "@/lib/env";
import { createDb, type Database } from "./client";

export type { Database } from "./client";

// Reuse one connection pool across hot reloads in development.
const globalForDb = globalThis as unknown as { db?: Database };

export const db: Database = globalForDb.db ?? createDb(getEnv().DATABASE_URL);
if (getEnv().NODE_ENV !== "production") globalForDb.db = db;
