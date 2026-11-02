import { describe, expect, it } from "vitest";
import { PG_ERROR, pgErrorCode } from "./errors";

function withCode(code: string): Error {
  return Object.assign(new Error("db error"), { code, severity: "ERROR" });
}

describe("pgErrorCode", () => {
  it("reads the code from a driver error", () => {
    expect(pgErrorCode(withCode(PG_ERROR.exclusionViolation))).toBe("23P01");
  });

  it("looks through wrapped errors", () => {
    const wrapped = new Error("Failed query", { cause: withCode("23505") });
    expect(pgErrorCode(wrapped)).toBe("23505");
  });

  it("ignores Node system errors", () => {
    expect(pgErrorCode(Object.assign(new Error("x"), { code: "EPIPE" }))).toBeUndefined();
    expect(pgErrorCode(Object.assign(new Error("x"), { code: "ECONNREFUSED" }))).toBeUndefined();
  });

  it("returns undefined for non-errors", () => {
    expect(pgErrorCode(undefined)).toBeUndefined();
    expect(pgErrorCode("boom")).toBeUndefined();
  });
});
