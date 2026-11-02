/**
 * Helpers for integration tests that need a real Postgres.
 *
 * Tests run against a separate database (by default `<dev db name>_test`) that the
 * global setup drops, recreates and migrates before every run. The dev database is
 * never touched.
 */

function loadDotEnv(): void {
  try {
    process.loadEnvFile();
  } catch {
    // No .env file (e.g. CI): use the real environment.
  }
}

/** URL of the test database: `TEST_DATABASE_URL`, or `DATABASE_URL` with `_test` appended to the db name. */
export function testDatabaseUrl(): string {
  loadDotEnv();
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;

  const base = process.env.DATABASE_URL;
  if (!base) throw new Error("Set DATABASE_URL or TEST_DATABASE_URL to run integration tests");
  const url = new URL(base);
  url.pathname = `${url.pathname.replace(/^\//, "")}_test`;
  return url.toString();
}

/** URL for the server's maintenance database, used to create/drop the test database. */
export function maintenanceUrl(testUrl: string): string {
  const url = new URL(testUrl);
  url.pathname = "/postgres";
  return url.toString();
}

export function databaseName(dbUrl: string): string {
  return decodeURIComponent(new URL(dbUrl).pathname.replace(/^\//, ""));
}

function assertThrowaway(name: string, allowedSuffixes: readonly string[]): void {
  if (!allowedSuffixes.some((suffix) => name.endsWith(suffix))) {
    throw new Error(
      `Refusing to reset "${name}": name must end in ${allowedSuffixes.join(" or ")}`,
    );
  }
}

/**
 * Drops and recreates an empty throwaway database. Refuses unless the name ends in one
 * of `allowedSuffixes`, so it can never wipe real data.
 */
export async function recreateDatabase(
  url: string,
  allowedSuffixes: readonly string[],
): Promise<void> {
  const { default: postgres } = await import("postgres");
  const name = databaseName(url);
  assertThrowaway(name, allowedSuffixes);

  const admin = postgres(maintenanceUrl(url), { max: 1, onnotice: () => {} });
  try {
    await admin.unsafe(`drop database if exists "${name}" with (force)`);
    await admin.unsafe(`create database "${name}"`);
  } finally {
    await admin.end();
  }
}

/** Recreates a throwaway database and applies all migrations. */
export async function resetDatabase(
  url: string,
  allowedSuffixes: readonly string[] = ["_test"],
): Promise<void> {
  await recreateDatabase(url, allowedSuffixes);
  const { migrate } = await import("drizzle-orm/postgres-js/migrator");
  const { createDb } = await import("@/db/client");
  const db = createDb(url, { max: 1 });
  try {
    await migrate(db, { migrationsFolder: "./drizzle" });
  } finally {
    await db.$client.end();
  }
}

/** URL of the e2e database: `E2E_DATABASE_URL`, or `DATABASE_URL` with `_e2e` appended. */
export function e2eDatabaseUrl(): string {
  loadDotEnv();
  if (process.env.E2E_DATABASE_URL) return process.env.E2E_DATABASE_URL;
  const base = process.env.DATABASE_URL;
  if (!base) throw new Error("Set DATABASE_URL or E2E_DATABASE_URL to run e2e tests");
  const url = new URL(base);
  url.pathname = `${url.pathname.replace(/^\//, "")}_e2e`;
  return url.toString();
}
