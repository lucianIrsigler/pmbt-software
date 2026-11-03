import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ActionButton, ConfirmButton } from "@/components/owner/confirm-button";
import { ownerButton } from "@/components/owner/styles";
import { NotesEditor } from "@/components/owner/notes-editor";
import { ProductsSold } from "@/components/owner/products-sold";
import { getAppointmentDetail, type AppointmentDetail } from "@/domain/appointments";
import { listActiveProducts } from "@/domain/catalogue";
import { formatDayLong, formatPhone, formatTime } from "@/lib/format";
import { requestContext } from "@/lib/request";
import { stringParam, type SearchParams } from "@/lib/search-params";
import { appointmentBackLink } from "../urls";
import {
  addProductAction,
  cancelAppointmentAction,
  markDoneAction,
  markNoShowAction,
  removeProductAction,
  saveNotesAction,
  undoStatusAction,
} from "./actions";

export const metadata: Metadata = { title: "Appointment" };

function ReadOnlyNotes({ title, text }: { title: string; text: string }): ReactNode {
  if (!text.trim()) return null;
  return (
    <div className="rounded-2xl border-2 border-line bg-card p-4">
      <h2 className="text-lg font-bold text-ink-soft">{title}</h2>
      <p className="mt-1 whitespace-pre-line text-xl">{text}</p>
    </div>
  );
}

function StatusSection({ a }: { a: AppointmentDetail }): ReactNode {
  if (a.status === "booked") {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <ConfirmButton
          label="Done"
          question="Mark this visit as done?"
          yesLabel="Yes, done"
          action={markDoneAction.bind(null, a.id)}
        />
        <ConfirmButton
          label="Didn't come"
          variant="secondary"
          question="Mark as didn't come?"
          yesLabel="Yes"
          action={markNoShowAction.bind(null, a.id)}
        />
      </div>
    );
  }
  if (a.status === "cancelled") {
    return (
      <p className="rounded-2xl border-2 border-warn-ink bg-warn-soft p-4 text-xl font-bold text-warn-ink">
        This booking was cancelled.
      </p>
    );
  }
  const done = a.status === "done";
  return (
    <div
      className={`flex flex-col gap-3 rounded-2xl border-2 p-4 ${
        done ? "border-accent bg-accent-soft" : "border-warn-ink bg-warn-soft"
      }`}
    >
      <p className={`text-2xl font-bold ${done ? "text-accent" : "text-warn-ink"}`}>
        {done ? "Done ✓" : "Didn't come"}
      </p>
      <ActionButton label="Undo" action={undoStatusAction.bind(null, a.id)} />
    </div>
  );
}

export default async function AppointmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}): Promise<ReactNode> {
  const { id } = await params;
  const query = await searchParams;
  const { db, tz } = await requestContext();
  const [a, products] = await Promise.all([getAppointmentDetail(db, id), listActiveProducts(db)]);
  if (!a) notFound();

  const back = appointmentBackLink(
    { from: stringParam(query.from), date: stringParam(query.date) },
    a.client,
  );
  const who = a.pet ? `${a.pet.name} (${a.pet.species})` : a.client.name;

  return (
    <div className="flex flex-col gap-6">
      <Link href={back.href} className="py-1 text-xl font-semibold text-accent underline">
        ← {back.label}
      </Link>

      <header className="flex flex-col gap-1">
        <p className="text-xl text-ink-soft">{formatDayLong(a.start, tz)}</p>
        <h1 className="text-3xl font-bold">
          {formatTime(a.start, tz)} – {formatTime(a.end, tz)}
        </h1>
        <p className="text-2xl font-semibold">{who}</p>
        {a.pet && (
          <p className="text-xl">
            Owner: {a.client.name}
            {a.pet.breed && <span className="text-ink-soft"> · {a.pet.breed}</span>}
          </p>
        )}
        <p className="text-xl text-ink-soft">{a.service.name}</p>
      </header>

      <a href={`tel:${a.client.phone}`} className={ownerButton.secondary}>
        Call {a.client.name.split(" ")[0]} · {formatPhone(a.client.phone)}
      </a>
      <Link href={`/app/clients/${a.client.id}`} className={ownerButton.secondary}>
        Client page and full history
      </Link>

      <ReadOnlyNotes title={`About ${a.client.name}`} text={a.client.notes} />
      {a.pet && <ReadOnlyNotes title={`About ${a.pet.name}`} text={a.pet.notes} />}

      <StatusSection a={a} />

      <NotesEditor
        label="Notes for this visit"
        initialNotes={a.notes}
        save={saveNotesAction.bind(null, a.id)}
      />

      <ProductsSold
        lines={a.products}
        options={products.map((p) => ({ id: p.id, name: p.name, priceCents: p.priceCents }))}
        canAdd={a.status !== "cancelled"}
        add={addProductAction.bind(null, a.id)}
        remove={removeProductAction.bind(null, a.id)}
      />

      <section className="flex flex-col gap-3" aria-labelledby="history-heading">
        <h2 id="history-heading" className="text-2xl font-bold">
          Previous visits
        </h2>
        {a.previousVisits.length === 0 ? (
          <p className="text-xl">This is the first visit.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {a.previousVisits.map((v) => (
              <li key={v.id}>
                <Link
                  href={`/app/appointment/${v.id}`}
                  className="flex flex-col rounded-2xl border-2 border-line bg-card p-4 hover:border-accent"
                >
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xl font-semibold">{formatDayLong(v.start, tz)}</span>
                    {v.status !== "done" && (
                      <span className="rounded-lg border-2 border-warn-ink bg-warn-soft px-2 text-base font-bold text-warn-ink">
                        {v.status === "no_show" ? "Didn't come" : "Cancelled"}
                      </span>
                    )}
                  </span>
                  <span className="text-lg text-ink-soft">{v.serviceName}</span>
                  {v.notesFirstLine && <span className="text-lg">{v.notesFirstLine}</span>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {a.status === "booked" && (
        <div className="mt-6 border-t-2 border-line pt-6">
          <ConfirmButton
            label="Cancel booking"
            variant="small"
            question="Cancel this booking? The time will become free again."
            yesLabel="Yes, cancel"
            noLabel="No, keep it"
            yesVariant="danger"
            action={cancelAppointmentAction.bind(null, a.id)}
          />
        </div>
      )}
    </div>
  );
}
