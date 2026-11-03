import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { addClientAction } from "../actions";
import { ClientDetailsForm } from "@/components/owner/client-forms";
import { ownerBackLink } from "@/components/owner/styles";

export const metadata: Metadata = { title: "Add client" };

export default function NewClientPage(): ReactNode {
  return (
    <div className="flex flex-col gap-5">
      <Link href="/app/clients" className={ownerBackLink}>
        ← Clients
      </Link>
      <h1 className="text-3xl font-bold">Add client</h1>
      <ClientDetailsForm action={addClientAction} submitLabel="Save client" />
    </div>
  );
}
