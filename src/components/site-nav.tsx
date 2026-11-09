"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { MobileMenu, useCurrent, type MenuLink } from "./mobile-menu";

const LINKS: readonly MenuLink[] = [
  { href: "/", label: "Home", exact: true },
  { href: "/services", label: "Services" },
  { href: "/products", label: "Products" },
];
const BOOK: MenuLink = { href: "/book", label: "Book" };

/**
 * The public site's navigation: a row of links on wide screens, the phone menu below `sm`.
 * The header must be `relative`.
 */
export function SiteNav(): ReactNode {
  const current = useCurrent();
  return (
    <>
      <nav aria-label="Main" className="hidden items-center gap-x-5 text-lg sm:flex">
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            aria-current={current(link)}
            className="py-2 underline-offset-4 hover:underline aria-[current=page]:font-semibold aria-[current=page]:text-accent aria-[current=page]:underline"
          >
            {link.label}
          </Link>
        ))}
        <Link
          href={BOOK.href}
          aria-current={current(BOOK)}
          className="rounded-xl bg-accent px-5 py-2 font-semibold text-white hover:bg-accent-strong"
        >
          {BOOK.label}
        </Link>
      </nav>
      <MobileMenu
        label="Main"
        links={LINKS}
        action={{ ...BOOK, label: "Book a session" }}
        className="sm:hidden"
      />
    </>
  );
}
