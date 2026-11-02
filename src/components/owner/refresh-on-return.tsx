"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Re-fetches the page when she comes back to the app (switching apps, unlocking the
 * phone), so the list is never stale. No websockets needed.
 */
export function RefreshOnReturn(): null {
  const router = useRouter();
  useEffect(() => {
    const onVisible = (): void => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onVisible);
    };
  }, [router]);
  return null;
}
