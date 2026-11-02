"use client";

import { useState, useTransition, type ReactNode } from "react";
import { formatPrice } from "@/lib/format";
import { ConfirmButton } from "./confirm-button";
import { ownerButton } from "./styles";

export interface ProductOption {
  id: string;
  name: string;
  priceCents: number;
}

export interface SoldLine {
  productId: string;
  name: string;
  qty: number;
  priceCents: number;
}

/** Products sold during the session: a big "+ Add product" list and removable lines. */
export function ProductsSold({
  lines,
  options,
  canAdd,
  add,
  remove,
}: {
  lines: SoldLine[];
  options: ProductOption[];
  canAdd: boolean;
  add: (productId: string) => Promise<{ error?: string }>;
  remove: (productId: string) => Promise<{ error?: string }>;
}): ReactNode {
  const [choosing, setChoosing] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const total = lines.reduce((sum, l) => sum + l.qty * l.priceCents, 0);

  const choose = (productId: string): void => {
    setError(undefined);
    startTransition(async () => {
      const result = await add(productId);
      if (result.error) setError(result.error);
      else setChoosing(false);
    });
  };

  return (
    <section className="flex flex-col gap-3" aria-labelledby="products-heading">
      <h2 id="products-heading" className="text-2xl font-bold">
        Products sold
      </h2>

      {lines.length === 0 ? (
        <p className="text-xl">None yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {lines.map((line) => (
            <li
              key={line.productId}
              className="flex flex-col gap-2 rounded-2xl border-2 border-line bg-card p-4"
            >
              <p className="text-xl">
                <strong>{line.qty} ×</strong> {line.name}
                <span className="ml-2 text-ink-soft">
                  {formatPrice(line.qty * line.priceCents)}
                </span>
              </p>
              <ConfirmButton
                label="Remove"
                question={`Remove ${line.name}?`}
                yesLabel="Yes, remove"
                variant="small"
                yesVariant="danger"
                action={() => remove(line.productId)}
              />
            </li>
          ))}
          <li className="text-xl font-semibold">Total: {formatPrice(total)}</li>
        </ul>
      )}

      {canAdd &&
        (choosing ? (
          <div className="flex flex-col gap-3 rounded-2xl border-2 border-ink bg-card p-4">
            <p className="text-xl font-bold">Tap the product you sold:</p>
            {options.map((p) => (
              <button
                key={p.id}
                type="button"
                disabled={pending}
                onClick={() => choose(p.id)}
                className={`${ownerButton.secondary} justify-between text-left`}
              >
                <span>{p.name}</span>
                <span className="ml-3 shrink-0">{formatPrice(p.priceCents)}</span>
              </button>
            ))}
            <button type="button" className={ownerButton.small} onClick={() => setChoosing(false)}>
              Close
            </button>
          </div>
        ) : (
          <button type="button" className={ownerButton.primary} onClick={() => setChoosing(true)}>
            + Add product
          </button>
        ))}

      {error && (
        <p role="alert" className="text-lg font-semibold text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
