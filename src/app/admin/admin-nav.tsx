"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const LINKS = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/bookings", label: "Bookings" },
  { href: "/admin/services", label: "Services" },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/hours", label: "Hours" },
  { href: "/admin/settings", label: "Settings" },
] as const;

export function AdminNav(): ReactNode {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin">
      <ul className="flex flex-wrap gap-2">
        {LINKS.map((link) => {
          const active =
            link.href === "/admin" ? pathname === "/admin" : pathname.startsWith(link.href);
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`inline-flex min-h-11 items-center rounded-lg px-3 font-semibold ${
                  active ? "bg-accent text-white" : "text-accent hover:bg-accent-soft"
                }`}
              >
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
