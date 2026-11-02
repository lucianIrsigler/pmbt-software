import type { Metadata } from "next";
import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "My bookings", robots: { index: false } };

// The owner's app. Tabs (Today, Calendar, Clients) arrive in Phase 5.
export default async function OwnerAppLayout({
  children,
}: {
  children: ReactNode;
}): Promise<ReactNode> {
  await requireUser();
  return <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">{children}</main>;
}
