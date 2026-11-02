import { execSync } from "node:child_process";
import { e2eDatabaseUrl, recreateDatabase } from "../src/test/database";
import { E2E_USER } from "./user";

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
  // Exercise the real user:create script with piped answers.
  execSync("pnpm user:create", {
    env,
    input: `${[E2E_USER.email, E2E_USER.name, E2E_USER.password, E2E_USER.password].join("\n")}\n`,
    stdio: ["pipe", "ignore", "inherit"],
  });
}
