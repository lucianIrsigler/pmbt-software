import { lt, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import { rateLimit } from "@/db/schema";

export interface RateLimitRule {
  /** Maximum hits allowed per window. */
  limit: number;
  windowSeconds: number;
}

export const BOOKING_RATE_LIMIT: RateLimitRule = { limit: 5, windowSeconds: 60 * 60 };

/** Start of the fixed window containing `now`. */
export function windowStart(now: Date, windowSeconds: number): Date {
  const ms = windowSeconds * 1000;
  return new Date(Math.floor(now.getTime() / ms) * ms);
}

/**
 * Records one hit for `key` and reports whether it is within the limit (fixed window,
 * stored in Postgres so it works across processes and restarts).
 */
export async function consumeRateLimit(
  db: Database,
  key: string,
  rule: RateLimitRule,
  now: Date = new Date(),
): Promise<{ allowed: boolean; count: number }> {
  const start = windowStart(now, rule.windowSeconds);
  const [row] = await db
    .insert(rateLimit)
    .values({ key, windowStart: start, count: 1 })
    .onConflictDoUpdate({
      target: [rateLimit.key, rateLimit.windowStart],
      set: { count: sql`${rateLimit.count} + 1` },
    })
    .returning({ count: rateLimit.count });
  const count = row?.count ?? 1;

  // Housekeeping: drop windows older than a day. Cheap; the table stays tiny.
  await db.delete(rateLimit).where(lt(rateLimit.windowStart, new Date(now.getTime() - 86_400_000)));

  return { allowed: count <= rule.limit, count };
}
