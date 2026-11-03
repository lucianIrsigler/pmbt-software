"use client";

import { useActionState, type ReactNode } from "react";
import type { FormState } from "@/components/owner/field";
import { input, inputInvalid, Notice } from "@/components/ui";
import type { FieldSpec } from "./fields";

type Action = (prev: FormState<string>, formData: FormData) => Promise<FormState<string>>;

function Field({
  field,
  value,
  error,
  idPrefix,
}: {
  field: FieldSpec;
  value: string;
  error: string | undefined;
  idPrefix: string;
}): ReactNode {
  const id = `${idPrefix}-${field.name}`;
  if (field.kind === "hidden") return <input type="hidden" name={field.name} value={value} />;
  const describedBy =
    [field.hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ") || undefined;
  const common = {
    id,
    name: field.name,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy,
    className: error ? inputInvalid : input,
  };

  if (field.kind === "checkbox") {
    return (
      <div className="flex flex-col gap-1">
        <label htmlFor={id} className="flex items-center gap-3 font-semibold">
          <input
            id={id}
            name={field.name}
            type="checkbox"
            defaultChecked={value === "on"}
            className="h-6 w-6 accent-accent"
          />
          {field.label}
        </label>
        {error && (
          <p id={`${id}-error`} className="font-semibold text-danger">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="font-semibold">
        {field.label}
      </label>
      {field.kind === "textarea" ? (
        <textarea {...common} defaultValue={value} rows={3} />
      ) : field.kind === "select" ? (
        <select {...common} defaultValue={value}>
          {(field.options ?? []).map(([optionValue, label]) => (
            <option key={optionValue} value={optionValue}>
              {label}
            </option>
          ))}
        </select>
      ) : (
        <input
          {...common}
          defaultValue={value}
          type={field.kind === "money" || field.kind === "number" ? "text" : field.kind}
          inputMode={
            field.kind === "money" ? "decimal" : field.kind === "number" ? "numeric" : undefined
          }
          step={field.kind === "time" ? 300 : undefined}
        />
      )}
      {field.hint && (
        <p id={`${id}-hint`} className="text-sm text-ink-soft">
          {field.hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="font-semibold text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** A form built from field definitions, showing each field's error under it. */
export function AdminForm({
  action,
  fields,
  initial = {},
  submitLabel,
  inline = false,
  idPrefix = "admin",
}: {
  action: Action;
  fields: readonly FieldSpec[];
  initial?: Record<string, string>;
  submitLabel: string;
  /** Fields side by side (e.g. opening hours). */
  inline?: boolean;
  /** Makes input ids unique when a page has several forms. */
  idPrefix?: string;
}): ReactNode {
  const [state, formAction, pending] = useActionState(action, { values: initial, errors: {} });
  return (
    <form
      action={formAction}
      noValidate
      className={inline ? "flex flex-wrap items-end gap-3" : "flex max-w-xl flex-col gap-4"}
    >
      {state.message && (
        <div className={inline ? "w-full" : undefined}>
          <Notice tone="error">{state.message}</Notice>
        </div>
      )}
      {fields.map((field) => (
        <Field
          key={field.name}
          field={field}
          value={state.values[field.name] ?? ""}
          error={state.errors[field.name]}
          idPrefix={idPrefix}
        />
      ))}
      <button
        type="submit"
        disabled={pending}
        className={`inline-flex min-h-11 items-center justify-center rounded-lg bg-accent px-4 font-semibold text-white hover:bg-accent-strong disabled:opacity-60 ${
          inline ? "" : "self-start"
        }`}
      >
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
