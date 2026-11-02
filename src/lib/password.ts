import { hash, verify } from "@node-rs/argon2";
import { z } from "zod";

/**
 * Password hashing with argon2id (library defaults: m=19 MiB, t=2, p=1, which match
 * the OWASP recommendation). No `server-only` import so CLI scripts can use it too.
 */

export const MIN_PASSWORD_LENGTH = 10;

export const passwordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
  .max(200, "Password is too long");

export async function hashPassword(password: string): Promise<string> {
  return hash(password);
}

/** True if `password` matches `passwordHash`. Never throws for a malformed hash. */
export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

/**
 * A real argon2 hash of a random password, used when the email doesn't exist so a failed
 * login takes the same time either way (no account enumeration by timing).
 */
let dummyHash: Promise<string> | undefined;
export function dummyPasswordHash(): Promise<string> {
  dummyHash ??= hash(crypto.randomUUID());
  return dummyHash;
}
