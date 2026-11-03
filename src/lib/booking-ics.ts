import { buildIcs } from "./ics";

/** The `.ics` for a booking: used by the "Add to calendar" download and email attachments. */
export function bookingIcs(input: {
  appointmentId: string;
  start: Date;
  end: Date;
  serviceName: string;
  businessName: string;
  address: string | null;
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
  });
}
