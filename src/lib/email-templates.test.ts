import { describe, expect, it } from "vitest";
import {
  cancellationEmail,
  confirmationEmail,
  escapeHtml,
  reminderEmail,
  type EmailBooking,
} from "./email-templates";

const TZ = "Africa/Johannesburg";

function booking(overrides: Partial<EmailBooking> = {}): EmailBooking {
  return {
    clientName: "Thandi Mokoena",
    serviceName: "Dog PBMT session",
    petName: "Rex",
    start: new Date("2026-11-10T07:00:00Z"), // 09:00 local
    end: new Date("2026-11-10T07:30:00Z"),
    priceCents: 45000,
    manageUrl: "https://example.co.za/booking/abc",
    cancelDeadline: new Date("2026-11-09T07:00:00Z"),
    business: {
      name: "Healing Paws",
      phone: "082 123 4567",
      email: "hello@example.co.za",
      address: "12 Oak Street, Pretoria",
    },
    tz: TZ,
    ...overrides,
  };
}

describe("confirmationEmail", () => {
  const email = confirmationEmail(booking());

  it("says when, what, where and how much", () => {
    expect(email.subject).toBe("Your booking on Tuesday 10 November at 09:00");
    expect(email.text).toContain("Hi Thandi,");
    expect(email.text).toContain("When: Tuesday 10 November 2026 at 09:00 (until 09:30)");
    expect(email.text).toContain("What: Dog PBMT session for Rex");
    expect(email.text).toContain("Price: R450, paid at your session");
    expect(email.text).toContain("Where: 12 Oak Street, Pretoria");
  });

  it("links to the booking and explains the cancellation rule", () => {
    expect(email.text).toContain("https://example.co.za/booking/abc");
    expect(email.text).toContain(
      "You can cancel online until Monday 9 November 2026 at 09:00. After that, please phone us on 082 123 4567.",
    );
    expect(email.html).toContain('href="https://example.co.za/booking/abc"');
  });

  it("leaves out what isn't known", () => {
    const plain = confirmationEmail(
      booking({
        petName: null,
        business: { name: "Healing Paws", phone: null, email: null, address: null },
      }),
    );
    expect(plain.text).toContain("What: Dog PBMT session\n");
    expect(plain.text).not.toContain("Where:");
    expect(plain.text).toContain("After that, please contact us.");
  });

  it("is a full HTML document with the same content", () => {
    expect(email.html.startsWith("<!doctype html>")).toBe(true);
    expect(email.html).toContain("Tuesday 10 November 2026 at 09:00 (until 09:30)");
    expect(email.html).toContain("Dog PBMT session for Rex");
  });
});

describe("cancellationEmail", () => {
  it("says what was cancelled and how to book again", () => {
    const email = cancellationEmail(booking(), "https://example.co.za/book");
    expect(email.subject).toBe("Your booking on Tuesday 10 November is cancelled");
    expect(email.text).toContain(
      "Your booking for Dog PBMT session for Rex on Tuesday 10 November 2026 at 09:00 has been cancelled.",
    );
    expect(email.text).toContain("Book another time:\nhttps://example.co.za/book");
    expect(email.text).toContain("If you have any questions, please phone us on 082 123 4567.");
  });
});

describe("reminderEmail", () => {
  it("reminds them of tomorrow and asks them to phone if they can't come", () => {
    const email = reminderEmail(booking());
    expect(email.subject).toBe("See you tomorrow at 09:00");
    expect(email.text).toContain("When: Tomorrow, Tuesday 10 November 2026 at 09:00");
    expect(email.text).toContain("If you can't make it, please phone us on 082 123 4567.");
    expect(email.text).toContain("https://example.co.za/booking/abc");
  });
});

describe("escaping", () => {
  it("escapes HTML in names and links", () => {
    expect(escapeHtml(`<b>"Tom" & 'Jerry'</b>`)).toBe(
      "&lt;b&gt;&quot;Tom&quot; &amp; &#39;Jerry&#39;&lt;/b&gt;",
    );
    const email = confirmationEmail(booking({ clientName: "<script>x</script>", petName: "R&B" }));
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;x&lt;/script&gt;");
    expect(email.html).toContain("R&amp;B");
    // Plain text is not escaped.
    expect(email.text).toContain("for R&B");
  });
});
