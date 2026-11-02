import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ButtonLink, card, PageTitle } from "@/components/ui";
import type { Service } from "@/domain/availability";
import { listActiveServices } from "@/domain/catalogue";
import { formatDuration, formatPrice } from "@/lib/format";
import { requestContext } from "@/lib/request";

export const metadata: Metadata = { title: "Services" };

function ServiceList({ title, services }: { title: string; services: Service[] }): ReactNode {
  if (services.length === 0) return null;
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-2xl font-bold">{title}</h2>
      <ul className="flex flex-col gap-3">
        {services.map((s) => (
          <li key={s.id} className={card}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-xl font-semibold">{s.name}</h3>
                {s.description && <p className="mt-1">{s.description}</p>}
                <p className="mt-2 text-ink-soft">
                  {formatDuration(s.durationMin)} · {formatPrice(s.priceCents)}
                </p>
              </div>
              <Link
                href={`/book?service=${s.id}`}
                className="font-semibold text-accent underline underline-offset-4"
              >
                Book this
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default async function ServicesPage(): Promise<ReactNode> {
  const { db } = await requestContext();
  const services = await listActiveServices(db);
  return (
    <div className="flex flex-col gap-8">
      <PageTitle>Services</PageTitle>
      <ServiceList title="For you" services={services.filter((s) => s.forKind === "human")} />
      <ServiceList
        title="For your animals"
        services={services.filter((s) => s.forKind === "animal")}
      />
      <p>Payment is made in person at your session.</p>
      <div>
        <ButtonLink href="/book">Book now</ButtonLink>
      </div>
    </div>
  );
}
