import "server-only";
import { getDb, type Database } from "@/db";
import { getAppointmentEmailData } from "@/domain/notifications";
import { bookingIcs } from "./booking-ics";
import { sendEmail, type EmailAttachment } from "./email";
import {
  cancellationEmail,
  confirmationEmail,
  reminderEmail,
  type EmailBooking,
} from "./email-templates";
import { getEnv } from "./env";
import { logError, logInfo } from "./log";

export type BookingEmailKind = "confirmation" | "cancellation" | "reminder";
export type SendOutcome = "sent" | "skipped" | "failed";

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

    const env = getEnv();
    const manageUrl = new URL(`/booking/${data.manageToken}`, env.APP_URL).toString();
    const booking: EmailBooking = { ...data, manageUrl, tz: env.BUSINESS_TZ };
    const rendered =
      kind === "confirmation"
        ? confirmationEmail(booking)
        : kind === "cancellation"
          ? cancellationEmail(booking, new URL("/book", env.APP_URL).toString())
          : reminderEmail(booking);

    const attachments: EmailAttachment[] =
      kind === "reminder"
        ? []
        : [
            {
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
                appUrl: env.APP_URL,
                cancelled: kind === "cancellation",
                now,
              }),
            },
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
