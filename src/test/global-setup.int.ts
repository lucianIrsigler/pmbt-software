import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { createDb } from "@/db/client";
import { databaseName, maintenanceUrl, testDatabaseUrl } from "./database";

/** Drops, recreates and migrates the test database once per `pnpm test:int` run. */
export default async function setup(): Promise<void> {
  const url = testDatabaseUrl();
  const name = databaseName(url);
  if (!name.endsWith("_test")) {
    throw new Error(`Refusing to reset "${name}": test database names must end in _test`);
  }

  const admin = postgres(maintenanceUrl(url), { max: 1, onnotice: () => {} });
  try {
    await admin.unsafe(`drop database if exists "${name}" with (force)`);
    await admin.unsafe(`create database "${name}"`);
  } finally {
    await admin.end();
  }

  const db = createDb(url, { max: 1 });
  try {
    await migrate(db, { migrationsFolder: "./drizzle" });
  } finally {
    await db.$client.end();
  }
}
