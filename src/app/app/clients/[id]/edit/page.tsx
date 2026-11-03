import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getClientProfile } from "@/domain/clients";
import { formatPhone } from "@/lib/format";
import { requestContext } from "@/lib/request";
import { updateClientAction } from "../../actions";
import { ClientDetailsForm } from "../../forms";

export const metadata: Metadata = { title: "Edit client" };

export default async function EditClientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<ReactNode> {
  const { id } = await params;
  const { db } = await requestContext();
  const c = await getClientProfile(db, id);
  if (!c) notFound();

  return (
    <div className="flex flex-col gap-5">
      <Link
        href={`/app/clients/${c.id}`}
        className="self-start py-2 text-lg font-semibold text-accent underline"
      >
        ← {c.name}
      </Link>
      <h1 className="text-3xl font-bold">Edit details</h1>
      <ClientDetailsForm
        action={updateClientAction.bind(null, c.id)}
        initial={{ name: c.name, phone: formatPhone(c.phone), email: c.email ?? "" }}
        submitLabel="Save changes"
      />
    </div>
  );
}
