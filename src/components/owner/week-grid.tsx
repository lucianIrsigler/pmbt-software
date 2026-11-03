import Link from "next/link";
import type { ReactNode } from "react";
import type { DayAppointment } from "@/domain/appointments";
import type { DayColumn, GridWindow } from "@/domain/calendar";
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

export function newBookingUrl(start: Date): string {
  return `/app/calendar/new?start=${encodeURIComponent(start.toISOString())}`;
}

function AppointmentBlock({
  a,
  top,
  height,
  tz,
}: {
  a: DayAppointment;
  top: number;
  height: number;
  tz: string;
}): ReactNode {
  const done = a.status === "done";
  const pet = a.petName ? ` · ${a.petName}` : "";
  return (
    <Link
      href={`/app/appointment/${a.id}`}
      style={{ top: px(top), height: px(height) }}
      className={`absolute inset-x-1 z-20 flex flex-col overflow-hidden rounded-lg border-2 px-2 py-1 leading-tight ${
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

function FreeCell({
  start,
  top,
  height,
  date,
  tz,
  compact,
}: {
  start: Date;
  top: number;
  height: number;
  date: string;
  tz: string;
  compact: boolean;
}): ReactNode {
  const time = formatTime(start, tz);
  return (
    <Link
      href={newBookingUrl(start)}
      style={{ top: px(top), height: px(height) }}
      className="absolute inset-x-1 flex items-center gap-2 rounded-lg border-2 border-dashed border-line bg-card px-2 font-semibold text-accent hover:border-accent hover:bg-accent-soft"
    >
      {compact ? (
        <>
          <span>Free</span>
          <span className="sr-only">
            {time}, book {formatLocalDate(date)}
          </span>
        </>
      ) : (
        <>
          <span className="text-ink">{time}</span>
          <span>Free – tap to book</span>
          <span className="sr-only">, {formatLocalDate(date)}</span>
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
  compact = false,
}: {
  columns: CalendarColumn[];
  window: GridWindow;
  tz: string;
  /** Today's date in the business time zone, highlighted in headers. */
  today: string;
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
        {columns.map((col) => (
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
              />
            ))}
            {col.away.map(({ item, top, height: h }) => (
              <AwayBlock key={item.id} block={item} top={top} height={h} />
            ))}
            {col.appointments.map(({ item, top, height: h }) => (
              <AppointmentBlock key={item.id} a={item} top={top} height={h} tz={tz} />
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
