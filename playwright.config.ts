import { defineConfig, devices } from "@playwright/test";
import { OUTBOX_DIR } from "./e2e/outbox";
import { e2eDatabaseUrl } from "./src/test/database";

const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  // Tests share one database and book real slots, so run them one at a time.
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [{ name: "mobile", use: { ...devices["Pixel 7"] } }],
  webServer: {
    // A production build: what we ship, and it can run alongside `pnpm dev`.
    command: `pnpm build && pnpm start --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 240_000,
    env: {
      ...(process.env as Record<string, string>),
      DATABASE_URL: e2eDatabaseUrl(),
      APP_URL: BASE_URL,
      // `next start` runs in production mode, which requires SMTP settings (never used: see below).
      SMTP_HOST: process.env.SMTP_HOST || "localhost",
      MAIL_FROM: process.env.MAIL_FROM || "e2e@example.com",
      // Emails are written to files here instead of being sent; tests read them.
      EMAIL_OUTBOX_DIR: OUTBOX_DIR,
    },
  },
});
