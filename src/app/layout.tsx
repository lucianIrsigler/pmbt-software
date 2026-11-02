import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "PBMT & Natural Products",
  description: "Photobiomodulation therapy and natural products for you and your animals.",
};

export default function RootLayout({ children }: { children: ReactNode }): ReactNode {
  return (
    <html lang="en-ZA" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
