import { NextResponse, type NextRequest } from "next/server";
import { getEnv } from "@/lib/env";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";

/**
 * Optimistic gate for the owner app and admin: no session cookie means straight to
 * /login. The real check (against the database) happens in pages and server actions.
 * Also slides the cookie's lifetime forward so an active session never lapses.
 */
export function proxy(request: NextRequest): NextResponse {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(login);
  }

  const response = NextResponse.next();
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(getEnv().APP_URL));
  return response;
}

export const config = {
  matcher: ["/app", "/app/:path*", "/admin", "/admin/:path*", "/no-access"],
};
