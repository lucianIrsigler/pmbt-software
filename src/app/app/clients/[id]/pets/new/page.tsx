import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getClientProfile } from "@/domain/clients";
import { requestContext } from "@/lib/request";
import { addPetAction } from "../../../actions";
import { PetDetailsForm } from "../../../forms";

export const metadata: Metadata = { title: "Add an animal" };

export default async function NewPetPage({
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
      <h1 className="text-3xl font-bold">New animal for {c.name}</h1>
      <PetDetailsForm action={addPetAction.bind(null, c.id)} submitLabel="Save animal" />
    </div>
  );
}
