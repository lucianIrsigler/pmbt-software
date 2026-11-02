import { randomBytes } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import postgres from "postgres";
import { e2eDatabaseUrl } from "../src/test/database";
import { E2E_USER } from "./user";

const TZ = "Africa/Johannesburg";

export async function signIn(page: Page, next = "/app"): Promise<void> {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email").fill(E2E_USER.email);
  await page.getByLabel("Password").fill(E2E_USER.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(new RegExp(`${next}$`));
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
}): Promise<{ appointmentId: string }> {
  const sql = postgres(e2eDatabaseUrl(), { max: 1, onnotice: () => {} });
  try {
    const [svc] = await sql<{ id: string; duration_min: number; buffer_min: number }[]>`
      select id, duration_min, buffer_min from service
      where for_kind = 'human' and active order by sort_order limit 1`;
    if (!svc) throw new Error("seed data missing");
    const minutes = svc.duration_min + svc.buffer_min;

    const [client] = await sql<{ id: string }[]>`
      insert into client (name, phone, notes)
      values (${opts.clientName}, ${opts.phone}, ${opts.clientNotes ?? ""})
      returning id`;
    if (!client) throw new Error("insert failed");

    const startOf = (daysAgo: number) => sql`
      (date_trunc('day', now() at time zone ${TZ}) - make_interval(days => ${daysAgo})
        + make_interval(hours => ${opts.hour})) at time zone ${TZ}`;
    const during = (daysAgo: number) =>
      sql`tstzrange(${startOf(daysAgo)}, ${startOf(daysAgo)} + make_interval(mins => ${minutes}))`;

    await sql`
      insert into appointment (client_id, service_id, during, status, source, notes, manage_token)
      values (${client.id}, ${svc.id}, ${during(7)}, 'done', 'app',
              ${opts.lastVisitNotes ?? ""}, ${randomBytes(32).toString("base64url")})`;
    const [appt] = await sql<{ id: string }[]>`
      insert into appointment (client_id, service_id, during, status, source, manage_token)
      values (${client.id}, ${svc.id}, ${during(0)}, 'booked', 'app',
              ${randomBytes(32).toString("base64url")})
      returning id`;
    if (!appt) throw new Error("insert failed");
    return { appointmentId: appt.id };
  } finally {
    await sql.end();
  }
}
