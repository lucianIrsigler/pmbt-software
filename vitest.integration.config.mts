import { defineConfig } from "vitest/config";
import { sharedResolve } from "./vitest.config.mjs";

/** Integration tests against a real Postgres test database (see src/test/database.ts). */
export default defineConfig({
  resolve: sharedResolve,
  test: {
    environment: "node",
    include: ["src/**/*.int.test.ts"],
    globalSetup: ["./src/test/global-setup.int.ts"],
    // Test files share one database, so run them one at a time.
    fileParallelism: false,
    testTimeout: 15_000,
    hookTimeout: 60_000,
  },
});
