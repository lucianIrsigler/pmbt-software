"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const TABS = [
  {
    href: "/app",
    label: "Today",
    match: (p: string) => p === "/app" || p.startsWith("/app/appointment"),
  },
  { href: "/app/calendar", label: "Calendar", match: (p: string) => p.startsWith("/app/calendar") },
  { href: "/app/clients", label: "Clients", match: (p: string) => p.startsWith("/app/clients") },
] as const;

/** Exactly three tabs, text only, always visible at the bottom. */
export function TabBar(): ReactNode {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-10 border-t-2 border-line bg-card pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto grid max-w-2xl grid-cols-3">
        {TABS.map((tab) => {
          const active = tab.match(pathname);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-16 items-center justify-center text-xl font-bold ${
                  active ? "bg-accent text-white" : "text-ink hover:bg-accent-soft"
                }`}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
