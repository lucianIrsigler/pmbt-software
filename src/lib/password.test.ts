import { describe, expect, it } from "vitest";
import { hashPassword, passwordSchema, verifyPassword } from "./password";

describe("password hashing", () => {
  it("hashes with argon2id and verifies the right password", async () => {
    const hashed = await hashPassword("correct horse battery");
    expect(hashed).toMatch(/^\$argon2id\$/);
    expect(hashed).not.toContain("correct horse battery");
    expect(await verifyPassword(hashed, "correct horse battery")).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hashed = await hashPassword("correct horse battery");
    expect(await verifyPassword(hashed, "Correct horse battery")).toBe(false);
  });

  it("salts every hash", async () => {
    expect(await hashPassword("same password")).not.toBe(await hashPassword("same password"));
  });

  it("returns false (doesn't throw) for a malformed hash", async () => {
    expect(await verifyPassword("not-a-hash", "anything")).toBe(false);
  });

  it("requires at least 10 characters", () => {
    expect(passwordSchema.safeParse("short").success).toBe(false);
    expect(passwordSchema.safeParse("long enough!").success).toBe(true);
  });
});
