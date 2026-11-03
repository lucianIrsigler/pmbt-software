import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getService } from "@/domain/admin";
import { centsToRands } from "@/domain/money";
import { requestContext } from "@/lib/request";
import { saveServiceAction } from "../../actions";
import { AdminForm } from "../../admin-form";
import { SERVICE_FIELDS } from "../../fields";

export const metadata: Metadata = { title: "Service" };

const NEW_SERVICE = {
  name: "",
  description: "",
  forKind: "human",
  durationMin: "30",
  bufferMin: "10",
  priceCents: "",
  sortOrder: "0",
  active: "on",
};

/** `/admin/services/new` adds a service; `/admin/services/<id>` edits one. */
export default async function AdminServicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<ReactNode> {
  const { id } = await params;
  const isNew = id === "new";
  let initial: Record<string, string> = NEW_SERVICE;
  if (!isNew) {
    const { db } = await requestContext();
    const s = await getService(db, id);
    if (!s) notFound();
    initial = {
      name: s.name,
      description: s.description,
      forKind: s.forKind,
      durationMin: String(s.durationMin),
      bufferMin: String(s.bufferMin),
      priceCents: centsToRands(s.priceCents),
      sortOrder: String(s.sortOrder),
      active: s.active ? "on" : "",
    };
  }

  return (
    <div className="flex flex-col gap-6">
      <Link href="/admin/services" className="self-start text-accent underline">
        ← Services
      </Link>
      <h1 className="text-3xl font-bold">{isNew ? "Add service" : `Edit ${initial.name}`}</h1>
      {!isNew && (
        <p className="max-w-xl text-ink-soft">
          Changes apply to new bookings. Existing bookings keep their price and time.
        </p>
      )}
      <AdminForm
        action={saveServiceAction.bind(null, isNew ? null : id)}
        fields={SERVICE_FIELDS}
        initial={initial}
        submitLabel={isNew ? "Add service" : "Save changes"}
      />
    </div>
  );
}
