import { z } from "zod";

const optionalString = z
  .string()
  .trim()
  .transform((value) => (value === "" ? undefined : value))
  .optional();

function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-ZA", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    APP_URL: z.url({ protocol: /^https?$/ }),
    SESSION_SECRET: z.string().min(32, "must be at least 32 characters"),
    SMTP_HOST: optionalString,
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
    SMTP_USER: optionalString,
    SMTP_PASS: optionalString,
    MAIL_FROM: optionalString,
    /** Tests only: write emails as JSON files to this folder instead of sending them. */
    EMAIL_OUTBOX_DIR: optionalString,
    BUSINESS_TZ: z
      .string()
      .default("Africa/Johannesburg")
      .refine(isValidTimeZone, "must be a valid IANA time zone"),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== "production") return;
    for (const key of ["SMTP_HOST", "MAIL_FROM"] as const) {
      if (!env[key]) {
        ctx.addIssue({ code: "custom", path: [key], message: "is required in production" });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

/**
 * Validates environment variables. The error lists variable names and problems only,
 * never values, so secrets don't end up in logs.
 */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (result.success) return result.data;

  const problems = result.error.issues
    .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("\n");
  throw new Error(`Invalid environment variables:\n${problems}`);
}

let cached: Env | undefined;

/** Parsed environment, validated once on first use (and at server startup). */
export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
