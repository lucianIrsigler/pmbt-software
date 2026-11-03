import Link from "next/link";
import type { ReactNode } from "react";
import { appointmentUrl } from "@/app/app/appointment/urls";
import type { DayAppointment } from "@/domain/appointments";
import { nowOffset, type DayColumn, type GridWindow } from "@/domain/calendar";
import type { TimeOffBlock } from "@/domain/time-off";
import { formatDayMonth, formatLocalDate, formatTime, formatWeekdayShort } from "@/lib/format";

/**
 * The owner's calendar grid, built in-house: one column per day, a time gutter on the
 * left, and blocks placed by minute. Used for both the one-day (phone) and week views.
 */

export type CalendarColumn = DayColumn<DayAppointment, TimeOffBlock>;

/** 2px per minute: a 30-minute cell is 60px tall, comfortably above the 48px minimum. */
const PX_PER_MIN = 2;

function px(minutes: number): string {
  return `${minutes * PX_PER_MIN}px`;
}

function hourMarks(window: GridWindow): number[] {
  const marks: number[] = [];
  for (let m = Math.ceil(window.from / 60) * 60; m < window.to; m += 60) marks.push(m);
  return marks;
}

function hourLabel(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:00`;
}

/** Starts a booking at `start`; with `clientId`, for that client (skips choosing one). */
export function newBookingUrl(start: Date, clientId?: string): string {
  const search = new URLSearchParams({ start: start.toISOString() });
  if (clientId) search.set("client", clientId);
  return `/app/calendar/new?${search.toString()}`;
}

/** Full width, or the left part when a "didn't come" visit sits in the right third. */
function lane(narrow: boolean): string {
  return narrow ? "left-1 right-1/3 mr-1" : "inset-x-1";
}

function AppointmentBlock({
  a,
  date,
  top,
  height,
  narrow,
  tz,
}: {
  a: DayAppointment;
  date: string;
  top: number;
  height: number;
  narrow: boolean;
  tz: string;
}): ReactNode {
  const done = a.status === "done";
  const pet = a.petName ? ` · ${a.petName}` : "";
  return (
    <Link
      href={appointmentUrl(a.id, { calendar: date })}
      style={{ top: px(top), height: px(height) }}
      className={`absolute ${lane(narrow)} z-20 flex flex-col overflow-hidden rounded-lg border-2 px-2 py-1 leading-tight ${
        done
          ? "border-accent bg-accent-soft text-ink"
          : "border-accent-strong bg-accent text-white hover:bg-accent-strong"
      }`}
    >
      <span className="font-bold">
        {formatTime(a.start, tz)}
        {done && " · Done"}
      </span>
      <span className="truncate font-semibold">
        {a.clientName}
        {pet}
      </span>
    </Link>
  );
}

/** A "didn't come" visit: its time is free again, so it is drawn faded in the right third. */
function NoShowBlock({
  a,
  date,
  top,
  height,
  tz,
}: {
  a: DayAppointment;
  date: string;
  top: number;
  height: number;
  tz: string;
}): ReactNode {
  return (
    <Link
      href={appointmentUrl(a.id, { calendar: date })}
      style={{ top: px(top), height: px(height) }}
      className="absolute left-2/3 right-1 z-20 flex flex-col overflow-hidden rounded-lg border-2 border-dashed border-warn-ink bg-warn-soft px-1 py-1 leading-tight text-warn-ink hover:bg-card"
    >
      <span className="truncate font-bold">Didn&apos;t come</span>
      <span className="truncate">
        {formatTime(a.start, tz)} {a.clientName}
      </span>
    </Link>
  );
}

function AwayBlock({ block, top, height }: { block: TimeOffBlock; top: number; height: number }) {
  return (
    <div
      style={{ top: px(top), height: px(height) }}
      className="absolute inset-x-0 z-10 overflow-hidden border-y-2 border-ink-soft bg-away px-2 py-1 leading-tight"
    >
      <span className="font-bold">Away</span>
      {block.reason && <span className="block truncate">{block.reason}</span>}
    </div>
  );
}

/** A line across today's column at the current time. `ScrollToNow` looks for it. */
function NowLine({ top }: { top: number }): ReactNode {
  return (
    <div
      data-now-line=""
      style={{ top: px(top) }}
      className="pointer-events-none absolute inset-x-0 z-30 border-t-2 border-danger"
    >
      <span className="absolute -top-3 left-0 rounded bg-danger px-1 text-sm font-bold text-white">
        Now
      </span>
    </div>
  );
}

function FreeCell({
  start,
  top,
  height,
  narrow,
  date,
  tz,
  compact,
  bookFor,
}: {
  start: Date;
  top: number;
  height: number;
  narrow: boolean;
  date: string;
  tz: string;
  compact: boolean;
  bookFor: string | undefined;
}): ReactNode {
  const time = formatTime(start, tz);
  // The week view stays calm: empty times are plain until hovered or focused.
  const look = compact
    ? "border-transparent text-transparent hover:border-accent hover:bg-accent-soft hover:text-accent focus-visible:border-accent focus-visible:bg-accent-soft focus-visible:text-accent"
    : "border-dashed border-line bg-card text-accent hover:border-accent hover:bg-accent-soft";
  return (
    <Link
      href={newBookingUrl(start, bookFor)}
      style={{ top: px(top), height: px(height) }}
      className={`absolute ${lane(narrow)} flex items-center gap-2 rounded-lg border-2 px-2 font-semibold ${look}`}
    >
      {compact ? (
        <>
          <span aria-hidden="true">Book</span>{" "}
          <span className="sr-only">
            Free at {time}, book {formatLocalDate(date)}
          </span>
        </>
      ) : (
        <>
          <span className="text-ink">{time}</span> <span>Free – tap to book</span>{" "}
          <span className="sr-only">{formatLocalDate(date)}</span>
        </>
      )}
    </Link>
  );
}

export function WeekGrid({
  columns,
  window,
  tz,
  today,
  now,
  bookFor,
  compact = false,
}: {
  columns: CalendarColumn[];
  window: GridWindow;
  tz: string;
  /** Today's date in the business time zone, highlighted in headers. */
  today: string;
  /** Where the "Now" line goes on today's column. */
  now: Date;
  /** A client id: free times then book for this client. */
  bookFor?: string | undefined;
  /** Week view: day headers and shorter labels. */
  compact?: boolean;
}): ReactNode {
  const height = px(window.to - window.from);
  const marks = hourMarks(window);

  return (
    <div className="flex flex-col">
      {compact && (
        <div className="flex border-b-2 border-line pb-1 pl-14">
          {columns.map((col) => (
            <div
              key={col.date}
              className={`flex-1 text-center font-bold ${col.date === today ? "text-accent" : ""}`}
            >
              {formatWeekdayShort(col.date)}
              <span className="block font-semibold">{formatDayMonth(col.date)}</span>
            </div>
          ))}
        </div>
      )}
      <div className="flex">
        <div className="relative w-14 shrink-0" style={{ height }} aria-hidden="true">
          {marks.map((m) => (
            <span
              key={m}
              className="absolute right-2 -translate-y-1/2 font-semibold text-ink-soft first:translate-y-0"
              style={{ top: px(m - window.from) }}
            >
              {hourLabel(m)}
            </span>
          ))}
        </div>
        {columns.map((col) => {
          const nowTop = nowOffset(col.date, window, now, tz);
          return (
            <section
              key={col.date}
              aria-label={formatLocalDate(col.date)}
              className={`relative flex-1 border-l-2 border-line ${col.open ? "bg-page" : "bg-away/50"}`}
              style={{ height }}
            >
              {marks.map((m) => (
                <div
                  key={m}
                  aria-hidden="true"
                  className="absolute inset-x-0 border-t border-line"
                  style={{ top: px(m - window.from) }}
                />
              ))}
              {col.free.map((cell) => (
                <FreeCell
                  key={cell.start.toISOString()}
                  {...cell}
                  date={col.date}
                  tz={tz}
                  compact={compact}
                  bookFor={bookFor}
                />
              ))}
              {col.away.map(({ item, top, height: h }) => (
                <AwayBlock key={item.id} block={item} top={top} height={h} />
              ))}
              {col.appointments.map(({ item, top, height: h, narrow }) => (
                <AppointmentBlock
                  key={item.id}
                  a={item}
                  date={col.date}
                  top={top}
                  height={h}
                  narrow={narrow}
                  tz={tz}
                />
              ))}
              {col.noShows.map(({ item, top, height: h }) => (
                <NoShowBlock key={item.id} a={item} date={col.date} top={top} height={h} tz={tz} />
              ))}
              {nowTop !== null && <NowLine top={nowTop} />}
            </section>
          );
        })}
      </div>
    </div>
  );
}
