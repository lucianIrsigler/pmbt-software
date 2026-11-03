import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { RefreshOnReturn } from "@/components/owner/refresh-on-return";
import { ScrollToNow } from "@/components/owner/scroll-to-now";
import { ownerButton, ownerInput } from "@/components/owner/styles";
import { WeekGrid } from "@/components/owner/week-grid";
import { Notice } from "@/components/ui";
import { layoutDays, loadCalendarWeek, type CalendarWeek } from "@/domain/calendar-data";
import { getClientWithPets } from "@/domain/clients";
import { SlotTakenError, SlotUnavailableError } from "@/domain/errors";
import { localDateSchema } from "@/domain/schemas";
import { addLocalDays, localDateOf, type LocalDate } from "@/domain/time";
import { formatDayMonth, formatLocalDate, formatWeekdayShort } from "@/lib/format";
import { requestContext } from "@/lib/request";
import { stringParam, type SearchParams } from "@/lib/search-params";
import { calendarUrl } from "./urls";

export const metadata: Metadata = { title: "Calendar" };

const ERRORS: Record<string, string> = {
  taken: new SlotTakenError().message,
  unavailable: new SlotUnavailableError().message,
};

const navButton = `${ownerButton.secondary} whitespace-nowrap px-2 text-lg`;

/** What every view needs: the week, the day shown, and who free times book for. */
interface ViewProps {
  week: CalendarWeek;
  date: LocalDate;
  today: LocalDate;
  now: Date;
  tz: string;
  /** A client id when booking for someone from their page. */
  bookFor: string | undefined;
}

function NavButtons({
  prev,
  next,
  prevLabel,
  nextLabel,
}: {
  prev: string;
  next: string;
  prevLabel: string;
  nextLabel: string;
}): ReactNode {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Link href={prev} className={navButton}>
        ← {prevLabel}
      </Link>
      <Link href={next} className={navButton}>
        {nextLabel} →
      </Link>
    </div>
  );
}

function Closed(): ReactNode {
  return (
    <p className="rounded-2xl border-2 border-line bg-card p-6 text-xl">Closed. No bookings.</p>
  );
}

/** Jump to any day with the phone's own date picker; a plain form, no JS needed. */
function GoToDate({ date, bookFor }: { date: LocalDate; bookFor: string | undefined }): ReactNode {
  return (
    <form action="/app/calendar" className="flex flex-col gap-2">
      <label htmlFor="go-to-date" className="text-xl font-semibold">
        Go to date
      </label>
      <div className="flex gap-3">
        <input
          id="go-to-date"
          name="date"
          type="date"
          required
          defaultValue={date}
          className={ownerInput}
        />
        {bookFor && <input type="hidden" name="client" value={bookFor} />}
        <button type="submit" className={`${ownerButton.secondary} w-auto shrink-0`}>
          Go
        </button>
      </div>
    </form>
  );
}

/** Phones: one day at a time, with a strip to jump to any day of the week. */
function DayView({ week, date, today, now, tz, bookFor }: ViewProps): ReactNode {
  const layout = layoutDays(week, [date], now, tz);
  const url = (d: LocalDate): string => calendarUrl(d, { client: bookFor });
  return (
    <div className="flex flex-col gap-4">
      <NavButtons
        prev={url(addLocalDays(date, -1))}
        next={url(addLocalDays(date, 1))}
        prevLabel="Previous day"
        nextLabel="Next day"
      />
      <nav aria-label="Days this week">
        <ul className="grid grid-cols-7 gap-1">
          {week.dates.map((d) => {
            const selected = d === date;
            return (
              <li key={d}>
                <Link
                  href={url(d)}
                  aria-current={selected ? "date" : undefined}
                  aria-label={formatLocalDate(d)}
                  className={`flex min-h-14 flex-col items-center justify-center rounded-lg border-2 font-bold leading-tight ${
                    selected
                      ? "border-accent bg-accent text-white"
                      : d === today
                        ? "border-accent bg-card text-accent"
                        : "border-line bg-card text-ink"
                  }`}
                >
                  <span className="text-base">{formatWeekdayShort(d)}</span>
                  <span>{Number(d.slice(8))}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <h2 className="text-2xl font-bold">
        {formatLocalDate(date)}
        {date === today && <span className="text-accent"> (today)</span>}
      </h2>
      {layout ? (
        <WeekGrid
          columns={layout.columns}
          window={layout.window}
          tz={tz}
          today={today}
          now={now}
          bookFor={bookFor}
        />
      ) : (
        <Closed />
      )}
    </div>
  );
}

/** Wider screens: the whole week side by side. */
function WeekView({ week, date, today, now, tz, bookFor }: ViewProps): ReactNode {
  const layout = layoutDays(week, week.dates, now, tz);
  const first = week.dates[0] ?? date;
  const last = week.dates.at(-1) ?? date;
  return (
    <div className="flex flex-col gap-4">
      <NavButtons
        prev={calendarUrl(addLocalDays(date, -7), { client: bookFor })}
        next={calendarUrl(addLocalDays(date, 7), { client: bookFor })}
        prevLabel="Previous week"
        nextLabel="Next week"
      />
      <h2 className="text-2xl font-bold">
        {formatDayMonth(first)} – {formatDayMonth(last)}
      </h2>
      {layout ? (
        <WeekGrid
          columns={layout.columns}
          window={layout.window}
          tz={tz}
          today={today}
          now={now}
          bookFor={bookFor}
          compact
        />
      ) : (
        <Closed />
      )}
    </div>
  );
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<ReactNode> {
  const { db, tz, now } = await requestContext();
  const params = await searchParams;
  const today = localDateOf(now, tz);
  const parsed = localDateSchema.safeParse(params.date);
  const date = parsed.success ? parsed.data : today;
  const [week, client] = await Promise.all([
    loadCalendarWeek(db, date, tz),
    getClientWithPets(db, stringParam(params.client) ?? ""),
  ]);
  const bookingFor = client && !client.archived ? client : null;
  const bookFor = bookingFor?.id;
  const error = typeof params.error === "string" ? ERRORS[params.error] : undefined;
  const view: ViewProps = { week, date, today, now, tz, bookFor };

  return (
    <div className="flex flex-col gap-5">
      <RefreshOnReturn />
      <ScrollToNow />
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">Calendar</h1>
        {date !== today && (
          <Link
            href={calendarUrl(today, { client: bookFor })}
            className="py-2 text-lg text-accent underline"
          >
            Back to today
          </Link>
        )}
      </div>

      {params.booked === "1" && (
        <Notice tone="success">
          <p className="text-xl font-bold">Booked ✓</p>
        </Notice>
      )}
      {error && (
        <Notice tone="error">
          <p className="text-xl font-bold">{error}</p>
        </Notice>
      )}

      {bookingFor ? (
        <Notice tone="info">
          <p className="mb-3 text-xl font-bold">Booking for {bookingFor.name}. Tap a free time.</p>
          <Link href={calendarUrl(date)} className={ownerButton.secondary}>
            Stop
          </Link>
        </Notice>
      ) : (
        <Link href={`/app/calendar/away?date=${date}`} className={ownerButton.secondary}>
          Block time
        </Link>
      )}

      <GoToDate date={date} bookFor={bookFor} />

      <div className="md:hidden">
        <DayView {...view} />
      </div>
      {/* Breaks out of the narrow app column so seven days have room. */}
      <div className="relative left-1/2 hidden w-[min(72rem,calc(100vw-2rem))] -translate-x-1/2 md:block">
        <WeekView {...view} />
      </div>
    </div>
  );
}
