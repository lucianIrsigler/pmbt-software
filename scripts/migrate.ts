/**
 * Applies database migrations from ./drizzle with Drizzle's own migrator (a runtime
 * dependency), so production doesn't need drizzle-kit. Same tracking table as
 * `drizzle-kit migrate`, so the two are interchangeable.
 * Usage: pnpm db:migrate (production: node tools/migrate.mjs)
 */
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDb } from "@/db/client";

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const db = createDb(url, { max: 1 });
  try {
    await migrate(db, { migrationsFolder: process.env.MIGRATIONS_DIR ?? "./drizzle" });
    console.log("Migrations applied.");
  } finally {
    await db.$client.end();
  }
}

main().catch((error: unknown) => {
  console.error("migrate failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
