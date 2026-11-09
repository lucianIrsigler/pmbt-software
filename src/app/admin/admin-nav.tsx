"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { MobileMenu, useCurrent, type MenuLink } from "@/components/mobile-menu";

const LINKS: readonly MenuLink[] = [
  { href: "/admin", label: "Dashboard", exact: true },
  { href: "/admin/bookings", label: "Bookings" },
  { href: "/admin/services", label: "Services" },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/testimonials", label: "Testimonials" },
  { href: "/admin/hours", label: "Hours" },
  { href: "/admin/settings", label: "Settings" },
];

/**
 * Admin navigation: a row of links on wide screens, the same phone menu as the public site
 * below `lg` (seven links don't fit in a row on a phone). `account` (who is signed in, link
 * to the owner's app) goes at the bottom of the phone menu. The header must be `relative`.
 */
export function AdminNav({ account }: { account: ReactNode }): ReactNode {
  const current = useCurrent();
  return (
    <>
      <nav aria-label="Admin" className="hidden lg:block">
        <ul className="flex flex-wrap gap-2">
          {LINKS.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={current(link)}
                className="inline-flex min-h-11 items-center rounded-lg px-3 font-semibold text-accent hover:bg-accent-soft aria-[current=page]:bg-accent aria-[current=page]:text-white"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <MobileMenu label="Admin" links={LINKS} footer={account} className="lg:hidden" />
    </>
  );
}
