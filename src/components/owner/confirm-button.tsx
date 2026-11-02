"use client";

import { useState, useTransition, type ReactNode } from "react";
import { ownerButton } from "./styles";

type Variant = keyof typeof ownerButton;

/**
 * A button that asks "Are you sure?" with large Yes / No buttons before running
 * `action`. Shows the action's error, if any, in place.
 */
export function ConfirmButton({
  label,
  question,
  yesLabel = "Yes",
  noLabel = "No",
  variant = "primary",
  yesVariant = "primary",
  action,
}: {
  label: string;
  question: string;
  yesLabel?: string;
  noLabel?: string;
  variant?: Variant;
  yesVariant?: Variant;
  action: () => Promise<{ error?: string }>;
}): ReactNode {
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const confirm = (): void => {
    setError(undefined);
    startTransition(async () => {
      const result = await action();
      if (result.error) setError(result.error);
      setAsking(false);
    });
  };

  return (
    <div className="flex flex-col gap-2">
      {asking ? (
        <div className="flex flex-col gap-3 rounded-2xl border-2 border-ink bg-card p-4">
          <p className="text-xl font-bold">{question}</p>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              className={ownerButton[yesVariant]}
              onClick={confirm}
              disabled={pending}
            >
              {pending ? "…" : yesLabel}
            </button>
            <button
              type="button"
              className={ownerButton.secondary}
              onClick={() => setAsking(false)}
              disabled={pending}
            >
              {noLabel}
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className={ownerButton[variant]} onClick={() => setAsking(true)}>
          {label}
        </button>
      )}
      {error && (
        <p role="alert" className="text-lg font-semibold text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** A plain action button (no confirmation) with pending state and error display. */
export function ActionButton({
  label,
  variant = "secondary",
  action,
}: {
  label: string;
  variant?: Variant;
  action: () => Promise<{ error?: string }>;
}): ReactNode {
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        className={ownerButton[variant]}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(undefined);
            const result = await action();
            if (result.error) setError(result.error);
          })
        }
      >
        {pending ? "…" : label}
      </button>
      {error && (
        <p role="alert" className="text-lg font-semibold text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
