import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import nodemailer, { type Transporter } from "nodemailer";
import { getEnv, type Env } from "./env";

export interface EmailAttachment {
  filename: string;
  content: string;
  contentType: string;
}

export interface EmailMessage {
  to: string;
  replyTo?: string | undefined;
  subject: string;
  text: string;
  html: string;
  attachments?: EmailAttachment[];
}

/**
 * - `smtp`: production, over plain SMTP (e.g. a Google account with an app password).
 * - `console`: development and tests; printed instead of sent. Development data only.
 * - `outbox`: e2e tests; written as JSON files to `EMAIL_OUTBOX_DIR` so tests can read them.
 */
export type Delivery = "smtp" | "console" | "outbox";

export function chooseDelivery(env: Pick<Env, "NODE_ENV" | "EMAIL_OUTBOX_DIR">): Delivery {
  if (env.EMAIL_OUTBOX_DIR) return "outbox";
  return env.NODE_ENV === "production" ? "smtp" : "console";
}

let transporter: Transporter | undefined;

function smtpTransport(env: Env): Transporter {
  transporter ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    // Port 465 uses TLS from the start; 587 upgrades with STARTTLS.
    secure: env.SMTP_PORT === 465,
    ...(env.SMTP_USER ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } } : {}),
    // Fail fast rather than hang: callers log the failure and carry on.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  return transporter;
}

/**
 * Sends one email. Throws on failure; callers catch and log by appointment id (never
 * the address or content), so an email problem can't break a booking.
 */
export async function sendEmail(message: EmailMessage): Promise<void> {
  const env = getEnv();
  const from = env.MAIL_FROM ?? "bookings@localhost";

  switch (chooseDelivery(env)) {
    case "outbox": {
      const dir = env.EMAIL_OUTBOX_DIR ?? "";
      await mkdir(dir, { recursive: true });
      const file = path.join(dir, `${Date.now()}-${randomUUID()}.json`);
      await writeFile(file, JSON.stringify({ from, ...message }, null, 2));
      return;
    }
    case "console": {
      const attached = (message.attachments ?? []).map((a) => a.filename).join(", ");
      console.info(
        [
          "----- email (development: not sent) -----",
          `From: ${from}`,
          `To: ${message.to}`,
          `Subject: ${message.subject}`,
          ...(attached ? [`Attachments: ${attached}`] : []),
          "",
          message.text,
          "-----------------------------------------",
        ].join("\n"),
      );
      return;
    }
    case "smtp":
      await smtpTransport(env).sendMail({ from, ...message });
  }
}
