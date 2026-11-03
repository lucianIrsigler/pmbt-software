import { beforeEach, describe, expect, it, vi } from "vitest";

const execute = vi.fn<() => Promise<unknown>>();
vi.mock("@/db", () => ({ getDb: () => ({ execute }) }));
vi.mock("@/lib/log", () => ({ logError: vi.fn() }));

const { GET } = await import("./route");
const live = await import("./live/route");

beforeEach(() => {
  execute.mockReset();
});

describe("/api/health", () => {
  it("is ok when the database answers", async () => {
    execute.mockResolvedValue([{ "?column?": 1 }]);
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok", database: "ok" });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("is 503 without details when the database is down", async () => {
    execute.mockRejectedValue(new Error("connect ECONNREFUSED 10.0.0.5:5432"));
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "error", database: "unreachable" });
  });
});

describe("/api/health/live", () => {
  it("is ok without touching the database", async () => {
    const response = live.GET();
    expect(response.status).toBe(200);
    expect(execute).not.toHaveBeenCalled();
  });
});
