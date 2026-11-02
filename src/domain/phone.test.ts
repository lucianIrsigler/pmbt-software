import { describe, expect, it } from "vitest";
import { normalizePhone } from "./phone";

describe("normalizePhone", () => {
  it.each([
    ["0821234567", "+27821234567"],
    ["082 123 4567", "+27821234567"],
    ["(082) 123-4567", "+27821234567"],
    ["082.123.4567", "+27821234567"],
    ["+27821234567", "+27821234567"],
    ["+27 82 123 4567", "+27821234567"],
    ["+27 (0)82 123 4567", "+27821234567"],
    ["27821234567", "+27821234567"],
    ["0027821234567", "+27821234567"],
    ["  072 000 1111  ", "+27720001111"],
    ["021 555 1234", "+27215551234"], // Cape Town landline
    ["011 555 1234", "+27115551234"], // Johannesburg landline
  ])("normalises South African %s", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each([
    ["+44 20 7946 0958", "+442079460958"],
    ["0044 20 7946 0958", "+442079460958"],
    ["+264 81 123 4567", "+264811234567"],
  ])("keeps international %s", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each([
    "",
    "abc",
    "082 123 456", // too short
    "082 123 45678", // too long
    "0921234567", // SA numbers don't start with 09
    "8212345678", // no leading 0 or country code
    "+27 082 123 4567", // trunk 0 after country code without brackets
    "082-123-4567 ext 2",
    "+0 123 456 789",
  ])("rejects %j", (input) => {
    expect(normalizePhone(input)).toBeNull();
  });
});
