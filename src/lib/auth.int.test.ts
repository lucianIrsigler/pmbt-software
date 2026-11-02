import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Database } from "@/db/client";
import { session, user } from "@/db/schema";
import { testDatabaseUrl } from "@/test/database";
import { attemptLogin, LOGIN_RATE_LIMIT_PER_EMAIL } from "./login";
import { hashPassword } from "./password";
import { createSession, deleteSession, hashSessionToken, validateSession } from "./session";

const DAY = 86_400_000;
const PASSWORD = "a long test password";
let db: Database;
let userId: string;

beforeAll(async () => {
  db = createDb(testDatabaseUrl(), { max: 2 });
  await db.execute(sql`truncate session, "user", rate_limit cascade`);
  const [row] = await db
    .insert(user)
    .values({
      email: "owner@example.com",
      name: "Owner",
      passwordHash: await hashPassword(PASSWORD),
    })
    .returning({ id: user.id });
  if (!row) throw new Error("insert failed");
  userId = row.id;
});

afterAll(async () => {
  await db.$client.end();
});

describe("sessions", () => {
  const t0 = new Date("2030-01-01T00:00:00Z");

  it("stores only a hash of the token", async () => {
    const { token } = await createSession(db, userId, t0);
    const rows = await db.select().from(session).where(eq(session.userId, userId));
    expect(rows.map((r) => r.id)).toContain(hashSessionToken(token));
    expect(rows.map((r) => r.id)).not.toContain(token);
  });

  it("validates a fresh session and returns the user", async () => {
    const { token, expiresAt } = await createSession(db, userId, t0);
    expect(expiresAt).toEqual(new Date(t0.getTime() + 90 * DAY));
    expect(await validateSession(db, token, t0)).toEqual({
      id: userId,
      email: "owner@example.com",
      name: "Owner",
    });
  });

  it("rejects unknown, empty and expired tokens", async () => {
    const { token } = await createSession(db, userId, t0);
    expect(await validateSession(db, "nope", t0)).toBeNull();
    expect(await validateSession(db, undefined, t0)).toBeNull();
    expect(await validateSession(db, token, new Date(t0.getTime() + 90 * DAY))).toBeNull();
  });

  it("slides the expiry forward when used, so active sessions last for weeks", async () => {
    const { token } = await createSession(db, userId, t0);
    // Used every 60 days: would have expired at day 90 without refreshing.
    for (const day of [60, 120, 180]) {
      const now = new Date(t0.getTime() + day * DAY);
      expect(await validateSession(db, token, now)).not.toBeNull();
    }
    const [row] = await db
      .select()
      .from(session)
      .where(eq(session.id, hashSessionToken(token)));
    expect(row?.expiresAt).toEqual(new Date(t0.getTime() + 270 * DAY));
  });

  it("logs out by deleting the session", async () => {
    const { token } = await createSession(db, userId, t0);
    await deleteSession(db, token);
    expect(await validateSession(db, token, t0)).toBeNull();
  });
});

describe("attemptLogin", () => {
  const now = new Date("2030-02-01T10:00:00Z");

  it("logs in with the right password, case-insensitive email", async () => {
    const result = await attemptLogin(
      db,
      { email: "  Owner@Example.com ", password: PASSWORD, ipKey: "ip-a" },
      now,
    );
    expect(result).toMatchObject({ ok: true, userId });
    if (result.ok) expect(await validateSession(db, result.token, now)).not.toBeNull();
  });

  it("gives the same answer for a wrong password and an unknown email", async () => {
    const wrong = await attemptLogin(
      db,
      { email: "owner@example.com", password: "wrong password!", ipKey: "ip-b" },
      now,
    );
    const unknown = await attemptLogin(
      db,
      { email: "nobody@example.com", password: PASSWORD, ipKey: "ip-b" },
      now,
    );
    expect(wrong).toEqual({ ok: false, reason: "invalid" });
    expect(unknown).toEqual({ ok: false, reason: "invalid" });
  });

  it("rate limits repeated attempts on one email, even with the right password", async () => {
    const later = new Date("2030-03-01T10:00:00Z");
    for (let i = 0; i < LOGIN_RATE_LIMIT_PER_EMAIL.limit; i++) {
      await attemptLogin(
        db,
        { email: "owner@example.com", password: "guess", ipKey: `ip-${i}` },
        later,
      );
    }
    expect(
      await attemptLogin(
        db,
        { email: "owner@example.com", password: PASSWORD, ipKey: "ip-fresh" },
        later,
      ),
    ).toEqual({ ok: false, reason: "rate_limited" });

    // A new window lets her in again.
    const nextWindow = new Date(later.getTime() + 15 * 60_000);
    expect(
      await attemptLogin(
        db,
        { email: "owner@example.com", password: PASSWORD, ipKey: "ip-fresh" },
        nextWindow,
      ),
    ).toMatchObject({ ok: true });
  });
});
