import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { PetDetailsForm } from "@/components/owner/client-forms";
import { ActionButton, ConfirmButton } from "@/components/owner/confirm-button";
import { NotesEditor } from "@/components/owner/notes-editor";
import { ownerBackLink } from "@/components/owner/styles";
import { Notice } from "@/components/ui";
import { countUpcomingBookings, getPet } from "@/domain/clients";
import { requestContext } from "@/lib/request";
import {
  archivePetAction,
  savePetNotesAction,
  unarchivePetAction,
  updatePetAction,
} from "../../../actions";

export const metadata: Metadata = { title: "Animal" };

function archiveQuestion(name: string, upcoming: number, ownerHasEmail: boolean): string {
  const base = `Archive ${name}? Their past visits are kept.`;
  if (upcoming === 0) return base;
  const bookings = upcoming === 1 ? "1 upcoming booking" : `${upcoming} upcoming bookings`;
  const tell = ownerHasEmail
    ? "The owner will get an email to let them know."
    : "Please phone the owner to let them know.";
  return `${base} This will also cancel ${bookings}. ${tell}`;
}

export default async function PetPage({
  params,
}: {
  params: Promise<{ id: string; petId: string }>;
}): Promise<ReactNode> {
  const { id, petId } = await params;
  const { db, now } = await requestContext();
  const p = await getPet(db, id, petId);
  if (!p) notFound();
  const upcoming = await countUpcomingBookings(db, { petId: p.id }, now);

  return (
    <div className="flex flex-col gap-6">
      <Link href={`/app/clients/${p.clientId}`} className={ownerBackLink}>
        ← {p.clientName}
      </Link>

      {p.archivedAt && (
        <Notice tone="warn">
          <p className="mb-3 text-xl font-bold">{p.name} is archived.</p>
          <ActionButton label="Bring back" action={unarchivePetAction.bind(null, p.id)} />
        </Notice>
      )}

      <h1 className="text-3xl font-bold">
        {p.name} <span className="font-normal">({p.species})</span>
      </h1>

      <NotesEditor
        id="pet-notes"
        label={`Notes about ${p.name}`}
        initialNotes={p.notes}
        save={savePetNotesAction.bind(null, p.id)}
      />

      <section aria-labelledby="pet-details-heading" className="flex flex-col gap-4">
        <h2 id="pet-details-heading" className="text-2xl font-bold">
          Details
        </h2>
        <PetDetailsForm
          action={updatePetAction.bind(null, p.clientId, p.id)}
          initial={{ name: p.name, species: p.species, breed: p.breed ?? "" }}
          submitLabel="Save changes"
        />
      </section>

      {!p.archivedAt && (
        <div className="mt-6 border-t-2 border-line pt-6">
          <ConfirmButton
            label={`Archive ${p.name}`}
            variant="small"
            question={archiveQuestion(p.name, upcoming, p.clientEmail !== null)}
            yesLabel="Yes, archive"
            noLabel="No, keep"
            yesVariant="danger"
            action={archivePetAction.bind(null, p.id)}
          />
        </div>
      )}
    </div>
  );
}
