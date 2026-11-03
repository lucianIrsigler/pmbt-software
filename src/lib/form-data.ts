import type { z } from "zod";

/** A text field from a submitted form ("" if missing or a file). */
export function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

/**
 * The first error message per field, keyed by field name. `rename` maps a schema's field
 * name to the form's, e.g. `{ name: "petName" }` when a pet schema backs a "petName" input.
 */
export function fieldErrors<F extends string>(
  error: z.ZodError,
  rename: Partial<Record<string, F>> = {},
): Partial<Record<F, string>> {
  const result: Partial<Record<F, string>> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "");
    result[rename[key] ?? (key as F)] ??= issue.message;
  }
  return result;
}
