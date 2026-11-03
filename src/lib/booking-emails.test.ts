import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppointmentEmailData } from "@/domain/notifications";

const mocks = vi.hoisted(() => ({
  data: vi.fn<() => Promise<AppointmentEmailData | null>>(),
  send: vi.fn<(message: unknown) => Promise<void>>(),
  logError: vi.fn(),
  logInfo: vi.fn(),
}));

vi.mock("@/db", () => ({ getDb: () => ({}) }));
vi.mock("@/domain/notifications", () => ({ getAppointmentEmailData: mocks.data }));
vi.mock("./email", () => ({ sendEmail: mocks.send }));
vi.mock("./log", () => ({ logError: mocks.logError, logInfo: mocks.logInfo }));
vi.mock("./env", () => ({
  getEnv: () => ({ APP_URL: "https://bookings.example.co.za", BUSINESS_TZ: "Africa/Johannesburg" }),
}));

const { sendBookingEmail } = await import("./booking-emails");

const ID = "6ecdc84b-100f-4834-a3ae-f25ab2c2cee1";

function data(overrides: Partial<AppointmentEmailData> = {}): AppointmentEmailData {
  return {
    appointmentId: ID,
    status: "booked",
    clientName: "Thandi Mokoena",
    clientEmail: "thandi@example.com",
    serviceName: "PBMT session",
    priceCents: 45000,
    petName: null,
    start: new Date("2026-11-10T07:00:00Z"),
    end: new Date("2026-11-10T07:30:00Z"),
    manageToken: "a".repeat(43),
    cancelDeadline: new Date("2026-11-09T07:00:00Z"),
    business: {
      name: "Healing Paws",
      phone: "082 123 4567",
      email: "hi@example.co.za",
      address: null,
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("sendBookingEmail", () => {
  it("sends a confirmation with the manage link and a calendar file", async () => {
    mocks.data.mockResolvedValue(data());
    mocks.send.mockResolvedValue();

    expect(await sendBookingEmail("confirmation", ID)).toBe("sent");
    const message = mocks.send.mock.calls[0]?.[0] as {
      to: string;
      replyTo: string;
      text: string;
      attachments: { filename: string; content: string }[];
    };
    expect(message.to).toBe("thandi@example.com");
    expect(message.replyTo).toBe("hi@example.co.za");
    expect(message.text).toContain(`https://bookings.example.co.za/booking/${"a".repeat(43)}`);
    expect(message.attachments[0]?.filename).toBe("booking.ics");
    expect(message.attachments[0]?.content).toContain(`UID:${ID}@bookings.example.co.za`);
  });

  it("sends reminders without a calendar file", async () => {
    mocks.data.mockResolvedValue(data());
    mocks.send.mockResolvedValue();
    expect(await sendBookingEmail("reminder", ID)).toBe("sent");
    expect((mocks.send.mock.calls[0]?.[0] as { attachments: unknown[] }).attachments).toEqual([]);
  });

  it("skips clients without an email address", async () => {
    mocks.data.mockResolvedValue(data({ clientEmail: null }));
    expect(await sendBookingEmail("confirmation", ID)).toBe("skipped");
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("never throws when the mail server fails, and logs only the appointment id", async () => {
    mocks.data.mockResolvedValue(data());
    mocks.send.mockRejectedValue(new Error("connect ECONNREFUSED thandi@example.com"));

    await expect(sendBookingEmail("cancellation", ID)).resolves.toBe("failed");
    expect(mocks.logError).toHaveBeenCalledWith("email.cancellation", expect.any(Error), {
      appointmentId: ID,
    });
  });

  it("never throws when loading the booking fails", async () => {
    mocks.data.mockRejectedValue(new Error("database down"));
    await expect(sendBookingEmail("confirmation", ID)).resolves.toBe("failed");
  });
});
