import { createDb } from "@/db/client";
import { seed } from "@/db/seed";
import { getEnv } from "@/lib/env";

async function main(): Promise<void> {
  const db = createDb(getEnv().DATABASE_URL, { max: 1 });
  try {
    const result = await seed(db);
    console.log("Seed complete. Rows inserted:", result);
  } finally {
    await db.$client.end();
  }
}

main().catch((error: unknown) => {
  console.error("Seed failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
