import { describe, expect, it } from "vitest";
import { clientIp, ipKey } from "./client-ip";

describe("clientIp", () => {
  it("uses the last X-Forwarded-For entry (added by our proxy)", () => {
    const headers = new Headers({ "x-forwarded-for": "6.6.6.6, 203.0.113.7" });
    expect(clientIp(headers)).toBe("203.0.113.7");
  });

  it("falls back to X-Real-IP, then 'unknown'", () => {
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});

describe("ipKey", () => {
  it("is stable, secret-dependent and doesn't contain the IP", () => {
    const a = ipKey("203.0.113.7", "secret-one");
    expect(ipKey("203.0.113.7", "secret-one")).toBe(a);
    expect(ipKey("203.0.113.7", "secret-two")).not.toBe(a);
    expect(ipKey("203.0.113.8", "secret-one")).not.toBe(a);
    expect(a).not.toContain("203");
  });
});
