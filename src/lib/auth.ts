import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { getEnv } from "./env";
import { can, type Area } from "./permissions";
import { SESSION_COOKIE, sessionCookieOptions, validateSession, type SessionUser } from "./session";

/**
 * Next.js glue for sessions. Pages and every server action under /app or /admin call
 * `requireAccess(area)` (the proxy is only an optimistic check for a cookie).
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
  // Read the cookie *before* touching the database: that marks the page as per-request,
  // so `next build` never tries to prerender it (which would need the runtime config).
  const token = await getSessionToken();
  return validateSession(getDb(), token);
}

/** The signed-in user; redirects to /login if there isn't one. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Where a signed-in user lands when their role may not open an area. */
export const NO_ACCESS_PATH = "/no-access";

/**
 * The signed-in user, if their role may open `area` (see `permissions.ts`). Redirects
 * to /login without a session, and to the "no access" page without permission.
 */
export async function requireAccess(area: Area): Promise<SessionUser> {
  const user = await requireUser();
  if (!(await can(user.role, area))) redirect(NO_ACCESS_PATH);
  return user;
}

/** Only allow redirecting back into the owner app or admin after login. */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/app";
  return /^\/(app|admin)(\/|$|\?)/.test(next) ? next : "/app";
}
