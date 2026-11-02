import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Database } from "@/db/client";
import { rateLimit } from "@/db/schema";
import { testDatabaseUrl } from "@/test/database";
import { consumeRateLimit, windowStart } from "./rate-limit";

let db: Database;

beforeAll(() => {
  db = createDb(testDatabaseUrl(), { max: 2 });
});

afterAll(async () => {
  await db.$client.end();
});

describe("consumeRateLimit", () => {
  const rule = { limit: 3, windowSeconds: 3600 };
  const now = new Date("2030-05-01T10:15:00Z");

  it("allows up to the limit within a window, then blocks", async () => {
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await consumeRateLimit(db, "test:a", rule, now));
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
    expect(results.at(-1)?.count).toBe(4);
  });

  it("keeps keys separate", async () => {
    expect((await consumeRateLimit(db, "test:b", rule, now)).allowed).toBe(true);
  });

  it("starts fresh in the next window", async () => {
    const later = new Date("2030-05-01T11:00:00Z");
    expect(await consumeRateLimit(db, "test:a", rule, later)).toEqual({ allowed: true, count: 1 });
  });

  it("counts concurrent hits correctly", async () => {
    const results = await Promise.all(
      Array.from({ length: 6 }, () => consumeRateLimit(db, "test:c", rule, now)),
    );
    expect(results.filter((r) => r.allowed)).toHaveLength(3);
  });

  it("cleans up windows older than a day", async () => {
    await consumeRateLimit(db, "test:old", rule, new Date("2030-04-01T00:00:00Z"));
    await consumeRateLimit(db, "test:new", rule, now);
    const keys = (await db.select({ key: rateLimit.key }).from(rateLimit)).map((r) => r.key);
    expect(keys).not.toContain("test:old");
  });

  it("aligns windows to fixed boundaries", () => {
    expect(windowStart(now, 3600).toISOString()).toBe("2030-05-01T10:00:00.000Z");
  });
});
