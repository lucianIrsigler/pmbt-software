"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, type ReactNode } from "react";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/services", label: "Services" },
  { href: "/products", label: "Products" },
] as const;
const BOOK = { href: "/book", label: "Book" } as const;

function isCurrent(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/**
 * The public site's navigation. Wide screens show the links in a row. Phones get a large
 * "Menu" button (a <details>, so it works without JavaScript) that opens the links as a
 * full-width list under the header. The header must be `relative`.
 */
export function SiteNav(): ReactNode {
  const pathname = usePathname();
  const menu = useRef<HTMLDetailsElement>(null);
  // Close the phone menu once a page is chosen (also when it's the page already open).
  const close = (): void => {
    if (menu.current) menu.current.open = false;
  };
  const current = (href: string) => (isCurrent(pathname, href) ? "page" : undefined);

  return (
    <>
      <nav aria-label="Main" className="hidden items-center gap-x-5 text-lg sm:flex">
        {LINKS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={current(item.href)}
            className="py-2 underline-offset-4 hover:underline aria-[current=page]:font-semibold aria-[current=page]:text-accent aria-[current=page]:underline"
          >
            {item.label}
          </Link>
        ))}
        <Link
          href={BOOK.href}
          aria-current={current(BOOK.href)}
          className="rounded-xl bg-accent px-5 py-2 font-semibold text-white hover:bg-accent-strong"
        >
          {BOOK.label}
        </Link>
      </nav>

      <details ref={menu} className="group sm:hidden">
        <summary className="flex min-h-12 shrink-0 cursor-pointer list-none items-center gap-2 rounded-xl border-2 border-accent px-3 text-lg font-semibold text-accent [&::-webkit-details-marker]:hidden">
          <span aria-hidden="true">☰</span>
          <span className="group-open:hidden">Menu</span>
          <span className="hidden group-open:inline">Close</span>
        </summary>
        <nav
          aria-label="Main"
          className="absolute inset-x-0 top-full z-20 border-b-4 border-brand bg-card shadow-lg"
        >
          <ul className="flex flex-col gap-2 px-4 py-4">
            {LINKS.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={current(item.href)}
                  onClick={close}
                  className="flex min-h-12 items-center rounded-xl px-4 text-xl hover:bg-accent-soft aria-[current=page]:bg-accent-soft aria-[current=page]:font-semibold"
                >
                  {item.label}
                </Link>
              </li>
            ))}
            <li className="pt-2">
              <Link
                href={BOOK.href}
                aria-current={current(BOOK.href)}
                onClick={close}
                className="flex min-h-12 items-center justify-center rounded-xl bg-accent px-4 text-xl font-semibold text-white hover:bg-accent-strong"
              >
                Book a session
              </Link>
            </li>
          </ul>
        </nav>
      </details>
    </>
  );
}
