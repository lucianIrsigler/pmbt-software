import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/db", () => ({ getDb: vi.fn() }));

const { safeNextPath } = await import("./auth");

describe("safeNextPath", () => {
  it.each([
    ["/app", "/app"],
    ["/app/calendar?week=2030-01-07", "/app/calendar?week=2030-01-07"],
    ["/admin", "/admin"],
    ["/admin/services", "/admin/services"],
  ])("allows %s", (next, expected) => {
    expect(safeNextPath(next)).toBe(expected);
  });

  it.each([
    [undefined],
    [""],
    ["https://evil.example"],
    ["//evil.example/app"],
    ["/book"],
    ["/application"],
    ["app"],
  ])("falls back to /app for %j", (next) => {
    expect(safeNextPath(next)).toBe("/app");
  });
});
