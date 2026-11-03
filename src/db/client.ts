import "server-only";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Database = PostgresJsDatabase<typeof schema> & { $client: postgres.Sql };

/** The `tx` handed to a `db.transaction(...)` callback. */
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * Creates a Drizzle client. The session time zone is pinned to UTC so values
 * read back from Postgres never depend on server settings.
 */
export function createDb(url: string, options: { max?: number } = {}): Database {
  const client = postgres(url, {
    max: options.max ?? 10,
    connection: { TimeZone: "UTC" },
    onnotice: () => {},
  });
  return drizzle(client, { schema });
}
