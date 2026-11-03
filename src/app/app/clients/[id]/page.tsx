import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ActionButton, ConfirmButton } from "@/components/owner/confirm-button";
import { NotesEditor } from "@/components/owner/notes-editor";
import { ownerBackLink, ownerButton } from "@/components/owner/styles";
import { Notice } from "@/components/ui";
import {
  countUpcomingBookings,
  getClientProfile,
  listClientVisits,
  type ClientVisit,
} from "@/domain/clients";
import { formatDateTime, formatPhone } from "@/lib/format";
import { requestContext } from "@/lib/request";
import type { SearchParams } from "@/lib/search-params";
import { archiveClientAction, saveClientNotesAction, unarchiveClientAction } from "../actions";

export const metadata: Metadata = { title: "Client" };

const rowLink = "flex flex-col rounded-2xl border-2 border-line bg-card p-4 hover:border-accent";

function statusBadge(
  v: ClientVisit,
  upcoming: boolean,
): { label: string; className: string } | null {
  const warn = "border-2 border-warn-ink bg-warn-soft text-warn-ink";
  if (v.status === "done") return { label: "Done", className: "bg-accent text-white" };
  if (v.status === "no_show") return { label: "Didn't come", className: warn };
  if (v.status === "cancelled") return { label: "Cancelled", className: warn };
  return upcoming ? null : { label: "Not marked yet", className: "border-2 border-ink-soft" };
}

function VisitList({
  visits,
  upcoming,
  tz,
}: {
  visits: ClientVisit[];
  upcoming: boolean;
  tz: string;
}): ReactNode {
  return (
    <ul className="flex flex-col gap-2">
      {visits.map((v) => {
        const badge = statusBadge(v, upcoming);
        return (
          <li key={v.id}>
            <Link href={`/app/appointment/${v.id}`} className={rowLink}>
              <span className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xl font-semibold">{formatDateTime(v.start, tz)}</span>
                {badge && (
                  <span className={`rounded-lg px-2 text-base font-bold ${badge.className}`}>
                    {badge.label}
                  </span>
                )}
              </span>
              <span className="text-lg text-ink-soft">
                {v.serviceName}
                {v.petName && ` · ${v.petName}`}
              </span>
              {v.notesFirstLine && <span className="text-lg">{v.notesFirstLine}</span>}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function archiveQuestion(name: string, upcoming: number, hasEmail: boolean): string {
  const base = `Archive ${name}? They will be hidden from your client list.`;
  if (upcoming === 0) return base;
  const bookings = upcoming === 1 ? "1 upcoming booking" : `${upcoming} upcoming bookings`;
  const tell = hasEmail
    ? "They will get an email to let them know."
    : "Please phone them to let them know.";
  return `${base} This will also cancel ${bookings}. ${tell}`;
}

export default async function ClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}): Promise<ReactNode> {
  const { id } = await params;
  const query = await searchParams;
  const { db, tz, now } = await requestContext();
  const c = await getClientProfile(db, id);
  if (!c) notFound();
  const [visits, upcomingCount] = await Promise.all([
    listClientVisits(db, c.id, now),
    countUpcomingBookings(db, { clientId: c.id }, now),
  ]);
  const firstName = c.name.split(" ")[0] ?? c.name;

  return (
    <div className="flex flex-col gap-6">
      <Link href="/app/clients" className={ownerBackLink}>
        ← Clients
      </Link>

      {c.archivedAt && (
        <Notice tone="warn">
          <p className="mb-3 text-xl font-bold">This client is archived.</p>
          <ActionButton label="Bring back" action={unarchiveClientAction.bind(null, c.id)} />
        </Notice>
      )}
      {query.existing === "1" && (
        <Notice tone="info">
          <p className="text-xl font-bold">This phone number already belongs to {c.name}.</p>
        </Notice>
      )}
      {query.saved === "1" && (
        <Notice tone="success">
          <p className="text-xl font-bold">Saved ✓</p>
        </Notice>
      )}

      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold">{c.name}</h1>
        <p className="text-xl">{formatPhone(c.phone)}</p>
        {c.email && <p className="break-all text-xl">{c.email}</p>}
      </header>

      <div className="flex flex-col gap-3">
        <a href={`tel:${c.phone}`} className={ownerButton.primary}>
          Call {firstName}
        </a>
        <Link href={`/app/clients/${c.id}/edit`} className={ownerButton.secondary}>
          Edit details
        </Link>
      </div>

      <NotesEditor
        id="client-notes"
        label={`Notes about ${firstName}`}
        initialNotes={c.notes}
        save={saveClientNotesAction.bind(null, c.id)}
      />

      <section aria-labelledby="animals-heading" className="flex flex-col gap-3">
        <h2 id="animals-heading" className="text-2xl font-bold">
          Animals
        </h2>
        {c.pets.length === 0 ? (
          <p className="text-xl">None.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {c.pets.map((p) => (
              <li key={p.id}>
                <Link href={`/app/clients/${c.id}/pets/${p.id}`} className={rowLink}>
                  <span className="text-xl font-bold">
                    {p.name} <span className="font-normal">({p.species})</span>
                  </span>
                  {p.breed && <span className="text-lg text-ink-soft">{p.breed}</span>}
                  <span className="text-lg font-semibold text-accent underline">Edit</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Link href={`/app/clients/${c.id}/pets/new`} className={ownerButton.secondary}>
          Add an animal
        </Link>
        {c.archivedPets.length > 0 && (
          <p className="text-lg">
            No longer coming:{" "}
            {c.archivedPets.map((p, i) => (
              <span key={p.id}>
                {i > 0 && ", "}
                <Link href={`/app/clients/${c.id}/pets/${p.id}`} className="text-accent underline">
                  {p.name}
                </Link>
              </span>
            ))}
          </p>
        )}
      </section>

      <section aria-labelledby="upcoming-heading" className="flex flex-col gap-3">
        <h2 id="upcoming-heading" className="text-2xl font-bold">
          Coming up
        </h2>
        {visits.upcoming.length === 0 ? (
          <p className="text-xl">No bookings.</p>
        ) : (
          <VisitList visits={visits.upcoming} upcoming tz={tz} />
        )}
      </section>

      <section aria-labelledby="past-heading" className="flex flex-col gap-3">
        <h2 id="past-heading" className="text-2xl font-bold">
          Past visits
        </h2>
        {visits.past.length === 0 ? (
          <p className="text-xl">None yet.</p>
        ) : (
          <VisitList visits={visits.past} upcoming={false} tz={tz} />
        )}
      </section>

      {!c.archivedAt && (
        <div className="mt-6 border-t-2 border-line pt-6">
          <ConfirmButton
            label="Archive client"
            variant="small"
            question={archiveQuestion(c.name, upcomingCount, c.email !== null)}
            yesLabel="Yes, archive"
            noLabel="No, keep"
            yesVariant="danger"
            action={archiveClientAction.bind(null, c.id)}
          />
        </div>
      )}
    </div>
  );
}
