import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { card, Notice, PageTitle } from "@/components/ui";
import { findDates, findSlots, loadSettings, type Service } from "@/domain/availability";
import { listActiveServices } from "@/domain/catalogue";
import { localDateSchema, monthSchema } from "@/domain/schemas";
import { lastBookableDate } from "@/domain/slots";
import {
  addMonthsTo,
  daysInMonth,
  localDateOf,
  monthOf,
  weekdayOf,
  type LocalDate,
} from "@/domain/time";
import {
  formatDateTime,
  formatDuration,
  formatLocalDate,
  formatMonth,
  formatPrice,
  formatTime,
} from "@/lib/format";
import { requestContext, type RequestContext } from "@/lib/request";
import { BookingForm } from "./booking-form";
import { bookingStepUrl } from "./urls";

export const metadata: Metadata = { title: "Book", robots: { index: false } };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

const backLink = "inline-block py-2 font-semibold text-accent underline underline-offset-4";

function Step({
  n,
  title,
  back,
  children,
}: {
  n: number;
  title: string;
  back?: { href: string; label: string };
  children: ReactNode;
}): ReactNode {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <p className="font-semibold text-ink-soft">Step {n} of 4</p>
        <PageTitle>{title}</PageTitle>
      </div>
      {back && (
        <Link href={back.href} className={backLink}>
          ← {back.label}
        </Link>
      )}
      {children}
    </div>
  );
}

function ServiceSummary({ service }: { service: Service }): ReactNode {
  return (
    <p className="text-lg">
      <strong>{service.name}</strong> · {formatDuration(service.durationMin)} ·{" "}
      {formatPrice(service.priceCents)}
    </p>
  );
}

// --- Step 1 ----------------------------------------------------------------

function ServiceStep({ services }: { services: Service[] }): ReactNode {
  const groups = [
    { title: "For you", items: services.filter((s) => s.forKind === "human") },
    { title: "For your animals", items: services.filter((s) => s.forKind === "animal") },
  ];
  return (
    <Step n={1} title="Choose a service">
      {groups.map(
        (group) =>
          group.items.length > 0 && (
            <section key={group.title} className="flex flex-col gap-3">
              <h2 className="text-2xl font-bold">{group.title}</h2>
              <ul className="flex flex-col gap-3">
                {group.items.map((s) => (
                  <li key={s.id}>
                    <Link
                      href={bookingStepUrl({ service: s.id })}
                      className={`${card} flex flex-col gap-1 hover:border-accent`}
                    >
                      <span className="text-xl font-semibold text-accent">{s.name}</span>
                      <span className="text-ink-soft">
                        {formatDuration(s.durationMin)} · {formatPrice(s.priceCents)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ),
      )}
    </Step>
  );
}

// --- Step 2 ----------------------------------------------------------------

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

async function DateStep({
  ctx,
  service,
  month,
}: {
  ctx: RequestContext;
  service: Service;
  month: string;
}): Promise<ReactNode> {
  const { db, tz, now } = ctx;
  const settings = await loadSettings(db);
  const firstMonth = monthOf(localDateOf(now, tz));
  const lastMonth = monthOf(lastBookableDate(now, settings.maxDaysAhead, tz));
  const shown = month < firstMonth ? firstMonth : month > lastMonth ? lastMonth : month;

  const available = new Set(await findDates(db, { serviceId: service.id, month: shown }, ctx));
  const days = daysInMonth(shown);
  const leadingBlanks = ((days[0] ? weekdayOf(days[0]) : 1) + 6) % 7; // Monday first

  const prev = shown > firstMonth ? addMonthsTo(shown, -1) : undefined;
  const next = shown < lastMonth ? addMonthsTo(shown, 1) : undefined;
  const navClass =
    "inline-flex min-h-12 shrink-0 items-center whitespace-nowrap rounded-xl px-1 font-semibold";

  return (
    <Step
      n={2}
      title="Choose a date"
      back={{ href: bookingStepUrl({}), label: "Choose a different service" }}
    >
      <ServiceSummary service={service} />
      <div className={card}>
        <div className="mb-4 flex items-center justify-between gap-2">
          {prev ? (
            <Link
              href={bookingStepUrl({ service: service.id, month: prev })}
              className={`${navClass} text-accent underline`}
            >
              ← Previous
            </Link>
          ) : (
            <span className={`${navClass} invisible`}>← Previous</span>
          )}
          <h2 className="whitespace-nowrap text-lg font-bold sm:text-xl">{formatMonth(shown)}</h2>
          {next ? (
            <Link
              href={bookingStepUrl({ service: service.id, month: next })}
              className={`${navClass} text-accent underline`}
            >
              Next →
            </Link>
          ) : (
            <span className={`${navClass} invisible`}>Next →</span>
          )}
        </div>
        <ol className="grid grid-cols-7 gap-1 text-center" aria-label={formatMonth(shown)}>
          {WEEKDAYS.map((d) => (
            <li key={d} aria-hidden="true" className="pb-1 text-sm font-semibold text-ink-soft">
              {d}
            </li>
          ))}
          {Array.from({ length: leadingBlanks }, (_, i) => (
            <li key={`blank-${i}`} aria-hidden="true" />
          ))}
          {days.map((date) => {
            const day = Number(date.slice(8));
            const label = formatLocalDate(date);
            return (
              <li key={date}>
                {available.has(date) ? (
                  <Link
                    href={bookingStepUrl({ service: service.id, date })}
                    aria-label={label}
                    className="flex min-h-12 items-center justify-center rounded-lg bg-accent-soft text-lg font-bold text-accent hover:bg-accent hover:text-white"
                  >
                    {day}
                  </Link>
                ) : (
                  <span
                    aria-label={`${label}, not available`}
                    className="flex min-h-12 items-center justify-center text-lg text-ink-soft line-through decoration-1"
                  >
                    {day}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </div>
      {available.size === 0 && (
        <Notice>
          There are no free times this month.
          {next && (
            <>
              {" "}
              <Link
                href={bookingStepUrl({ service: service.id, month: next })}
                className="font-semibold underline"
              >
                Try next month
              </Link>
            </>
          )}
        </Notice>
      )}
    </Step>
  );
}

// --- Step 3 ----------------------------------------------------------------

const ERROR_MESSAGES: Record<string, string> = {
  taken: "Sorry, that time was just taken, please pick another.",
  unavailable: "Sorry, that time isn't available any more, please pick another.",
};

function TimeStep({
  ctx,
  service,
  date,
  slots,
  error,
}: {
  ctx: RequestContext;
  service: Service;
  date: LocalDate;
  slots: Date[];
  error: string | undefined;
}): ReactNode {
  return (
    <Step
      n={3}
      title="Choose a time"
      back={{
        href: bookingStepUrl({ service: service.id, month: monthOf(date) }),
        label: "Choose a different date",
      }}
    >
      <ServiceSummary service={service} />
      <h2 className="text-xl font-bold">{formatLocalDate(date)}</h2>
      {error && <Notice tone="error">{ERROR_MESSAGES[error] ?? ERROR_MESSAGES.unavailable}</Notice>}
      {slots.length === 0 ? (
        <Notice>No free times left on this day. Please choose another date.</Notice>
      ) : (
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {slots.map((slot) => (
            <li key={slot.toISOString()}>
              <Link
                href={bookingStepUrl({ service: service.id, date, start: slot.toISOString() })}
                className="flex min-h-12 items-center justify-center rounded-xl border-2 border-accent bg-card text-lg font-bold text-accent hover:bg-accent hover:text-white"
              >
                {formatTime(slot, ctx.tz)}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Step>
  );
}

// --- Step 4 ----------------------------------------------------------------

function DetailsStep({
  ctx,
  service,
  date,
  start,
}: {
  ctx: RequestContext;
  service: Service;
  date: LocalDate;
  start: Date;
}): ReactNode {
  return (
    <Step
      n={4}
      title="Your details"
      back={{
        href: bookingStepUrl({ service: service.id, date }),
        label: "Choose a different time",
      }}
    >
      <div className={`${card} flex flex-col gap-1 text-lg`}>
        <p className="font-semibold text-ink-soft">You&apos;re booking</p>
        <p className="text-xl font-bold">{service.name}</p>
        <p>{formatDateTime(start, ctx.tz)}</p>
        <p>
          {formatDuration(service.durationMin)} · {formatPrice(service.priceCents)}, paid at your
          session
        </p>
      </div>
      <BookingForm
        serviceId={service.id}
        date={date}
        start={start.toISOString()}
        forAnimal={service.forKind === "animal"}
      />
    </Step>
  );
}

// --- Page ------------------------------------------------------------------

export default async function BookPage({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<ReactNode> {
  const params = await searchParams;
  const ctx = await requestContext();
  const services = await listActiveServices(ctx.db);

  const service = services.find((s) => s.id === one(params.service));
  if (!service) return <ServiceStep services={services} />;

  const dateParam = localDateSchema.safeParse(one(params.date));
  if (!dateParam.success) {
    const monthParam = monthSchema.safeParse(one(params.month));
    const month = monthParam.success ? monthParam.data : monthOf(localDateOf(ctx.now, ctx.tz));
    return <DateStep ctx={ctx} service={service} month={month} />;
  }
  const date = dateParam.data;

  const slots = await findSlots(ctx.db, { serviceId: service.id, date }, ctx);
  const startParam = one(params.start);
  const start = slots.find((s) => s.toISOString() === startParam);
  if (!start) {
    const error = one(params.error) ?? (startParam ? "unavailable" : undefined);
    return <TimeStep ctx={ctx} service={service} date={date} slots={slots} error={error} />;
  }

  return <DetailsStep ctx={ctx} service={service} date={date} start={start} />;
}
