import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export const sharedResolve = {
  alias: {
    "@": fileURLToPath(new URL("./src", import.meta.url)),
    // `server-only` throws outside React Server Components; tests run in plain Node.
    "server-only": fileURLToPath(new URL("./src/test/server-only-stub.ts", import.meta.url)),
  },
};

/** Unit tests: fast, no database. Integration tests live in vitest.integration.config.mts. */
export default defineConfig({
  resolve: sharedResolve,
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    exclude: ["src/**/*.int.test.ts"],
  },
});
