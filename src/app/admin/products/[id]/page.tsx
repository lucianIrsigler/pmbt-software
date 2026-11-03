import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getProduct } from "@/domain/admin";
import { centsToRands } from "@/domain/money";
import { adminContext } from "@/app/admin/context";
import { saveProductAction } from "../../actions";
import { AdminForm } from "../../admin-form";
import { PRODUCT_FIELDS } from "../../fields";

export const metadata: Metadata = { title: "Product" };

const NEW_PRODUCT = { name: "", description: "", priceCents: "", sortOrder: "0", active: "on" };

/** `/admin/products/new` adds a product; `/admin/products/<id>` edits one. */
export default async function AdminProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<ReactNode> {
  const { id } = await params;
  const { db } = await adminContext();
  const isNew = id === "new";
  let initial: Record<string, string> = NEW_PRODUCT;
  if (!isNew) {
    const p = await getProduct(db, id);
    if (!p) notFound();
    initial = {
      name: p.name,
      description: p.description,
      priceCents: centsToRands(p.priceCents),
      sortOrder: String(p.sortOrder),
      active: p.active ? "on" : "",
    };
  }

  return (
    <div className="flex flex-col gap-6">
      <Link href="/admin/products" className="self-start text-accent underline">
        ← Products
      </Link>
      <h1 className="text-3xl font-bold">{isNew ? "Add product" : `Edit ${initial.name}`}</h1>
      {!isNew && (
        <p className="max-w-xl text-ink-soft">
          Products already sold keep the price they were sold at.
        </p>
      )}
      <AdminForm
        action={saveProductAction.bind(null, isNew ? null : id)}
        fields={PRODUCT_FIELDS}
        initial={initial}
        submitLabel={isNew ? "Add product" : "Save changes"}
      />
    </div>
  );
}
