import { resetDatabase, testDatabaseUrl } from "./database";

/** Drops, recreates and migrates the test database once per `pnpm test:int` run. */
export default async function setup(): Promise<void> {
  await resetDatabase(testDatabaseUrl(), ["_test"]);
}
