import type { z } from "zod";

/** A text field from a submitted form ("" if missing or a file). */
export function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

/** The first error message per field, keyed by the field name. */
export function fieldErrors<F extends string>(error: z.ZodError): Partial<Record<F, string>> {
  const result: Partial<Record<F, string>> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "") as F;
    result[key] ??= issue.message;
  }
  return result;
}
