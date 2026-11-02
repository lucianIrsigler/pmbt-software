import Link from "next/link";
import type { ReactNode } from "react";
import { getPublicSettings, type PublicSettings } from "@/domain/catalogue";
import { requestContext } from "@/lib/request";

// No <Suspense> here on purpose: every page renders completely on the server, so the
// site (including booking) works without JavaScript. See next.config.ts.

const NAV = [
  { href: "/", label: "Home" },
  { href: "/services", label: "Services" },
  { href: "/products", label: "Products" },
] as const;

function FooterContact({ settings: s }: { settings: PublicSettings }): ReactNode {
  return (
    <>
      <p className="font-semibold text-ink">{s.businessName}</p>
      {s.address && <p className="whitespace-pre-line">{s.address}</p>}
      {s.contactPhone && (
        <p>
          Phone:{" "}
          <a className="underline" href={`tel:${s.contactPhone.replace(/\s/g, "")}`}>
            {s.contactPhone}
          </a>
        </p>
      )}
      {s.contactEmail && (
        <p>
          Email:{" "}
          <a className="underline" href={`mailto:${s.contactEmail}`}>
            {s.contactEmail}
          </a>
        </p>
      )}
    </>
  );
}

export default async function PublicLayout({
  children,
}: {
  children: ReactNode;
}): Promise<ReactNode> {
  const { db } = await requestContext();
  const settings = await getPublicSettings(db);

  return (
    <>
      <header className="border-b border-line bg-card">
        <div className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/" className="text-xl font-bold text-accent">
            {settings.businessName}
          </Link>
          <nav aria-label="Main" className="flex flex-wrap items-center gap-x-5 gap-y-2 text-lg">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="py-2 underline-offset-4 hover:underline"
              >
                {item.label}
              </Link>
            ))}
            <Link
              href="/book"
              className="rounded-xl bg-accent px-4 py-2 font-semibold text-white hover:bg-accent-strong"
            >
              Book
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">{children}</main>

      <footer className="border-t border-line bg-card">
        <div className="mx-auto flex max-w-3xl flex-col gap-1 px-4 py-6 text-ink-soft">
          <FooterContact settings={settings} />
          <p className="mt-3">
            <Link href="/privacy" className="underline">
              Privacy notice
            </Link>
          </p>
        </div>
      </footer>
    </>
  );
}
