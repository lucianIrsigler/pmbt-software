import { describe, expect, it } from "vitest";
import { bookingIcs, mailFromAddress, organizerEmail } from "./booking-ics";

const booking = {
  appointmentId: "8f6c2c1e-1d2b-4c1a-9a51-0d6c1f3b2a10",
  start: new Date("2030-03-04T08:00:00Z"),
  end: new Date("2030-03-04T08:30:00Z"),
  serviceName: "PBMT session",
  businessName: "Healing Paws",
  address: "12 Main Road",
  organizerEmail: "hello@example.com",
  manageUrl: "https://example.com/booking/abc",
  appUrl: "https://example.com",
  cancelled: false,
  now: new Date("2030-03-01T10:00:00Z"),
};

describe("bookingIcs", () => {
  it("names the business as organizer, at sequence 0", () => {
    const lines = bookingIcs(booking).split("\r\n");
    expect(lines).toContain('ORGANIZER;CN="Healing Paws":mailto:hello@example.com');
    expect(lines).toContain("SEQUENCE:0");
    expect(lines).toContain("METHOD:PUBLISH");
  });

  it("cancels with the same UID and organizer and a higher sequence", () => {
    const confirm = bookingIcs(booking).split("\r\n");
    const cancel = bookingIcs({ ...booking, cancelled: true }).split("\r\n");
    const uid = (lines: string[]): string | undefined => lines.find((l) => l.startsWith("UID:"));
    expect(uid(cancel)).toBe(uid(confirm));
    expect(cancel).toContain('ORGANIZER;CN="Healing Paws":mailto:hello@example.com');
    expect(cancel).toContain("SEQUENCE:1");
    expect(cancel).toContain("METHOD:CANCEL");
    expect(cancel).toContain("STATUS:CANCELLED");
  });

  it("leaves the organizer out without an email, and strips quotes from the name", () => {
    expect(bookingIcs({ ...booking, organizerEmail: null })).not.toContain("ORGANIZER");
    expect(bookingIcs({ ...booking, businessName: 'Paws "&" Co' })).toContain(
      'ORGANIZER;CN="Paws & Co":mailto:hello@example.com',
    );
  });
});

describe("organizerEmail", () => {
  it("prefers the business contact email", () => {
    expect(organizerEmail("hello@example.com", "Bookings <bookings@example.com>")).toBe(
      "hello@example.com",
    );
  });

  it("falls back to the MAIL_FROM address", () => {
    expect(organizerEmail(null, "Bookings <bookings@example.com>")).toBe("bookings@example.com");
    expect(organizerEmail(" ", "bookings@example.com")).toBe("bookings@example.com");
  });

  it("is null when there is neither", () => {
    expect(organizerEmail(null, undefined)).toBeNull();
  });
});

describe("mailFromAddress", () => {
  it("reads plain and named addresses, rejecting anything else", () => {
    expect(mailFromAddress("a@example.com")).toBe("a@example.com");
    expect(mailFromAddress('"Healing Paws" <a@example.com>')).toBe("a@example.com");
    expect(mailFromAddress("not an address")).toBeNull();
    expect(mailFromAddress(undefined)).toBeNull();
  });
});
