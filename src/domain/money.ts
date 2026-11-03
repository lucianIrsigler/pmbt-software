import { z } from "zod";

/** Highest price accepted from a form: R100 000. */
const MAX_CENTS = 100_000 * 100;

/**
 * Parses rands as people type them: `450`, `450.5`, `450,50`, `R 1 200`. Returns cents,
 * or null if it isn't a valid amount (negative, more than two decimals, letters…).
 */
export function randsToCents(text: string): number | null {
  let value = text.trim().replace(/^R\s*/i, "").replace(/[\s ]/g, "");
  // A single comma with no dot is a decimal comma (common in South Africa).
  if (!value.includes(".") && (value.match(/,/g) ?? []).length === 1)
    value = value.replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return null;
  const [whole = "0", fraction = ""] = value.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return cents <= MAX_CENTS ? cents : null;
}

/** Cents to the form's text, e.g. `45000` → `450.00`. */
export function centsToRands(cents: number): string {
  return (cents / 100).toFixed(2);
}

export const randsSchema = z.string().transform((text, ctx) => {
  const cents = randsToCents(text);
  if (cents === null) {
    ctx.addIssue({ code: "custom", message: "Please enter a price in rands, e.g. 450 or 450.50" });
    return z.NEVER;
  }
  return cents;
});
