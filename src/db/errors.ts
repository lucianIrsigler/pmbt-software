/** SQLSTATE codes we handle explicitly. */
export const PG_ERROR = {
  uniqueViolation: "23505",
  foreignKeyViolation: "23503",
  checkViolation: "23514",
  exclusionViolation: "23P01",
} as const;

/** Postgres server errors carry a 5-character SQLSTATE `code` and a `severity`. */
function readCode(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  if (!("code" in value) || !("severity" in value)) return undefined;
  return typeof value.code === "string" ? value.code : undefined;
}

/**
 * Returns the Postgres SQLSTATE code for an error thrown by a query, if any.
 * Drizzle wraps driver errors, so this also looks through `cause`.
 */
export function pgErrorCode(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth++) {
    const code = readCode(current);
    if (code && /^[0-9A-Z]{5}$/.test(code)) return code;
    current = current instanceof Error ? current.cause : undefined;
  }
  return undefined;
}
