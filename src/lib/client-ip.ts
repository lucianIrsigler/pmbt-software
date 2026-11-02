import { createHmac } from "node:crypto";

/**
 * The client's IP address as seen by our reverse proxy (Caddy appends the real peer
 * address as the *last* X-Forwarded-For entry; earlier entries are client-supplied).
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  const last = forwarded?.split(",").at(-1)?.trim();
  return last || headers.get("x-real-ip")?.trim() || "unknown";
}

/**
 * A stable, non-reversible key for an IP address, for rate limiting. IP addresses are
 * personal information (POPIA), so we never store them in plain text.
 */
export function ipKey(ip: string, secret: string): string {
  return createHmac("sha256", secret).update(ip).digest("base64url").slice(0, 22);
}
