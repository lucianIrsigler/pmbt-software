import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = { title: "You're offline", robots: { index: false } };

/** Never uses the database: the service worker saves this page to show without internet. */
export const dynamic = "force-static";

/**
 * Shown by the service worker (public/sw.js) when a page can't load. Styled inline so it
 * looks right even if the stylesheet wasn't saved.
 */
export default function OfflinePage(): ReactNode {
  return (
    <main
      style={{
        margin: "0 auto",
        maxWidth: "36rem",
        padding: "3rem 1rem",
        display: "flex",
        flexDirection: "column",
        gap: "1.25rem",
        fontFamily: "system-ui, sans-serif",
        fontSize: "20px",
        lineHeight: 1.5,
        color: "#1d1a16",
      }}
    >
      <h1 style={{ fontSize: "2rem", fontWeight: 700, margin: 0 }}>You&apos;re offline</h1>
      <p style={{ margin: 0 }}>
        This phone isn&apos;t connected to the internet right now. Check your Wi-Fi or mobile data,
        then tap the button below.
      </p>
      {/* An empty href reloads the page she was trying to open. */}
      <a
        href=""
        style={{
          display: "flex",
          minHeight: "3.5rem",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "0.75rem",
          background: "#1f5f4a",
          color: "#ffffff",
          fontWeight: 700,
          fontSize: "1.25rem",
          textDecoration: "none",
        }}
      >
        Try again
      </a>
    </main>
  );
}
