import Link from "next/link";
import type { ReactNode } from "react";
import { ownerRow } from "@/components/owner/styles";
import type { ClientSearchResult } from "@/domain/clients";
import { formatPhone } from "@/lib/format";

/** Clients as large rows linking to their page. */
export function ClientList({
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
          <Link href={`/app/clients/${c.id}`} className={ownerRow}>
            <span className="text-xl font-bold">{c.name}</span>
            <span className="text-lg">{formatPhone(c.phone)}</span>
            {c.petNames && <span className="text-lg text-ink-soft">{c.petNames}</span>}
          </Link>
        </li>
      ))}
    </ul>
  );
}
