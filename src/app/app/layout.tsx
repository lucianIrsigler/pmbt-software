import type { Metadata } from "next";
import type { ReactNode } from "react";
import { TabBar } from "@/components/owner/tab-bar";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "My bookings", robots: { index: false } };

/** The owner's app: mobile-first, three bottom tabs. */
export default async function OwnerAppLayout({
  children,
}: {
  children: ReactNode;
}): Promise<ReactNode> {
  await requireUser();
  return (
    <>
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pt-6 pb-28">{children}</main>
      <TabBar />
    </>
  );
}
