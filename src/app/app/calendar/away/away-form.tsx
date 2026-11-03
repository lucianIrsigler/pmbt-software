"use client";

import { useActionState, useState, type ReactNode } from "react";
import { OwnerField, type FormState } from "@/components/owner/field";
import { ownerButton } from "@/components/owner/styles";
import { Notice } from "@/components/ui";
import { addTimeOffAction, type AwayField } from "./actions";

const initial: FormState<AwayField> = { values: {}, errors: {} };

const choice =
  "flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border-2 px-4 text-xl font-semibold";

export function AwayForm({ date }: { date: string }): ReactNode {
  const [state, action, pending] = useActionState(addTimeOffAction, initial);
  const [kind, setKind] = useState(state.values.kind === "times" ? "times" : "day");

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      {state.message && <Notice tone="error">{state.message}</Notice>}
      <OwnerField
        name="date"
        label="Which day?"
        type="date"
        defaultValue={state.values.date ?? date}
        error={state.errors.date}
      />

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-xl font-semibold">How long?</legend>
        {(
          [
            ["day", "The whole day"],
            ["times", "Part of the day"],
          ] as const
        ).map(([value, label]) => (
          <label
            key={value}
            className={`${choice} ${kind === value ? "border-accent bg-accent-soft" : "border-line bg-card"}`}
          >
            <input
              type="radio"
              name="kind"
              value={value}
              checked={kind === value}
              onChange={() => setKind(value)}
              className="h-6 w-6 accent-accent"
            />
            {label}
          </label>
        ))}
      </fieldset>

      {kind === "times" && (
        <div className="grid grid-cols-2 gap-3">
          <OwnerField
            name="startTime"
            label="From"
            type="time"
            step={300}
            defaultValue={state.values.startTime ?? "09:00"}
            error={state.errors.startTime}
          />
          <OwnerField
            name="endTime"
            label="To"
            type="time"
            step={300}
            defaultValue={state.values.endTime ?? "13:00"}
            error={state.errors.endTime}
          />
        </div>
      )}

      <OwnerField
        name="reason"
        label="Reason (optional)"
        autoComplete="off"
        defaultValue={state.values.reason}
        error={state.errors.reason}
      />

      <button type="submit" className={ownerButton.primary} disabled={pending}>
        {pending ? "Saving…" : kind === "day" ? "Block this day" : "Block this time"}
      </button>
    </form>
  );
}
