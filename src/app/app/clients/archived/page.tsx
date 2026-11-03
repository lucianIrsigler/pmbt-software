import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ownerBackLink } from "@/components/owner/styles";
import { listArchivedClients } from "@/domain/clients";
import { requestContext } from "@/lib/request";
import { ClientList } from "../client-list";

export const metadata: Metadata = { title: "Archived clients" };

export default async function ArchivedClientsPage(): Promise<ReactNode> {
  const { db } = await requestContext();
  const clients = await listArchivedClients(db);

  return (
    <div className="flex flex-col gap-5">
      <Link href="/app/clients" className={ownerBackLink}>
        ← Clients
      </Link>
      <h1 className="text-3xl font-bold">Archived clients</h1>
      <p className="text-xl">Tap a client to see them, or to bring them back.</p>
      {clients.length === 0 ? (
        <p className="text-xl">None.</p>
      ) : (
        <ClientList clients={clients} label="Archived clients" />
      )}
    </div>
  );
}
