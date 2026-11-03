import "server-only";
import { getDb, type Database } from "@/db";
import { getAppointmentEmailData, type AppointmentEmailData } from "@/domain/notifications";
import { bookingIcs } from "./booking-ics";
import { sendEmail, type EmailAttachment } from "./email";
import {
  cancellationEmail,
  confirmationEmail,
  reminderEmail,
  type EmailBooking,
  type RenderedEmail,
} from "./email-templates";
import { getEnv } from "./env";
import { logError, logInfo } from "./log";

export type BookingEmailKind = "confirmation" | "cancellation" | "reminder";
export type SendOutcome = "sent" | "skipped" | "failed";

function renderEmail(kind: BookingEmailKind, booking: EmailBooking, appUrl: string): RenderedEmail {
  switch (kind) {
    case "confirmation":
      return confirmationEmail(booking);
    case "cancellation":
      return cancellationEmail(booking, new URL("/book", appUrl).toString());
    case "reminder":
      return reminderEmail(booking);
  }
}

/** The booking as a calendar file: adds it, or (when cancelled) removes it. */
function calendarAttachment(
  data: AppointmentEmailData,
  {
    manageUrl,
    appUrl,
    cancelled,
    now,
  }: { manageUrl: string; appUrl: string; cancelled: boolean; now: Date },
): EmailAttachment {
  return {
    filename: "booking.ics",
    contentType: "text/calendar; charset=utf-8",
    content: bookingIcs({
      appointmentId: data.appointmentId,
      start: data.start,
      end: data.end,
      serviceName: data.serviceName,
      businessName: data.business.name,
      address: data.business.address,
      manageUrl,
      appUrl,
      cancelled,
      now,
    }),
  };
}

/**
 * Emails the client about one appointment, if they gave an email address.
 * Never throws: failures are logged by appointment id only (POPIA), so callers can
 * fire and forget after their database change has been saved.
 */
export async function sendBookingEmail(
  kind: BookingEmailKind,
  appointmentId: string,
  { db = getDb(), now = new Date() }: { db?: Database; now?: Date } = {},
): Promise<SendOutcome> {
  try {
    const data = await getAppointmentEmailData(db, appointmentId);
    if (!data?.clientEmail) return "skipped";

    const { APP_URL: appUrl, BUSINESS_TZ: tz } = getEnv();
    const manageUrl = new URL(`/booking/${data.manageToken}`, appUrl).toString();
    const rendered = renderEmail(kind, { ...data, manageUrl, tz }, appUrl);
    // Reminders don't need the calendar file: it came with the confirmation.
    const attachments =
      kind === "reminder"
        ? []
        : [
            calendarAttachment(data, {
              manageUrl,
              appUrl,
              cancelled: kind === "cancellation",
              now,
            }),
          ];

    await sendEmail({
      to: data.clientEmail,
      replyTo: data.business.email ?? undefined,
      ...rendered,
      attachments,
    });
    logInfo(`email.${kind}.sent`, { appointmentId });
    return "sent";
  } catch (error) {
    logError(`email.${kind}`, error, { appointmentId });
    return "failed";
  }
}
