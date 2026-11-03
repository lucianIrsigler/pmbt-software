import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ownerButton } from "@/components/owner/styles";
import { listRecentClients, searchClients, type ClientSearchResult } from "@/domain/clients";
import { formatPhone } from "@/lib/format";
import { requestContext } from "@/lib/request";
import type { SearchParams } from "@/lib/search-params";
import { ClientSearchBox } from "./forms";

export const metadata: Metadata = { title: "Clients" };

function ClientList({
  clients,
  label,
}: {
  clients: ClientSearchResult[];
  label: string;
}): ReactNode {
  return (
    <ul className="flex flex-col gap-3" aria-label={label}>
      {clients.map((c) => (
        <li key={c.id}>
          <Link
            href={`/app/clients/${c.id}`}
            className="flex min-h-16 flex-col justify-center rounded-2xl border-2 border-line bg-card px-5 py-3 hover:border-accent"
          >
            <span className="text-xl font-bold">{c.name}</span>
            <span className="text-lg">{formatPhone(c.phone)}</span>
            {c.petNames && <span className="text-lg text-ink-soft">{c.petNames}</span>}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<ReactNode> {
  const { db } = await requestContext();
  const params = await searchParams;
  const q = (typeof params.q === "string" ? params.q : "").slice(0, 100);
  const searching = q.trim().length > 0;

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
    </div>
  );
}
