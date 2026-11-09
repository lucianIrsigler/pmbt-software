import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Notice } from "@/components/ui";
import { listAllTestimonials } from "@/domain/admin";
import { adminContext } from "@/app/admin/context";
import type { SearchParams } from "@/lib/search-params";
import { adminButton, OfferedAndHidden } from "../components";

export const metadata: Metadata = { title: "Testimonials" };

/** Shortens a quote for the table; the full text is on the edit page. */
function preview(quote: string): string {
  return quote.length > 80 ? `${quote.slice(0, 77).trimEnd()}…` : quote;
}

export default async function AdminTestimonialsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<ReactNode> {
  const { db } = await adminContext();
  const [testimonials, params] = await Promise.all([listAllTestimonials(db), searchParams]);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">Testimonials</h1>
        <Link href="/admin/testimonials/new" className={adminButton}>
          Add testimonial
        </Link>
      </div>
      <p className="max-w-xl text-ink-soft">
        Shown on the home page under &ldquo;What people say&rdquo;. The section only appears when at
        least one is shown.
      </p>
      {params.saved === "1" && <Notice tone="success">Saved ✓</Notice>}
      <OfferedAndHidden
        items={testimonials}
        noun="testimonials"
        hiddenNote="Not on the website."
        headers={["Who", "Quote", "Order", ""]}
        minWidth="min-w-[36rem]"
        cells={(t) => [
          t.author,
          preview(t.quote),
          <span key="order" className="tabular-nums">
            {t.sortOrder}
          </span>,
          <Link
            key="edit"
            href={`/admin/testimonials/${t.id}`}
            className="text-accent underline"
            aria-label={`Edit ${t.author}`}
          >
            Edit
          </Link>,
        ]}
      />
    </div>
  );
}
