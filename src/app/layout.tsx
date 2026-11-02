import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "PBMT & Natural Products", template: "%s · PBMT & Natural Products" },
  description: "Photobiomodulation therapy and natural products for you and your animals.",
};

export const viewport: Viewport = {
  themeColor: "#1f5f4a",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }): ReactNode {
  return (
    <html lang="en-ZA" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
