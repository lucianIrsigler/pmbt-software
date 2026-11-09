import Link from "next/link";
import type { ReactNode } from "react";
import { SiteNav } from "@/components/site-nav";
import { getPublicSettings, type PublicSettings } from "@/domain/catalogue";
import { requestContext } from "@/lib/request";

// No <Suspense> here on purpose: every page renders completely on the server, so the
// site (including booking) works without JavaScript. See next.config.ts.

/** The business name set like the banner: first word bold, the rest light underneath. */
function Wordmark({ name }: { name: string }): ReactNode {
  const [first = "", ...rest] = name.split(" ");
  return (
    <span className="flex flex-col font-heading uppercase leading-none tracking-wide text-ink">
      <span className="text-2xl font-bold">{first}</span>
      {/* A space so the accessible name reads "Daisy Healing", not "DaisyHealing". */}
      {rest.length > 0 && <span className="text-lg font-normal"> {rest.join(" ")}</span>}
    </span>
  );
}

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
      <header className="relative border-b-4 border-brand bg-card">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="flex items-center gap-2 sm:gap-3">
            {/* A plain <img>: the SVG is small and needs no resizing. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="" width={56} height={48} className="h-10 w-auto sm:h-12" />
            <Wordmark name={settings.businessName} />
          </Link>
          <SiteNav />
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">{children}</main>

      <footer className="border-t-4 border-brand bg-card">
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
