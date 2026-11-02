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
