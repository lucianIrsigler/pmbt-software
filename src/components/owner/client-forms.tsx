"use client";

import { useActionState, type ReactNode } from "react";
import { Notice } from "@/components/ui";
import type { ClientField, PetField } from "./client-fields";
import { OwnerField, type FormState } from "./field";
import { ownerButton } from "./styles";

/**
 * The owner's client and animal forms, used by the Clients tab and when booking from
 * the calendar. Server actions read them with clientFormValues() / petFormValues().
 */

type FormAction<F extends string> = (
  prev: FormState<F>,
  formData: FormData,
) => Promise<FormState<F>>;

export function ClientDetailsForm({
  action,
  initial = {},
  submitLabel,
}: {
  action: FormAction<ClientField>;
  initial?: Partial<Record<ClientField, string>>;
  submitLabel: string;
}): ReactNode {
  const [state, formAction, pending] = useActionState(action, { values: initial, errors: {} });
  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
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
      <OwnerField
        name="email"
        label="Email (optional)"
        type="email"
        inputMode="email"
        autoComplete="off"
        defaultValue={state.values.email}
        error={state.errors.email}
      />
      <button type="submit" className={ownerButton.primary} disabled={pending}>
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}

export function PetDetailsForm({
  action,
  initial = {},
  submitLabel,
}: {
  action: FormAction<PetField>;
  initial?: Partial<Record<PetField, string>>;
  submitLabel: string;
}): ReactNode {
  const [state, formAction, pending] = useActionState(action, { values: initial, errors: {} });
  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
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
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
