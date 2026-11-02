import { execSync } from "node:child_process";
import { e2eDatabaseUrl, recreateDatabase } from "../src/test/database";

/**
 * Fresh, seeded e2e database for every run. Uses the real `db:migrate` and `db:seed`
 * scripts, so those are exercised too. The web server only connects on first request,
 * so recreating the database here (after Playwright starts it) is safe.
 */
export default async function globalSetup(): Promise<void> {
  const url = e2eDatabaseUrl();
  await recreateDatabase(url, ["_e2e"]);
  const env = { ...process.env, DATABASE_URL: url };
  execSync("pnpm db:migrate", { env, stdio: "ignore" });
  execSync("pnpm db:seed", { env, stdio: "ignore" });
}
