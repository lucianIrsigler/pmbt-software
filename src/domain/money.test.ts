import { describe, expect, it } from "vitest";
import { centsToRands, randsToCents } from "./money";

describe("randsToCents", () => {
  it.each([
    ["450", 45_000],
    ["450.5", 45_050],
    ["450.50", 45_050],
    ["450,50", 45_050],
    ["R450", 45_000],
    ["r 1 200", 120_000],
    ["0", 0],
    [" 12.05 ", 1_205],
  ])("%s → %d cents", (text, cents) => {
    expect(randsToCents(text)).toBe(cents);
  });

  it.each(["", "abc", "-10", "1.234", "1,200.50.1", "12,34,56", "1e3", "100001"])(
    "rejects %j",
    (text) => {
      expect(randsToCents(text)).toBeNull();
    },
  );
});

describe("centsToRands", () => {
  it("shows two decimals for forms", () => {
    expect(centsToRands(45_000)).toBe("450.00");
    expect(centsToRands(1_205)).toBe("12.05");
  });
});
