import { ownerAppManifest } from "@/lib/manifest";

/**
 * Served by hand (rather than `app/manifest.ts`) so that only the owner's app links to
 * it: clients browsing the public site shouldn't be offered "Install My bookings".
 */
export const dynamic = "force-static";

export function GET(): Response {
  return new Response(JSON.stringify(ownerAppManifest()), {
    headers: { "Content-Type": "application/manifest+json" },
  });
}
