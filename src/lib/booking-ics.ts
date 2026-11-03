import { buildIcs } from "./ics";

/** The address in `MAIL_FROM`, which may be `Name <address>` or just the address. */
export function mailFromAddress(mailFrom: string | undefined): string | null {
  if (!mailFrom) return null;
  const address = (/<([^<>]+)>/.exec(mailFrom)?.[1] ?? mailFrom).trim();
  return /^[^\s@<>"]+@[^\s@<>"]+$/.test(address) ? address : null;
}

/** The event organizer: the business contact email, else the address emails come from. */
export function organizerEmail(
  contactEmail: string | null,
  mailFrom: string | undefined,
): string | null {
  return contactEmail?.trim() || mailFromAddress(mailFrom);
}

/** The `.ics` for a booking: used by the "Add to calendar" download and email attachments. */
export function bookingIcs(input: {
  appointmentId: string;
  start: Date;
  end: Date;
  serviceName: string;
  businessName: string;
  address: string | null;
  /** From `organizerEmail`; without one, ORGANIZER is left out. */
  organizerEmail: string | null;
  manageUrl: string;
  appUrl: string;
  cancelled: boolean;
  now: Date;
}): string {
  return buildIcs({
    // Same UID for the confirmation and the cancellation, so calendar apps match them.
    uid: `${input.appointmentId}@${new URL(input.appUrl).host}`,
    start: input.start,
    end: input.end,
    summary: `${input.serviceName} – ${input.businessName}`,
    location: input.address ?? undefined,
    url: input.manageUrl,
    stamp: input.now,
    status: input.cancelled ? "CANCELLED" : "CONFIRMED",
    // A cancellation must have a higher SEQUENCE than the confirmation it replaces.
    sequence: input.cancelled ? 1 : 0,
    organizer: input.organizerEmail
      ? { name: input.businessName, email: input.organizerEmail }
      : undefined,
  });
}
