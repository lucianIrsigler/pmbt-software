import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

const valid = {
  DATABASE_URL: "postgres://dogstuff:dogstuff@localhost:5432/dogstuff",
  APP_URL: "http://localhost:3000",
  SESSION_SECRET: "x".repeat(32),
};

describe("parseEnv", () => {
  it("accepts a minimal development config and applies defaults", () => {
    const env = parseEnv(valid);
    expect(env.NODE_ENV).toBe("development");
    expect(env.SMTP_PORT).toBe(587);
    expect(env.BUSINESS_TZ).toBe("Africa/Johannesburg");
    expect(env.SMTP_HOST).toBeUndefined();
  });

  it("treats empty strings as unset", () => {
    expect(parseEnv({ ...valid, SMTP_HOST: "" }).SMTP_HOST).toBeUndefined();
  });

  it("coerces SMTP_PORT to a number", () => {
    expect(parseEnv({ ...valid, SMTP_PORT: "465" }).SMTP_PORT).toBe(465);
  });

  it("rejects missing required variables, naming them", () => {
    expect(() => parseEnv({})).toThrow(/DATABASE_URL[\s\S]*APP_URL[\s\S]*SESSION_SECRET/);
  });

  it("rejects a non-postgres DATABASE_URL", () => {
    expect(() => parseEnv({ ...valid, DATABASE_URL: "mysql://localhost/db" })).toThrow(
      /DATABASE_URL/,
    );
  });

  it("rejects a short SESSION_SECRET", () => {
    expect(() => parseEnv({ ...valid, SESSION_SECRET: "short" })).toThrow(/SESSION_SECRET/);
  });

  it("rejects an unknown time zone", () => {
    expect(() => parseEnv({ ...valid, BUSINESS_TZ: "Mars/Olympus" })).toThrow(/BUSINESS_TZ/);
  });

  it("requires SMTP settings in production", () => {
    expect(() => parseEnv({ ...valid, NODE_ENV: "production" })).toThrow(
      /SMTP_HOST[\s\S]*MAIL_FROM/,
    );
    const env = parseEnv({
      ...valid,
      NODE_ENV: "production",
      SMTP_HOST: "mail.example.com",
      MAIL_FROM: "bookings@example.com",
    });
    expect(env.SMTP_HOST).toBe("mail.example.com");
  });

  it("never includes values in the error message", () => {
    const secret = "very-secret-but-short";
    expect(() => parseEnv({ ...valid, SESSION_SECRET: secret })).toThrow(
      expect.not.objectContaining({ message: expect.stringContaining(secret) }),
    );
  });
});
