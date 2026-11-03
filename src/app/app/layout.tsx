import type { Metadata } from "next";
import type { ReactNode } from "react";
import { RegisterServiceWorker } from "@/components/owner/register-service-worker";
import { TabBar } from "@/components/owner/tab-bar";
import { requireAccess } from "@/lib/auth";

export const metadata: Metadata = {
  title: "My bookings",
  robots: { index: false },
  // Installable as an app on her phone (see src/lib/manifest.ts).
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "My bookings", statusBarStyle: "default" },
};

/** The owner's app: mobile-first, three bottom tabs. */
export default async function OwnerAppLayout({
  children,
}: {
  children: ReactNode;
}): Promise<ReactNode> {
  await requireAccess("app");
  return (
    <>
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pt-6 pb-28">{children}</main>
      <TabBar />
      <RegisterServiceWorker />
    </>
  );
}
