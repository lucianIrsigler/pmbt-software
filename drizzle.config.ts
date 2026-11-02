import { defineConfig } from "drizzle-kit";

// drizzle-kit runs outside Next.js, so load .env ourselves (if present).
try {
  process.loadEnvFile();
} catch {
  // No .env file: rely on the real environment (e.g. CI, production).
}

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
