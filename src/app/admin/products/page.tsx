import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Notice } from "@/components/ui";
import { listAllProducts } from "@/domain/admin";
import { formatPrice } from "@/lib/format";
import { adminContext } from "@/app/admin/context";
import type { SearchParams } from "@/lib/search-params";
import { adminButton, OfferedAndHidden } from "../components";

export const metadata: Metadata = { title: "Products" };

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<ReactNode> {
  const { db } = await adminContext();
  const [products, params] = await Promise.all([listAllProducts(db), searchParams]);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">Products</h1>
        <Link href="/admin/products/new" className={adminButton}>
          Add product
        </Link>
      </div>
      {params.saved === "1" && <Notice tone="success">Saved ✓</Notice>}
      <OfferedAndHidden
        items={products}
        noun="products"
        hiddenNote="Not on the website and can't be added to a visit. Past sales keep them."
        headers={["Name", "Price", "Order", ""]}
        minWidth="min-w-[28rem]"
        cells={(p) => [
          p.name,
          <span key="price" className="tabular-nums">
            {formatPrice(p.priceCents)}
          </span>,
          <span key="order" className="tabular-nums">
            {p.sortOrder}
          </span>,
          <Link
            key="edit"
            href={`/admin/products/${p.id}`}
            className="text-accent underline"
            aria-label={`Edit ${p.name}`}
          >
            Edit
          </Link>,
        ]}
      />
    </div>
  );
}
