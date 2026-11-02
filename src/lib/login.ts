import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import { user } from "@/db/schema";
import { dummyPasswordHash, verifyPassword } from "./password";
import { consumeRateLimit, type RateLimitRule } from "./rate-limit";
import { createSession } from "./session";

/** Generous for a person who mistypes; tight for a password-guessing script. */
export const LOGIN_RATE_LIMIT_PER_EMAIL: RateLimitRule = { limit: 10, windowSeconds: 15 * 60 };
export const LOGIN_RATE_LIMIT_PER_IP: RateLimitRule = { limit: 30, windowSeconds: 15 * 60 };

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().max(254),
  password: z.string().max(200),
});

export type LoginResult =
  | { ok: true; userId: string; token: string; expiresAt: Date }
  | { ok: false; reason: "invalid" | "rate_limited" };

/**
 * Checks email + password and starts a session. Both rate limits are consumed before
 * the password is checked. Unknown emails still run a full argon2 verify so the
 * response time doesn't reveal which emails exist.
 */
export async function attemptLogin(
  db: Database,
  input: { email: string; password: string; ipKey: string },
  now: Date = new Date(),
): Promise<LoginResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const { email, password } = parsed.data;

  const [byIp, byEmail] = await Promise.all([
    consumeRateLimit(db, `login:ip:${input.ipKey}`, LOGIN_RATE_LIMIT_PER_IP, now),
    consumeRateLimit(db, `login:email:${email}`, LOGIN_RATE_LIMIT_PER_EMAIL, now),
  ]);
  if (!byIp.allowed || !byEmail.allowed) return { ok: false, reason: "rate_limited" };

  const [row] = await db
    .select({ id: user.id, passwordHash: user.passwordHash })
    .from(user)
    .where(eq(sql`lower(${user.email})`, email));

  const valid = await verifyPassword(row?.passwordHash ?? (await dummyPasswordHash()), password);
  if (!row || !valid) return { ok: false, reason: "invalid" };

  const { token, expiresAt } = await createSession(db, row.id, now);
  return { ok: true, userId: row.id, token, expiresAt };
}
