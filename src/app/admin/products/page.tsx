import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Notice } from "@/components/ui";
import { listAllProducts } from "@/domain/admin";
import { formatPrice } from "@/lib/format";
import { requestContext } from "@/lib/request";
import { adminButton } from "../components";

export const metadata: Metadata = { title: "Products" };

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactNode> {
  const { db } = await requestContext();
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
      <div className="overflow-x-auto rounded-2xl border border-line bg-card">
        <table className="w-full min-w-[32rem] border-collapse text-left">
          <thead className="border-b-2 border-line">
            <tr>
              {["Name", "Price", "Order", "Status", ""].map((h) => (
                <th key={h} scope="col" className="px-3 py-2 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-b border-line last:border-0">
                <td className="px-3 py-2 font-semibold">{p.name}</td>
                <td className="px-3 py-2 tabular-nums">{formatPrice(p.priceCents)}</td>
                <td className="px-3 py-2 tabular-nums">{p.sortOrder}</td>
                <td className="px-3 py-2">{p.active ? "Shown" : "Hidden"}</td>
                <td className="px-3 py-2">
                  <Link
                    href={`/admin/products/${p.id}`}
                    className="text-accent underline"
                    aria-label={`Edit ${p.name}`}
                  >
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
