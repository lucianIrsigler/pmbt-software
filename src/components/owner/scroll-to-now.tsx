"use client";

import { useEffect } from "react";

/**
 * On first open, scrolls the visible "Now" line into view when it is below the screen.
 * Runs once per page load: refreshing on return doesn't move her away from where she is.
 */
export function ScrollToNow(): null {
  useEffect(() => {
    const lines = document.querySelectorAll<HTMLElement>("[data-now-line]");
    // The phone and week views are both in the page; only one is displayed.
    const line = Array.from(lines).find((el) => el.offsetParent !== null);
    if (!line) return;
    if (line.getBoundingClientRect().top > window.innerHeight - 80) {
      line.scrollIntoView({ block: "center" });
    }
  }, []);
  return null;
}
