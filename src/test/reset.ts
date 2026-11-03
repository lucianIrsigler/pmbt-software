import { sql } from "drizzle-orm";
import type { Database } from "@/db/client";

/**
 * Empties every business table (logins and sessions are left alone), so an integration
 * test file starts from a known state. Test files run one at a time, so this is safe.
 */
export async function resetBusinessTables(db: Database): Promise<void> {
  await db.execute(
    sql`truncate appointment_product, appointment, pet, client, service, product, working_hours, settings, time_off`,
  );
}
