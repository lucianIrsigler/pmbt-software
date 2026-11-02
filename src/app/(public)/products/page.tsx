import type { Metadata } from "next";
import type { ReactNode } from "react";
import { card, Notice, PageTitle } from "@/components/ui";
import { listActiveProducts } from "@/domain/catalogue";
import { formatPrice } from "@/lib/format";
import { requestContext } from "@/lib/request";

export const metadata: Metadata = { title: "Products" };

export default async function ProductsPage(): Promise<ReactNode> {
  const { db } = await requestContext();
  const products = await listActiveProducts(db);
  return (
    <div className="flex flex-col gap-6">
      <PageTitle>Natural products</PageTitle>
      <Notice>Our products are available at your session. We don&apos;t sell online.</Notice>
      <ul className="flex flex-col gap-3">
        {products.map((p) => (
          <li key={p.id} className={card}>
            <h2 className="text-xl font-semibold">{p.name}</h2>
            {p.description && <p className="mt-1">{p.description}</p>}
            <p className="mt-2 text-ink-soft">{formatPrice(p.priceCents)}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
