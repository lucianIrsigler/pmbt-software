import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { buttonDanger, buttonSecondary, card, Notice, PageTitle } from "@/components/ui";
import { getBookingByToken, type BookingView } from "@/domain/booking";
import { getPublicSettings } from "@/domain/catalogue";
import { getEnv } from "@/lib/env";
import { formatDateTime, formatTime } from "@/lib/format";
import { requestContext } from "@/lib/request";
import { cancelBookingAction } from "./actions";

export const metadata: Metadata = {
  title: "Your booking",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

type Params = Promise<{ token: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const STATUS_NOTICE: Record<BookingView["status"], ReactNode> = {
  booked: null,
  cancelled: <Notice tone="warn">This booking has been cancelled.</Notice>,
  done: <Notice>This session has taken place. Thank you for visiting!</Notice>,
  no_show: <Notice tone="warn">This session was missed.</Notice>,
};

function CancelSection({
  booking,
  token,
  confirming,
  phone,
  tz,
}: {
  booking: BookingView;
  token: string;
  confirming: boolean;
  phone: string | null;
  tz: string;
}): ReactNode {
  if (booking.status !== "booked") return null;

  if (!booking.canCancel) {
    return (
      <p className="text-lg">
        It&apos;s too late to cancel online.{" "}
        {phone ? (
          <>
            To cancel or change this booking, please phone us on{" "}
            <a className="font-semibold underline" href={`tel:${phone.replace(/\s/g, "")}`}>
              {phone}
            </a>
            .
          </>
        ) : (
          "To cancel or change this booking, please phone us."
        )}
      </p>
    );
  }

  if (confirming) {
    return (
      <div className={`${card} flex flex-col gap-4 border-2 border-danger`}>
        <p className="text-xl font-bold">Are you sure you want to cancel this booking?</p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <form action={cancelBookingAction.bind(null, token)}>
            <button type="submit" className={buttonDanger}>
              Yes, cancel it
            </button>
          </form>
          <Link href={`/booking/${token}`} className={buttonSecondary}>
            No, keep it
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Link href={`/booking/${token}?confirm=cancel`} className={buttonSecondary}>
        Cancel booking
      </Link>
      <p className="text-ink-soft">
        You can cancel online until {formatDateTime(booking.cancelDeadline, tz)}.
      </p>
    </div>
  );
}

export default async function BookingPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}): Promise<ReactNode> {
  const [{ token }, query] = await Promise.all([params, searchParams]);
  const ctx = await requestContext();
  const booking = await getBookingByToken(ctx.db, token, { now: ctx.now });
  if (!booking) notFound();

  const settings = await getPublicSettings(ctx.db);
  const manageUrl = `${getEnv().APP_URL.replace(/\/$/, "")}/booking/${token}`;
  const isNew = query.new === "1" && booking.status === "booked";

  return (
    <div className="flex flex-col gap-6">
      <PageTitle>{isNew ? "You're booked!" : "Your booking"}</PageTitle>

      {query.cancelled === "1" && booking.status === "cancelled" && (
        <Notice tone="success">
          Your booking has been cancelled. We hope to see you another time.
        </Notice>
      )}
      {query.error === "too-late" && (
        <Notice tone="error">
          Sorry, it&apos;s now too late to cancel online. Please phone us.
        </Notice>
      )}
      {query.error === "failed" && (
        <Notice tone="error">Something went wrong. Please try again, or phone us.</Notice>
      )}
      {!query.cancelled && STATUS_NOTICE[booking.status]}

      <dl className={`${card} grid gap-x-6 gap-y-3 text-lg sm:grid-cols-[auto_1fr]`}>
        <dt className="font-semibold text-ink-soft">Service</dt>
        <dd className="font-bold">{booking.serviceName}</dd>
        <dt className="font-semibold text-ink-soft">When</dt>
        <dd>
          {formatDateTime(booking.start, ctx.tz)} to {formatTime(booking.end, ctx.tz)}
        </dd>
        <dt className="font-semibold text-ink-soft">For</dt>
        <dd>{booking.petName ?? booking.clientName}</dd>
        {settings.address && (
          <>
            <dt className="font-semibold text-ink-soft">Where</dt>
            <dd className="whitespace-pre-line">{settings.address}</dd>
          </>
        )}
        <dt className="font-semibold text-ink-soft">Payment</dt>
        <dd>In person at your session</dd>
      </dl>

      {booking.status === "booked" && (
        <a
          href={`/booking/${token}/calendar.ics`}
          download="booking.ics"
          className={buttonSecondary}
        >
          Add to calendar
        </a>
      )}

      {isNew && (
        <Notice>
          <p className="font-semibold">Keep this link to see, change or cancel your booking:</p>
          <p className="mt-1 break-all">
            <a href={manageUrl} className="underline">
              {manageUrl}
            </a>
          </p>
        </Notice>
      )}

      <CancelSection
        booking={booking}
        token={token}
        confirming={query.confirm === "cancel"}
        phone={settings.contactPhone}
        tz={ctx.tz}
      />
    </div>
  );
}
