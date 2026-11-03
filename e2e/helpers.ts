import { randomBytes } from "node:crypto";
import { expect, type BrowserContext, type Page } from "@playwright/test";
import postgres from "postgres";
import { e2eDatabaseUrl } from "../src/test/database";
import { TZ } from "./dates";
import { E2E_USER } from "./user";

type Cookies = Awaited<ReturnType<BrowserContext["cookies"]>>;

/** Session cookies from the first sign-in, reused by later tests in this worker. */
let savedSession: Cookies | null = null;

/**
 * Signs in through the login form once, then reuses that session. The app limits
 * sign-ins to 10 per email per 15 minutes, which the whole suite would exceed.
 * (e2e/auth.spec.ts tests the login form itself.)
 */
export async function signIn(page: Page, next = "/app"): Promise<void> {
  if (savedSession) {
    await page.context().addCookies(savedSession);
    await page.goto(next);
    if (new URL(page.url()).pathname === next) return;
    savedSession = null; // the session ended (e.g. expired); sign in again below
  }
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email").fill(E2E_USER.email);
  await page.getByLabel("Password").fill(E2E_USER.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(new RegExp(`${next}$`));
  savedSession = await page.context().cookies();
}

/**
 * Inserts a client with an appointment today at `hour` (business time), plus a
 * completed visit a week earlier. Plain SQL: the app's db code is server-only.
 */
export async function seedTodayAppointment(opts: {
  clientName: string;
  phone: string;
  hour: number;
  clientNotes?: string;
  lastVisitNotes?: string;
  email?: string;
}): Promise<{ appointmentId: string }> {
  const sql = postgres(e2eDatabaseUrl(), { max: 1, onnotice: () => {} });
  try {
    const [svc] = await sql<
      { id: string; duration_min: number; buffer_min: number; price_cents: number }[]
    >`
      select id, duration_min, buffer_min, price_cents from service
      where for_kind = 'human' and active order by sort_order limit 1`;
    if (!svc) throw new Error("seed data missing");
    const minutes = svc.duration_min + svc.buffer_min;

    const [client] = await sql<{ id: string }[]>`
      insert into client (name, phone, notes, email)
      values (${opts.clientName}, ${opts.phone}, ${opts.clientNotes ?? ""}, ${opts.email ?? null})
      returning id`;
    if (!client) throw new Error("insert failed");

    const startOf = (daysAgo: number) => sql`
      (date_trunc('day', now() at time zone ${TZ}) - make_interval(days => ${daysAgo})
        + make_interval(hours => ${opts.hour})) at time zone ${TZ}`;
    const during = (daysAgo: number) =>
      sql`tstzrange(${startOf(daysAgo)}, ${startOf(daysAgo)} + make_interval(mins => ${minutes}))`;

    await sql`
      insert into appointment
        (client_id, service_id, during, status, source, notes, manage_token, price_cents)
      values (${client.id}, ${svc.id}, ${during(7)}, 'done', 'app',
              ${opts.lastVisitNotes ?? ""}, ${randomBytes(32).toString("base64url")},
              ${svc.price_cents})`;
    const [appt] = await sql<{ id: string }[]>`
      insert into appointment (client_id, service_id, during, status, source, manage_token, price_cents)
      values (${client.id}, ${svc.id}, ${during(0)}, 'booked', 'app',
              ${randomBytes(32).toString("base64url")}, ${svc.price_cents})
      returning id`;
    if (!appt) throw new Error("insert failed");
    return { appointmentId: appt.id };
  } finally {
    await sql.end();
  }
}
