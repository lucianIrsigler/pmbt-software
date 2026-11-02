"use client";

import Link from "next/link";
import { useActionState, type ReactNode } from "react";
import { buttonPrimary, input, inputInvalid, Notice } from "@/components/ui";
import { bookAction, type BookingField, type BookingFormState } from "./actions";

const initialState: BookingFormState = { values: {}, errors: {} };

function Field({
  name,
  label,
  hint,
  state,
  ...props
}: {
  name: BookingField;
  label: string;
  hint?: string;
  state: BookingFormState;
} & React.InputHTMLAttributes<HTMLInputElement>): ReactNode {
  const error = state.errors[name];
  const id = `field-${name}`;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-lg font-semibold">
        {label}
      </label>
      {hint && (
        <p id={`${id}-hint`} className="text-ink-soft">
          {hint}
        </p>
      )}
      <input
        id={id}
        name={name}
        className={error ? inputInvalid : input}
        defaultValue={state.values[name]}
        aria-invalid={error ? true : undefined}
        aria-describedby={
          [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ") || undefined
        }
        {...props}
      />
      {error && (
        <p id={`${id}-error`} className="font-semibold text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function BookingForm({
  serviceId,
  date,
  start,
  forAnimal,
}: {
  serviceId: string;
  date: string;
  start: string;
  forAnimal: boolean;
}): ReactNode {
  const [state, formAction, pending] = useActionState(bookAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <input type="hidden" name="serviceId" value={serviceId} />
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="start" value={start} />

      {/* Honeypot: hidden from people and screen readers; bots tend to fill it in. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      {state.message && <Notice tone="error">{state.message}</Notice>}

      <Field name="name" label="Your name" autoComplete="name" required state={state} />
      <Field
        name="phone"
        label="Phone number"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        required
        state={state}
      />
      <Field
        name="email"
        label="Email (optional)"
        hint="We'll email you a confirmation and a reminder."
        type="email"
        autoComplete="email"
        state={state}
      />

      {forAnimal && (
        <fieldset className="flex flex-col gap-5">
          <legend className="mb-3 text-xl font-bold">Your animal</legend>
          <Field name="petName" label="Name" required state={state} />
          <Field
            name="species"
            label="Species"
            hint="For example: dog, cat, rabbit"
            required
            state={state}
          />
          <Field name="breed" label="Breed (optional)" state={state} />
        </fieldset>
      )}

      <div className="flex flex-col gap-1">
        <label className="flex items-start gap-3 text-lg">
          <input
            type="checkbox"
            name="consent"
            required
            className="mt-1 h-6 w-6 shrink-0 accent-accent"
            aria-invalid={state.errors.consent ? true : undefined}
          />
          <span>
            I agree to my details being used to manage my booking, as described in the{" "}
            <Link href="/privacy" target="_blank" className="font-semibold underline">
              privacy notice
            </Link>
            .
          </span>
        </label>
        {state.errors.consent && (
          <p className="font-semibold text-danger">{state.errors.consent}</p>
        )}
      </div>

      <button type="submit" className={buttonPrimary} disabled={pending}>
        {pending ? "Booking…" : "Confirm booking"}
      </button>
    </form>
  );
}
