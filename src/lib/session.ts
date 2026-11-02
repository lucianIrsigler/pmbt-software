import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import type { Database } from "@/db/client";
import { session, user } from "@/db/schema";

/**
 * DB-backed sessions. The browser holds a random token; we store only its SHA-256 hash,
 * so a database leak can't be used to log in. Sessions last 90 days and are extended
 * on use, so the owner rarely has to sign in again.
 */

export const SESSION_COOKIE = "session";
export const SESSION_DAYS = 90;
const DAY_MS = 86_400_000;
const SESSION_MS = SESSION_DAYS * DAY_MS;
/** Extend at most once a day, to avoid a write on every request. */
const REFRESH_AFTER_MS = DAY_MS;

export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function sessionExpiry(now: Date): Date {
  return new Date(now.getTime() + SESSION_MS);
}

/** Creates a session and returns the token for the cookie. */
export async function createSession(
  db: Database,
  userId: string,
  now: Date = new Date(),
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateSessionToken();
  const expiresAt = sessionExpiry(now);
  await db.insert(session).values({ id: hashSessionToken(token), userId, expiresAt });
  // Housekeeping: remove this user's expired sessions.
  await db.delete(session).where(and(eq(session.userId, userId), lt(session.expiresAt, now)));
  return { token, expiresAt };
}

/**
 * The user for a session token, or null if unknown or expired. Slides the expiry
 * forward (at most once a day) so an active user stays signed in.
 */
export async function validateSession(
  db: Database,
  token: string | undefined,
  now: Date = new Date(),
): Promise<SessionUser | null> {
  if (!token || token.length > 100) return null;
  const id = hashSessionToken(token);

  const [row] = await db
    .select({
      expiresAt: session.expiresAt,
      user: { id: user.id, email: user.email, name: user.name },
    })
    .from(session)
    .innerJoin(user, eq(user.id, session.userId))
    .where(and(eq(session.id, id), gt(session.expiresAt, now)));
  if (!row) return null;

  if (row.expiresAt.getTime() - now.getTime() < SESSION_MS - REFRESH_AFTER_MS) {
    await db
      .update(session)
      .set({ expiresAt: sessionExpiry(now) })
      .where(eq(session.id, id));
  }
  return row.user;
}

export async function deleteSession(db: Database, token: string | undefined): Promise<void> {
  if (!token) return;
  await db.delete(session).where(eq(session.id, hashSessionToken(token)));
}

export interface SessionCookieOptions {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: "/";
  maxAge: number;
}

/**
 * Cookie settings. `secure` follows APP_URL (always https in production) rather than
 * the request, because behind Caddy the app itself only ever sees plain http.
 */
export function sessionCookieOptions(appUrl: string): SessionCookieOptions {
  return {
    httpOnly: true,
    secure: new URL(appUrl).protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  };
}
