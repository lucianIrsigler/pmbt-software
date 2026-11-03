/*
 * Service worker for the owner's app (registered with scope /app).
 *
 * - Static files (/_next/static/…, icons) are saved the first time they load. Their
 *   names change with every release, so a saved copy is never out of date.
 * - Pages always come from the server. Without internet, the saved /offline page is
 *   shown instead.
 * - Nothing else is saved: no bookings, no client data, no server actions.
 *
 * Bump VERSION to clear old saved files.
 */
const VERSION = "v1";
const CACHE = `static-${VERSION}`;
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: "reload" })))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** Hashed build files and icons: safe to keep. */
function isStaticAsset(url) {
  return (
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/_next/static/") ||
      url.pathname.startsWith("/icons/") ||
      url.pathname.startsWith("/apple-icon"))
  );
}

async function pageOrOffline(request) {
  try {
    return await fetch(request);
  } catch {
    const offline = await caches.match(OFFLINE_URL);
    return offline ?? Response.error();
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  if (request.mode === "navigate") {
    event.respondWith(pageOrOffline(request));
    return;
  }
  if (isStaticAsset(new URL(request.url))) {
    event.respondWith(cacheFirst(request));
  }
  // Everything else (data, server components, server actions) goes straight to the network.
});
