import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ownerButton } from "@/components/owner/styles";
import { countArchivedClients, listRecentClients, searchClients } from "@/domain/clients";
import { requestContext } from "@/lib/request";
import type { SearchParams } from "@/lib/search-params";
import { ClientList } from "./client-list";
import { ClientSearchBox } from "./forms";

export const metadata: Metadata = { title: "Clients" };

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<ReactNode> {
  const { db } = await requestContext();
  const params = await searchParams;
  const q = (typeof params.q === "string" ? params.q : "").slice(0, 100);
  const searching = q.trim().length > 0;
  const archivedCount = await countArchivedClients(db);

  let results: ReactNode;
  if (!searching) {
    const recent = await listRecentClients(db);
    results = (
      <section className="flex flex-col gap-3">
        <h2 className="text-2xl font-bold">Recent clients</h2>
        {recent.length === 0 ? (
          <p className="text-xl">No clients yet.</p>
        ) : (
          <ClientList clients={recent} label="Recent clients" />
        )}
      </section>
    );
  } else if (q.trim().length < 2) {
    results = <p className="text-xl">Please type at least 2 letters or numbers.</p>;
  } else {
    const found = await searchClients(db, q);
    results =
      found.length === 0 ? (
        <p className="text-xl">No clients found.</p>
      ) : (
        <ClientList clients={found} label="Clients found" />
      );
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-3xl font-bold">Clients</h1>
      <ClientSearchBox initial={q} />
      <Link href="/app/clients/new" className={ownerButton.primary}>
        Add client
      </Link>
      {results}
      {archivedCount > 0 && (
        <Link
          href="/app/clients/archived"
          className="mt-4 self-start py-2 text-lg font-semibold text-accent underline"
        >
          Archived clients ({archivedCount})
        </Link>
      )}
    </div>
  );
}
