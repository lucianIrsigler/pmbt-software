import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Notice } from "@/components/ui";
import { listAllServices } from "@/domain/admin";
import { formatDuration, formatPrice } from "@/lib/format";
import { adminContext } from "@/app/admin/context";
import type { SearchParams } from "@/lib/search-params";
import { adminButton, OfferedAndHidden } from "../components";

export const metadata: Metadata = { title: "Services" };

export default async function AdminServicesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<ReactNode> {
  const { db } = await adminContext();
  const [services, params] = await Promise.all([listAllServices(db), searchParams]);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">Services</h1>
        <Link href="/admin/services/new" className={adminButton}>
          Add service
        </Link>
      </div>
      {params.saved === "1" && <Notice tone="success">Saved ✓</Notice>}
      <OfferedAndHidden
        items={services}
        noun="services"
        hiddenNote="Not on the website and can't be booked. Past visits keep them."
        headers={["Name", "For", "Duration", "Buffer", "Price", "Order", ""]}
        minWidth="min-w-[40rem]"
        cells={(s) => [
          s.name,
          s.forKind === "human" ? "People" : "Animals",
          formatDuration(s.durationMin),
          `${s.bufferMin} min`,
          <span key="price" className="tabular-nums">
            {formatPrice(s.priceCents)}
          </span>,
          <span key="order" className="tabular-nums">
            {s.sortOrder}
          </span>,
          <Link
            key="edit"
            href={`/admin/services/${s.id}`}
            className="text-accent underline"
            aria-label={`Edit ${s.name}`}
          >
            Edit
          </Link>,
        ]}
      />
    </div>
  );
}
