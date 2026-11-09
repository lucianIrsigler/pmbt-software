"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, type ReactNode } from "react";

export interface MenuLink {
  href: string;
  label: string;
  /** Only highlight on this exact path (e.g. "/" or "/admin"), not on pages below it. */
  exact?: boolean;
}

/** `aria-current` for a link: set on the page it points to (or a page below it). */
export function useCurrent(): (link: MenuLink) => "page" | undefined {
  const pathname = usePathname();
  return (link) =>
    (link.exact ? pathname === link.href : pathname.startsWith(link.href)) ? "page" : undefined;
}

/**
 * The phone menu: a large "☰ Menu" button (a <details>, so it works without JavaScript)
 * that opens the links as a full-width list under the header. The header must be
 * `relative`. Hide it on wide screens with `className` (e.g. "sm:hidden").
 */
export function MobileMenu({
  label,
  links,
  action,
  footer,
  className,
}: {
  /** The navigation's accessible name, e.g. "Main". */
  label: string;
  links: readonly MenuLink[];
  /** A main button at the bottom, e.g. "Book a session". */
  action?: MenuLink;
  /** Extra content under the links, e.g. who is signed in. */
  footer?: ReactNode;
  className: string;
}): ReactNode {
  const menu = useRef<HTMLDetailsElement>(null);
  const current = useCurrent();
  // Close the menu once a page is chosen (also when it's the page already open).
  const close = (): void => {
    if (menu.current) menu.current.open = false;
  };

  return (
    <details ref={menu} className={`group ${className}`}>
      <summary className="flex min-h-12 shrink-0 cursor-pointer list-none items-center gap-2 rounded-xl border-2 border-accent px-3 text-lg font-semibold text-accent [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true">☰</span>
        <span className="group-open:hidden">Menu</span>
        <span className="hidden group-open:inline">Close</span>
      </summary>
      <nav
        aria-label={label}
        className="absolute inset-x-0 top-full z-20 border-b-4 border-brand bg-card shadow-lg"
      >
        <ul className="flex flex-col gap-2 px-4 py-4">
          {links.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={current(link)}
                onClick={close}
                className="flex min-h-12 items-center rounded-xl px-4 text-xl hover:bg-accent-soft aria-[current=page]:bg-accent-soft aria-[current=page]:font-semibold"
              >
                {link.label}
              </Link>
            </li>
          ))}
          {action && (
            <li className="pt-2">
              <Link
                href={action.href}
                aria-current={current(action)}
                onClick={close}
                className="flex min-h-12 items-center justify-center rounded-xl bg-accent px-4 text-xl font-semibold text-white hover:bg-accent-strong"
              >
                {action.label}
              </Link>
            </li>
          )}
        </ul>
        {footer && <div className="border-t border-line px-8 py-4">{footer}</div>}
      </nav>
    </details>
  );
}
