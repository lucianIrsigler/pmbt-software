"use client";

import { useActionState, useState, type ReactNode } from "react";
import { OwnerField, type FormState } from "@/components/owner/field";
import { ownerButton } from "@/components/owner/styles";
import { Notice } from "@/components/ui";
import { addTimeOffAction, type AwayField } from "./actions";

const initial: FormState<AwayField> = { values: {}, errors: {} };

const choice = "flex min-h-14 w-full items-center rounded-xl border-2 px-4 text-xl font-semibold";

export function AwayForm({ date }: { date: string }): ReactNode {
  const [state, action, pending] = useActionState(addTimeOffAction, initial);
  const [kind, setKind] = useState<"day" | "times">("day");

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

      {/*
        Toggle buttons rather than radios: React resets a form after its action runs,
        which would un-check a radio while the page still showed the old choice.
      */}
      <input type="hidden" name="kind" value={kind} />
      <div role="group" aria-labelledby="away-kind" className="flex flex-col gap-3">
        <p id="away-kind" className="text-xl font-semibold">
          How long?
        </p>
        {(
          [
            ["day", "The whole day"],
            ["times", "Part of the day"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={kind === value}
            onClick={() => setKind(value)}
            className={`${choice} ${kind === value ? "border-accent bg-accent text-white" : "border-ink-soft bg-card text-ink"}`}
          >
            {kind === value ? `${label} ✓` : label}
          </button>
        ))}
      </div>

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
