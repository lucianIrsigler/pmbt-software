import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { requireAccess } from "@/lib/auth";
import { AdminNav } from "./admin-nav";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Admin" },
  robots: { index: false },
};

/** Admin area: stats and settings. Phone menu below `lg`; not linked from the owner's app. */
export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}): Promise<ReactNode> {
  const user = await requireAccess("admin");
  const account = (
    <p className="text-ink-soft">
      {user.email} ·{" "}
      <Link href="/app" className="text-accent underline">
        Owner app
      </Link>
    </p>
  );
  return (
    <div className="flex flex-1 flex-col">
      <header className="relative border-b-4 border-brand bg-card">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <p className="text-xl font-bold">Admin</p>
          <AdminNav account={account} />
          <div className="hidden lg:block">{account}</div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
