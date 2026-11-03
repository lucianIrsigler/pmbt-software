import { describe, expect, it } from "vitest";
import { rangeInstants, rangeQuery, resolveRange } from "./date-range";

const TODAY = "2026-11-03";

describe("resolveRange", () => {
  it("defaults to this whole month", () => {
    expect(resolveRange({}, TODAY)).toEqual({
      preset: "this-month",
      from: "2026-11-01",
      to: "2026-11-30",
    });
    expect(resolveRange({ range: "nonsense" }, TODAY).preset).toBe("this-month");
  });

  it("knows last month, across a year boundary and in February", () => {
    expect(resolveRange({ range: "last-month" }, "2027-01-15")).toEqual({
      preset: "last-month",
      from: "2026-12-01",
      to: "2026-12-31",
    });
    expect(resolveRange({ range: "last-month" }, "2028-03-10")).toMatchObject({
      from: "2028-02-01",
      to: "2028-02-29",
    });
  });

  it("covers the last three months up to today", () => {
    expect(resolveRange({ range: "last-3-months" }, TODAY)).toEqual({
      preset: "last-3-months",
      from: "2026-09-01",
      to: TODAY,
    });
  });

  it("accepts custom ranges, swapping a backwards one", () => {
    expect(resolveRange({ range: "custom", from: "2026-01-10", to: "2026-02-05" }, TODAY)).toEqual({
      preset: "custom",
      from: "2026-01-10",
      to: "2026-02-05",
    });
    expect(
      resolveRange({ range: "custom", from: "2026-02-05", to: "2026-01-10" }, TODAY),
    ).toMatchObject({ from: "2026-01-10", to: "2026-02-05" });
  });

  it("falls back to this month for invalid custom dates, and caps very long ranges", () => {
    expect(
      resolveRange({ range: "custom", from: "2026-02-30", to: "2026-03-01" }, TODAY).preset,
    ).toBe("this-month");
    const long = resolveRange({ range: "custom", from: "2010-01-01", to: "2026-01-01" }, TODAY);
    expect(long.from).toBe("2010-01-01");
    expect(long.to < "2014-01-01").toBe(true);
  });
});

describe("rangeInstants / rangeQuery", () => {
  it("runs from local midnight to the midnight after the last day", () => {
    expect(rangeInstants({ from: "2026-11-01", to: "2026-11-30" }, "Africa/Johannesburg")).toEqual({
      start: new Date("2026-10-31T22:00:00Z"),
      end: new Date("2026-11-30T22:00:00Z"),
    });
  });

  it("keeps only what a link needs", () => {
    expect(rangeQuery(resolveRange({ range: "last-month" }, TODAY))).toEqual({
      range: "last-month",
    });
    expect(
      rangeQuery(resolveRange({ range: "custom", from: "2026-01-01", to: "2026-01-31" }, TODAY)),
    ).toEqual({ range: "custom", from: "2026-01-01", to: "2026-01-31" });
  });
});
