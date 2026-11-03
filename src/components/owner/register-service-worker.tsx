"use client";

import { useEffect } from "react";

/**
 * Registers public/sw.js for the owner's app. Production only: in development, file
 * names aren't hashed, so saved copies would hide code changes.
 */
export function RegisterServiceWorker(): null {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/app" }).catch(() => {
      // Not critical: the app works without it, just without the offline page.
    });
  }, []);
  return null;
}
