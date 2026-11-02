import { describe, expect, it } from "vitest";
import { buildIcs, escapeText, foldLine, icsDateTime } from "./ics";

const event = {
  uid: "a1b2@example.com",
  start: new Date("2026-11-03T07:30:00Z"),
  end: new Date("2026-11-03T08:00:00Z"),
  summary: "PBMT session (30 min)",
  location: "12 Main Road, Cape Town",
  url: "https://example.com/booking/abc",
  stamp: new Date("2026-11-01T10:00:00Z"),
};

describe("buildIcs", () => {
  const ics = buildIcs(event);

  it("produces a VCALENDAR with one VEVENT, CRLF line endings", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics.endsWith("END:VEVENT\r\nEND:VCALENDAR\r\n")).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/\n/);
  });

  it("includes UID, DTSTAMP and UTC DTSTART/DTEND", () => {
    const lines = ics.split("\r\n");
    expect(lines).toContain("UID:a1b2@example.com");
    expect(lines).toContain("DTSTAMP:20261101T100000Z");
    expect(lines).toContain("DTSTART:20261103T073000Z");
    expect(lines).toContain("DTEND:20261103T080000Z");
  });

  it("escapes SUMMARY and LOCATION", () => {
    const lines = ics.split("\r\n");
    expect(lines).toContain("SUMMARY:PBMT session (30 min)");
    expect(lines).toContain("LOCATION:12 Main Road\\, Cape Town");
    expect(lines).toContain("STATUS:CONFIRMED");
  });

  it("omits optional fields that aren't given", () => {
    const minimal = buildIcs({ ...event, location: undefined, url: undefined });
    expect(minimal).not.toContain("LOCATION:");
    expect(minimal).not.toContain("URL:");
  });

  it("can mark an event cancelled", () => {
    const cancelled = buildIcs({ ...event, status: "CANCELLED" });
    expect(cancelled).toContain("METHOD:CANCEL");
    expect(cancelled).toContain("STATUS:CANCELLED");
  });
});

describe("helpers", () => {
  it("formats UTC date-times", () => {
    expect(icsDateTime(new Date("2026-01-02T03:04:05.678Z"))).toBe("20260102T030405Z");
  });

  it("escapes special characters", () => {
    expect(escapeText("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
  });

  it("folds long lines at 75 octets, counting multi-byte characters", () => {
    const folded = foldLine(`DESCRIPTION:${"é".repeat(60)}`);
    const parts = folded.split("\r\n");
    expect(parts.length).toBeGreaterThan(1);
    const encoder = new TextEncoder();
    for (const part of parts) expect(encoder.encode(part).length).toBeLessThanOrEqual(75);
    expect(parts.slice(1).every((p) => p.startsWith(" "))).toBe(true);
    expect(parts.map((p, i) => (i === 0 ? p : p.slice(1))).join("")).toBe(
      `DESCRIPTION:${"é".repeat(60)}`,
    );
  });

  it("leaves short lines alone", () => {
    expect(foldLine("SUMMARY:Hi")).toBe("SUMMARY:Hi");
  });
});
