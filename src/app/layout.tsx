import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";
import type { ReactNode } from "react";
import { THEME_COLOR } from "@/lib/brand";
import "./globals.css";

/**
 * Headings font. next/font downloads it at build time and serves it from this app, so
 * visitors never contact Google.
 */
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
  variable: "--font-poppins",
});

export const metadata: Metadata = {
  title: { default: "Daisy Healing", template: "%s · Daisy Healing" },
  description:
    "Light therapy (PBMT) and natural creams for pets and people. Book a session online.",
};

export const viewport: Viewport = {
  themeColor: THEME_COLOR,
  // The site is designed light only. Stops phone browsers (Samsung Internet, Chrome's
  // auto dark mode) from inverting it, which changes its colours.
  colorScheme: "only light",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }): ReactNode {
  return (
    <html lang="en-ZA" className={`h-full antialiased ${poppins.variable}`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
