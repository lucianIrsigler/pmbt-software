import "server-only";
import { refresh } from "next/cache";
import { DomainError } from "@/domain/errors";
import { requireUser } from "./auth";
import { logError } from "./log";

/** Shown when something unexpected fails (details are logged, never shown). */
export const SOMETHING_WRONG = "Something went wrong. Please try again.";

/** Result shown by the button that triggered the action. */
export interface ActionResult {
  error?: string;
}

/**
 * Runs a signed-in button action (Done, Archive, Remove…): checks the session (the
 * proxy alone isn't enough), turns domain errors into their friendly message, logs
 * anything else by `ids` only (POPIA), and refreshes the page on success.
 */
export async function runOwnerAction(
  context: string,
  ids: Record<string, string>,
  fn: () => Promise<unknown>,
): Promise<ActionResult> {
  await requireUser();
  try {
    await fn();
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
    logError(context, error, ids);
    return { error: SOMETHING_WRONG };
  }
  refresh();
  return {};
}
