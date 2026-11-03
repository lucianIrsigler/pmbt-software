"use client";

import { useActionState, type ReactNode } from "react";
import { OwnerField, type FormState } from "@/components/owner/field";
import { ownerButton } from "@/components/owner/styles";
import { Notice } from "@/components/ui";
import { createClientAction, createPetAction, type ClientField, type PetField } from "./actions";

const initialClient: FormState<ClientField> = { values: {}, errors: {} };
const initialPet: FormState<PetField> = { values: {}, errors: {} };

export function NewClientForm({ start }: { start: string }): ReactNode {
  const [state, action, pending] = useActionState(createClientAction, initialClient);
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <input type="hidden" name="start" value={start} />
      {state.message && <Notice tone="error">{state.message}</Notice>}
      <OwnerField
        name="name"
        label="Name"
        autoComplete="off"
        defaultValue={state.values.name}
        error={state.errors.name}
      />
      <OwnerField
        name="phone"
        label="Phone number"
        type="tel"
        inputMode="tel"
        autoComplete="off"
        defaultValue={state.values.phone}
        error={state.errors.phone}
      />
      <button type="submit" className={ownerButton.primary} disabled={pending}>
        {pending ? "Saving…" : "Save and continue"}
      </button>
    </form>
  );
}

export function NewPetForm({ start, clientId }: { start: string; clientId: string }): ReactNode {
  const [state, action, pending] = useActionState(createPetAction, initialPet);
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <input type="hidden" name="start" value={start} />
      <input type="hidden" name="clientId" value={clientId} />
      {state.message && <Notice tone="error">{state.message}</Notice>}
      <OwnerField
        name="name"
        label="Animal's name"
        autoComplete="off"
        defaultValue={state.values.name}
        error={state.errors.name}
      />
      <OwnerField
        name="species"
        label="What kind of animal? (e.g. Dog)"
        autoComplete="off"
        defaultValue={state.values.species}
        error={state.errors.species}
      />
      <OwnerField
        name="breed"
        label="Breed (optional)"
        autoComplete="off"
        defaultValue={state.values.breed}
        error={state.errors.breed}
      />
      <button type="submit" className={ownerButton.primary} disabled={pending}>
        {pending ? "Saving…" : "Save and continue"}
      </button>
    </form>
  );
}
