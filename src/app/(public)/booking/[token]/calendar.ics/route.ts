import { getBookingByToken } from "@/domain/booking";
import { getPublicSettings } from "@/domain/catalogue";
import { bookingIcs } from "@/lib/booking-ics";
import { getEnv } from "@/lib/env";
import { requestContext } from "@/lib/request";

/** `.ics` download for "Add to calendar". */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await params;
  const ctx = await requestContext();
  const booking = await getBookingByToken(ctx.db, token, { now: ctx.now });
  if (!booking) return new Response("Not found", { status: 404 });

  const settings = await getPublicSettings(ctx.db);
  const appUrl = getEnv().APP_URL;
  const body = bookingIcs({
    appointmentId: booking.appointmentId,
    start: booking.start,
    end: booking.end,
    serviceName: booking.serviceName,
    businessName: settings.businessName,
    address: settings.address,
    manageUrl: new URL(`/booking/${token}`, appUrl).toString(),
    appUrl,
    cancelled: booking.status === "cancelled",
    now: ctx.now,
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="booking.ics"',
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
