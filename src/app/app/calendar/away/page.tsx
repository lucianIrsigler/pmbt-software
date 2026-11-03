import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ConfirmButton } from "@/components/owner/confirm-button";
import { Notice } from "@/components/ui";
import { listOverlapping } from "@/domain/appointments";
import { localDateSchema } from "@/domain/schemas";
import { getTimeOff, listUpcomingTimeOff, type TimeOffBlock } from "@/domain/time-off";
import { localDateOf } from "@/domain/time";
import { formatDayLong, formatTime, formatTimeOffRange } from "@/lib/format";
import { requestContext, type RequestContext } from "@/lib/request";
import type { SearchParams } from "@/lib/search-params";
import { calendarUrl } from "../urls";
import { removeTimeOffAction } from "./actions";
import { AwayForm } from "./away-form";

export const metadata: Metadata = { title: "Block time" };

/** Confirms a new block, and lists bookings inside it: they are kept, so she can call them. */
async function Added({
  ctx,
  block,
}: {
  ctx: RequestContext;
  block: TimeOffBlock;
}): Promise<ReactNode> {
  const clashes = await listOverlapping(ctx.db, block.during, ["booked"]);
  return (
    <div className="flex flex-col gap-3">
      <Notice tone="success">
        <p className="text-xl font-bold">Blocked ✓</p>
        <p className="text-lg">{formatTimeOffRange(block.during, ctx.tz)}</p>
      </Notice>
      {clashes.length > 0 && (
        <Notice tone="warn">
          <p className="text-xl font-bold">
            {clashes.length === 1
              ? "You have 1 booking in this time."
              : `You have ${clashes.length} bookings in this time.`}
          </p>
          <p className="text-lg">They are not cancelled. Please call them.</p>
          <ul className="mt-3 flex flex-col gap-2">
            {clashes.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/app/appointment/${a.id}`}
                  className="text-lg font-semibold text-ink underline"
                >
                  {formatDayLong(a.start, ctx.tz)} {formatTime(a.start, ctx.tz)} · {a.clientName}
                  {a.petName && ` · ${a.petName}`}
                </Link>
              </li>
            ))}
          </ul>
        </Notice>
      )}
    </div>
  );
}

export default async function AwayPage({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<ReactNode> {
  const ctx = await requestContext();
  const params = await searchParams;
  const today = localDateOf(ctx.now, ctx.tz);
  const requested = localDateSchema.safeParse(params.date);
  const date = requested.success && requested.data >= today ? requested.data : today;

  const added = typeof params.added === "string" ? await getTimeOff(ctx.db, params.added) : null;
  const upcoming = await listUpcomingTimeOff(ctx.db, ctx.now);
  const back = calendarUrl(added ? localDateOf(added.during.start, ctx.tz) : date);

  return (
    <div className="flex flex-col gap-6">
      <Link href={back} className="self-start py-2 text-lg font-semibold text-accent underline">
        ← Calendar
      </Link>
      <h1 className="text-3xl font-bold">Block time</h1>
      <p className="text-xl">Clients can&apos;t book a time you have blocked.</p>

      {added && <Added ctx={ctx} block={added} />}

      <AwayForm key={added?.id ?? "new"} date={date} />

      <section aria-labelledby="upcoming-heading" className="flex flex-col gap-3">
        <h2 id="upcoming-heading" className="text-2xl font-bold">
          Blocked times coming up
        </h2>
        {upcoming.length === 0 ? (
          <p className="text-xl">None.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {upcoming.map((block) => (
              <li
                key={block.id}
                className="flex flex-col gap-3 rounded-2xl border-2 border-line bg-card p-4"
              >
                <div>
                  <p className="text-xl font-bold">{formatTimeOffRange(block.during, ctx.tz)}</p>
                  {block.reason && <p className="text-lg">{block.reason}</p>}
                </div>
                <ConfirmButton
                  label="Remove"
                  variant="small"
                  question="Remove this block? Clients will be able to book this time again."
                  yesLabel="Yes, remove"
                  yesVariant="danger"
                  action={removeTimeOffAction.bind(null, block.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
