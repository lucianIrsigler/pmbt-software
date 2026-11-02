import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { getEnv } from "./env";
import { SESSION_COOKIE, sessionCookieOptions, validateSession, type SessionUser } from "./session";

/**
 * Next.js glue for sessions. Pages call `requireUser()`; every server action under
 * /app or /admin must call it too (the proxy is only an optimistic check).
 */

/** Sets the session cookie. Only callable from server actions and route handlers. */
export async function setSessionCookie(token: string): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions(getEnv().APP_URL));
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function getSessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

/** The signed-in user, or null. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  return validateSession(getDb(), await getSessionToken());
}

/** The signed-in user; redirects to /login if there isn't one. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Only allow redirecting back into the owner app or admin after login. */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/app";
  return /^\/(app|admin)(\/|$|\?)/.test(next) ? next : "/app";
}
