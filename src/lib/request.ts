import "server-only";
import { connection } from "next/server";
import { getDb, type Database } from "@/db";
import { getEnv } from "./env";

export interface RequestContext {
  db: Database;
  tz: string;
  /** The request time. Read after `connection()` so it is never baked into a prerender. */
  now: Date;
}

/**
 * Entry point for reading data in pages and server actions. Waits for a real request
 * first, so pages that touch the database are never prerendered at build time.
 */
export async function requestContext(): Promise<RequestContext> {
  await connection();
  return { db: getDb(), tz: getEnv().BUSINESS_TZ, now: new Date() };
}
