import { readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { expect } from "@playwright/test";

/** The e2e server writes emails here instead of sending them (see EMAIL_OUTBOX_DIR). */
export const OUTBOX_DIR = path.resolve(".e2e-outbox");

export interface OutboxEmail {
  from: string;
  to: string;
  replyTo?: string;
  subject: string;
  text: string;
  html: string;
  attachments?: { filename: string; content: string; contentType: string }[];
}

export async function clearOutbox(): Promise<void> {
  await rm(OUTBOX_DIR, { recursive: true, force: true });
}

async function readOutbox(): Promise<OutboxEmail[]> {
  let files: string[];
  try {
    files = await readdir(OUTBOX_DIR);
  } catch {
    return [];
  }
  const emails = await Promise.all(
    files
      .filter((f) => f.endsWith(".json"))
      .sort()
      .map(
        async (f) => JSON.parse(await readFile(path.join(OUTBOX_DIR, f), "utf8")) as OutboxEmail,
      ),
  );
  return emails;
}

/**
 * Waits for an email matching `match`. Emails are sent just after the response
 * (Next.js `after()`), so they may arrive a moment after the page has updated.
 */
export async function waitForEmail(match: (email: OutboxEmail) => boolean): Promise<OutboxEmail> {
  let found: OutboxEmail | undefined;
  await expect
    .poll(
      async () => {
        found = (await readOutbox()).find(match);
        return found !== undefined;
      },
      { message: "expected an email in the outbox" },
    )
    .toBe(true);
  if (!found) throw new Error("unreachable");
  return found;
}
