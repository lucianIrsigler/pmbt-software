import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { z } from "zod";
import { ownerButton } from "@/components/owner/styles";
import { Notice } from "@/components/ui";
import { servicesBookableAt, type Service } from "@/domain/availability";
import { getClientWithPets, searchClients, type ClientWithPets } from "@/domain/clients";
import { localDateOf } from "@/domain/time";
import { formatDayLong, formatDuration, formatPhone, formatPrice, formatTime } from "@/lib/format";
import { requestContext, type RequestContext } from "@/lib/request";
import { calendarUrl } from "../urls";
import { bookFromCalendarAction } from "./actions";
import { NewClientForm, NewPetForm } from "./forms";
import { newBookingStepUrl } from "./urls";

export const metadata: Metadata = { title: "New booking" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

const rowLink =
  "flex min-h-16 flex-col justify-center rounded-2xl border-2 border-line bg-card px-5 py-3 hover:border-accent";
const backLink = "self-start py-2 text-lg font-semibold text-accent underline";

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
    <section className="flex flex-col gap-4">
      <div>
        <p className="text-lg font-semibold text-ink-soft">Step {n} of 4</p>
        <h2 className="text-2xl font-bold">{title}</h2>
      </div>
      {back && (
        <Link href={back.href} className={backLink}>
          ← {back.label}
        </Link>
      )}
      {children}
    </section>
  );
}

// --- Step 1: client --------------------------------------------------------

async function ClientStep({
  ctx,
  start,
  q,
}: {
  ctx: RequestContext;
  start: string;
  q: string;
}): Promise<ReactNode> {
  const results = q.trim().length >= 2 ? await searchClients(ctx.db, q.slice(0, 100)) : [];
  return (
    <Step n={1} title="Who is the booking for?">
      <form action="/app/calendar/new" className="flex flex-col gap-3" role="search">
        <input type="hidden" name="start" value={start} />
        <label htmlFor="client-search" className="text-xl font-semibold">
          Find a client by name or phone
        </label>
        <input
          id="client-search"
          name="q"
          type="search"
          defaultValue={q}
          autoComplete="off"
          className="block min-h-14 w-full rounded-xl border-2 border-ink-soft bg-card px-4 text-xl focus:border-accent"
        />
        <button type="submit" className={ownerButton.primary}>
          Search
        </button>
      </form>

      {q.trim().length > 0 && q.trim().length < 2 && (
        <p className="text-xl">Please type at least 2 letters or numbers.</p>
      )}
      {q.trim().length >= 2 && results.length === 0 && <p className="text-xl">No clients found.</p>}
      {results.length > 0 && (
        <ul className="flex flex-col gap-3" aria-label="Clients found">
          {results.map((c) => (
            <li key={c.id}>
              <Link href={newBookingStepUrl({ start, client: c.id })} className={rowLink}>
                <span className="text-xl font-bold">{c.name}</span>
                <span className="text-lg">{formatPhone(c.phone)}</span>
                {c.petNames && <span className="text-lg text-ink-soft">{c.petNames}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Link href={newBookingStepUrl({ start, add: "client" })} className={ownerButton.secondary}>
        New client
      </Link>
    </Step>
  );
}

// --- Step 2: client or pet -------------------------------------------------

function PetStep({ start, client }: { start: string; client: ClientWithPets }): ReactNode {
  return (
    <Step
      n={2}
      title={`Who is being treated?`}
      back={{ href: newBookingStepUrl({ start }), label: "Choose a different client" }}
    >
      <p className="text-xl">
        Client: <strong>{client.name}</strong>
      </p>
      <ul className="flex flex-col gap-3">
        <li>
          <Link
            href={newBookingStepUrl({ start, client: client.id, pet: "self" })}
            className={rowLink}
          >
            <span className="text-xl font-bold">{client.name} (the person)</span>
          </Link>
        </li>
        {client.pets.map((p) => (
          <li key={p.id}>
            <Link
              href={newBookingStepUrl({ start, client: client.id, pet: p.id })}
              className={rowLink}
            >
              <span className="text-xl font-bold">
                {p.name} <span className="font-normal">({p.species})</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <Link
        href={newBookingStepUrl({ start, client: client.id, add: "pet" })}
        className={ownerButton.secondary}
      >
        Add a new animal
      </Link>
    </Step>
  );
}

// --- Step 3: service -------------------------------------------------------

function ServiceStep({
  start,
  client,
  pet,
  services,
}: {
  start: string;
  client: ClientWithPets;
  pet: string;
  services: Service[];
}): ReactNode {
  return (
    <Step
      n={3}
      title="Choose a service"
      back={{ href: newBookingStepUrl({ start, client: client.id }), label: "Back" }}
    >
      {services.length === 0 ? (
        <Notice tone="warn">
          <p className="text-xl font-bold">No service fits at this time.</p>
          <p className="text-lg">It may run into another booking, time away or closing time.</p>
        </Notice>
      ) : (
        <ul className="flex flex-col gap-3">
          {services.map((s) => (
            <li key={s.id}>
              <Link
                href={newBookingStepUrl({ start, client: client.id, pet, service: s.id })}
                className={rowLink}
              >
                <span className="text-xl font-bold">{s.name}</span>
                <span className="text-lg">
                  {formatDuration(s.durationMin)} · {formatPrice(s.priceCents)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Step>
  );
}

// --- Step 4: confirm -------------------------------------------------------

function ConfirmStep({
  start,
  client,
  pet,
  service,
  failed,
  tz,
}: {
  start: Date;
  client: ClientWithPets;
  pet: string;
  service: Service;
  failed: boolean;
  tz: string;
}): ReactNode {
  const iso = start.toISOString();
  const animal = client.pets.find((p) => p.id === pet);
  const rows: [string, string][] = [
    ["When", `${formatDayLong(start, tz)} at ${formatTime(start, tz)}`],
    ["Client", `${client.name} · ${formatPhone(client.phone)}`],
    ...(animal ? [["Animal", `${animal.name} (${animal.species})`] as [string, string]] : []),
    [
      "Service",
      `${service.name} · ${formatDuration(service.durationMin)} · ${formatPrice(service.priceCents)}`,
    ],
  ];
  return (
    <Step
      n={4}
      title="Check and book"
      back={{ href: newBookingStepUrl({ start: iso, client: client.id, pet }), label: "Back" }}
    >
      {failed && (
        <Notice tone="error">
          <p className="text-xl font-bold">Sorry, that didn&apos;t work. Please try again.</p>
        </Notice>
      )}
      <dl className="flex flex-col gap-3 rounded-2xl border-2 border-line bg-card p-5">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt className="text-lg font-semibold text-ink-soft">{label}</dt>
            <dd className="text-xl font-bold">{value}</dd>
          </div>
        ))}
      </dl>
      <form action={bookFromCalendarAction}>
        <input type="hidden" name="start" value={iso} />
        <input type="hidden" name="clientId" value={client.id} />
        <input type="hidden" name="pet" value={pet} />
        <input type="hidden" name="serviceId" value={service.id} />
        <button type="submit" className={ownerButton.primary}>
          Book it
        </button>
      </form>
    </Step>
  );
}

// --- Page ------------------------------------------------------------------

const startSchema = z.iso.datetime().transform((value) => new Date(value));

export default async function NewBookingPage({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<ReactNode> {
  const ctx = await requestContext();
  const { db, tz, now } = ctx;
  const params = await searchParams;

  const parsedStart = startSchema.safeParse(one(params.start));
  const start = parsedStart.success ? parsedStart.data : undefined;
  const backToCalendar = calendarUrl(localDateOf(start ?? now, tz));

  const header = (
    <div className="flex flex-col gap-1">
      <Link href={backToCalendar} className={backLink}>
        ← Calendar
      </Link>
      <h1 className="text-3xl font-bold">New booking</h1>
      {start && (
        <p className="text-xl font-semibold">
          {formatDayLong(start, tz)} at {formatTime(start, tz)}
        </p>
      )}
    </div>
  );

  if (!start || start.getTime() < now.getTime()) {
    return (
      <div className="flex flex-col gap-5">
        {header}
        <Notice tone="warn">
          <p className="text-xl font-bold">
            {start ? "That time has already passed." : "Please choose a time on the calendar."}
          </p>
        </Notice>
        <Link href={backToCalendar} className={ownerButton.primary}>
          Back to the calendar
        </Link>
      </div>
    );
  }

  const iso = start.toISOString();
  const client = await getClientWithPets(db, one(params.client) ?? "");
  const petParam = one(params.pet);
  const pet =
    client && (petParam === "self" || client.pets.some((p) => p.id === petParam))
      ? petParam
      : undefined;

  let body: ReactNode;
  if (!client) {
    body =
      params.add === "client" ? (
        <Step
          n={1}
          title="New client"
          back={{ href: newBookingStepUrl({ start: iso }), label: "Search instead" }}
        >
          <NewClientForm start={iso} />
        </Step>
      ) : (
        <ClientStep ctx={ctx} start={iso} q={one(params.q) ?? ""} />
      );
  } else if (!pet) {
    body =
      params.add === "pet" ? (
        <Step
          n={2}
          title={`New animal for ${client.name}`}
          back={{ href: newBookingStepUrl({ start: iso, client: client.id }), label: "Back" }}
        >
          <NewPetForm start={iso} clientId={client.id} />
        </Step>
      ) : (
        <PetStep start={iso} client={client} />
      );
  } else {
    const services = await servicesBookableAt(db, start, pet === "self" ? "human" : "animal", ctx);
    const service = services.find((s) => s.id === one(params.service));
    body = service ? (
      <ConfirmStep
        start={start}
        client={client}
        pet={pet}
        service={service}
        failed={params.error === "failed"}
        tz={tz}
      />
    ) : (
      <ServiceStep start={iso} client={client} pet={pet} services={services} />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {header}
      {body}
    </div>
  );
}
