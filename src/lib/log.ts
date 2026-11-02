import { pgErrorCode } from "@/db/errors";

/**
 * POPIA-safe error logging: we log the error's type, our context and ids only.
 * Error messages are NOT logged, because driver errors can echo personal data
 * (e.g. "Key (phone)=(+27...) already exists").
 */
export function logError(
  context: string,
  error: unknown,
  ids: Record<string, string | undefined> = {},
): void {
  const name = error instanceof Error ? error.name : typeof error;
  const code = pgErrorCode(error) ?? (error as { code?: unknown } | null)?.code;
  console.error(JSON.stringify({ level: "error", context, error: name, code, ...ids }));
}

export function logInfo(context: string, ids: Record<string, string | undefined> = {}): void {
  console.info(JSON.stringify({ level: "info", context, ...ids }));
}
