/**
 * Creates a login, or changes the role or password of an existing one.
 * Roles: `owner` (her app only) or `admin` (the app and the admin area); see
 * src/lib/permissions.ts. Usage: pnpm user:create
 */
import { createInterface } from "node:readline/promises";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { createDb } from "@/db/client";
import { session, user, userRole } from "@/db/schema";
import { getEnv } from "@/lib/env";
import { hashPassword, passwordSchema } from "@/lib/password";
import type { Role } from "@/lib/permissions";

const emailSchema = z.email("That doesn't look like an email address").max(254);

/** Asks for a role; an empty answer keeps `current`. */
function roleSchema(current: Role): z.ZodType<Role, string> {
  return z
    .string()
    .trim()
    .toLowerCase()
    .transform((answer) => answer || current)
    .pipe(
      z.enum(userRole.enumValues, { error: `Please type ${userRole.enumValues.join(" or ")}` }),
    );
}

function roleQuestion(current: Role): string {
  return `Role: owner (her app only) or admin (app and admin area)? [${current}] `;
}

const ENTER = ["\r", "\n"];
const CTRL_C = "\u0003";
const BACKSPACE = ["\u007f", "\b"];

interface Prompt {
  ask(question: string): Promise<string>;
  /** Asks without echoing the answer (passwords). */
  askHidden(question: string): Promise<string>;
  close(): void;
}

/** Piped input (CI, scripts): one line reader shared by every question. */
function pipedPrompt(): Prompt {
  const rl = createInterface({ input: process.stdin, terminal: false });
  const lines = rl[Symbol.asyncIterator]();
  const ask = async (question: string): Promise<string> => {
    process.stdout.write(question);
    const next = await lines.next();
    if (next.done) throw new Error("Input ended before all questions were answered");
    process.stdout.write("\n");
    return String(next.value);
  };
  return { ask, askHidden: ask, close: () => rl.close() };
}

/** Interactive terminal: normal questions via readline, passwords read in raw mode. */
function terminalPrompt(): Prompt {
  let rl: ReturnType<typeof createInterface> | undefined;
  const stdin = process.stdin;

  const ask = (question: string): Promise<string> => {
    rl ??= createInterface({ input: stdin, output: process.stdout });
    return rl.question(question);
  };

  const askHidden = (question: string): Promise<string> => {
    // Readline would echo the keystrokes, so close it while reading the password.
    rl?.close();
    rl = undefined;
    process.stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    return new Promise((resolve, reject) => {
      let value = "";
      const finish = (): void => {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.off("data", onData);
      };
      const onData = (chunk: string): void => {
        for (const char of chunk) {
          if (ENTER.includes(char)) {
            finish();
            process.stdout.write("\n");
            resolve(value);
            return;
          }
          if (char === CTRL_C) {
            finish();
            reject(new Error("Cancelled"));
            return;
          }
          if (BACKSPACE.includes(char)) value = value.slice(0, -1);
          else value += char;
        }
      };
      stdin.on("data", onData);
    });
  };

  return { ask, askHidden, close: () => rl?.close() };
}

async function askUntilValid<T>(
  ask: () => Promise<string>,
  schema: z.ZodType<T, string>,
): Promise<T> {
  for (;;) {
    const result = schema.safeParse(await ask());
    if (result.success) return result.data;
    console.log(`  ${result.error.issues[0]?.message ?? "Invalid value"}`);
  }
}

async function main(): Promise<void> {
  const db = createDb(getEnv().DATABASE_URL, { max: 1 });
  const prompt = process.stdin.isTTY ? terminalPrompt() : pipedPrompt();
  try {
    const email = (await askUntilValid(() => prompt.ask("Email: "), emailSchema)).toLowerCase();

    const [existing] = await db
      .select({ id: user.id, name: user.name, role: user.role })
      .from(user)
      .where(eq(sql`lower(${user.email})`, email));

    if (existing) {
      console.log(`A user with this email already exists (${existing.name}, ${existing.role}).`);
      const role = await askUntilValid(
        () => prompt.ask(roleQuestion(existing.role)),
        roleSchema(existing.role),
      );
      if (role !== existing.role) {
        // Takes effect on their next page load: the role is read with every session check.
        await db.update(user).set({ role }).where(eq(user.id, existing.id));
        console.log(`Role changed to ${role}.`);
      }
      const answer = await prompt.ask("Reset their password? (y/N) ");
      if (answer.trim().toLowerCase() !== "y") {
        if (role === existing.role) console.log("Nothing changed.");
        return;
      }
    }
    const name =
      existing?.name ??
      (await askUntilValid(
        () => prompt.ask("Name: "),
        z.string().trim().min(1, "Please enter a name").max(100),
      ));
    const newRole = existing
      ? existing.role
      : await askUntilValid(() => prompt.ask(roleQuestion("owner")), roleSchema("owner"));

    let password: string;
    for (;;) {
      password = await askUntilValid(
        () => prompt.askHidden("Password (10+ characters): "),
        passwordSchema,
      );
      if ((await prompt.askHidden("Repeat password: ")) === password) break;
      console.log("  The passwords didn't match. Please try again.");
    }
    const passwordHash = await hashPassword(password);

    if (existing) {
      await db.transaction(async (tx) => {
        await tx.update(user).set({ passwordHash }).where(eq(user.id, existing.id));
        // Sign out everywhere when the password changes.
        await tx.delete(session).where(eq(session.userId, existing.id));
      });
      console.log(`Password reset for ${email}. Other devices have been signed out.`);
    } else {
      await db.insert(user).values({ email, name, passwordHash, role: newRole });
      console.log(`User ${email} (${newRole}) created. They can now sign in at /login.`);
    }
  } finally {
    prompt.close();
    await db.$client.end();
  }
}

main().catch((error: unknown) => {
  console.error("user:create failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
