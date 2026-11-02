import { getBookingByToken } from "@/domain/booking";
import { getPublicSettings } from "@/domain/catalogue";
import { getEnv } from "@/lib/env";
import { buildIcs } from "@/lib/ics";
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
  const appUrl = new URL(getEnv().APP_URL);
  const body = buildIcs({
    uid: `${booking.appointmentId}@${appUrl.host}`,
    start: booking.start,
    end: booking.end,
    summary: `${booking.serviceName} – ${settings.businessName}`,
    location: settings.address ?? undefined,
    url: new URL(`/booking/${token}`, appUrl).toString(),
    stamp: ctx.now,
    status: booking.status === "cancelled" ? "CANCELLED" : "CONFIRMED",
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
