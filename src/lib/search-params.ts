/** Helpers for a page's `searchParams` (the query string). */

/** What Next.js passes to a page as `searchParams`. */
export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** A query parameter given once (`?a=1`), or undefined if missing or repeated. */
export function stringParam(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}
