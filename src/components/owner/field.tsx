import type { InputHTMLAttributes, ReactNode } from "react";
import { ownerInput, ownerInputInvalid } from "./styles";

/** A labelled, large input with its error message underneath. */
export function OwnerField({
  name,
  label,
  error,
  ...props
}: {
  name: string;
  label: string;
  error?: string | undefined;
} & InputHTMLAttributes<HTMLInputElement>): ReactNode {
  const id = `field-${name}`;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xl font-semibold">
        {label}
      </label>
      <input
        id={id}
        name={name}
        className={error ? ownerInputInvalid : ownerInput}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        {...props}
      />
      {error && (
        <p id={`${id}-error`} className="text-lg font-semibold text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** Field values and errors for a form handled by `useActionState`. */
export interface FormState<F extends string> {
  values: Partial<Record<F, string>>;
  errors: Partial<Record<F, string>>;
  message?: string;
}
