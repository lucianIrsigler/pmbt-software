"use client";

import { useRouter } from "next/navigation";
import { useActionState, useRef, type ReactNode } from "react";
import { OwnerField, type FormState } from "@/components/owner/field";
import { ownerButton, ownerInput } from "@/components/owner/styles";
import { Notice } from "@/components/ui";
import type { ClientField, PetField } from "./actions";

type FormAction<F extends string> = (
  prev: FormState<F>,
  formData: FormData,
) => Promise<FormState<F>>;

/** Search that updates the results as she types; the button works without JavaScript. */
export function ClientSearchBox({ initial }: { initial: string }): ReactNode {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  return (
    <form action="/app/clients" role="search" className="flex flex-col gap-3">
      <label htmlFor="client-search" className="text-xl font-semibold">
        Find a client by name or phone
      </label>
      <input
        id="client-search"
        name="q"
        type="search"
        defaultValue={initial}
        autoComplete="off"
        className={ownerInput}
        onChange={(e) => {
          const q = e.target.value;
          clearTimeout(timer.current);
          timer.current = setTimeout(() => {
            router.replace(q ? `/app/clients?q=${encodeURIComponent(q)}` : "/app/clients");
          }, 300);
        }}
      />
      <button type="submit" className={ownerButton.secondary}>
        Search
      </button>
    </form>
  );
}

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
