import type { ReactNode } from "react";
import { ButtonLink, PageTitle } from "@/components/ui";
import { listActiveTestimonials, type Testimonial } from "@/domain/catalogue";
import { requestContext } from "@/lib/request";

const TAGLINE = ["Creams", "Light therapy", "Pets and people"] as const;

/** "Creams · Light therapy · Pets and people", as on the banner. */
function Tagline(): ReactNode {
  return (
    <p className="flex flex-wrap items-center gap-x-3 font-heading uppercase tracking-wide">
      {TAGLINE.map((item, i) => (
        <span key={item} className="flex items-center gap-x-3">
          {i > 0 && <span aria-hidden="true" className="size-2 rounded-full bg-brand" />}
          {item}
        </span>
      ))}
    </p>
  );
}

function Testimonials({ items }: { items: readonly Testimonial[] }): ReactNode {
  return (
    <section aria-labelledby="testimonials-heading" className="flex flex-col gap-4">
      <h2 id="testimonials-heading" className="text-2xl font-bold">
        What people say
      </h2>
      <ul className="grid gap-4 sm:grid-cols-2">
        {items.map((t) => (
          <li key={t.id}>
            <figure className="flex h-full flex-col gap-3 rounded-2xl border border-line border-t-4 border-t-brand bg-card p-5">
              <span aria-hidden="true" className="font-heading text-5xl leading-none text-brand">
                &ldquo;
              </span>
              <blockquote className="-mt-4 flex-1 whitespace-pre-line text-lg">
                {t.quote}
              </blockquote>
              <figcaption className="font-semibold">{t.author}</figcaption>
            </figure>
          </li>
        ))}
      </ul>
    </section>
  );
}

// TODO(owner): review and replace this placeholder copy.
export default async function Home(): Promise<ReactNode> {
  const { db } = await requestContext();
  const testimonials = await listActiveTestimonials(db);
  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-4">
        <Tagline />
        <PageTitle>Gentle light therapy for you and your animals</PageTitle>
        <p className="text-lg">
          Photobiomodulation therapy (PBMT) uses low-level red and near-infrared light. Many people
          use it alongside their usual care for sore joints, muscles and skin, and for helping their
          dogs and other animals feel more comfortable.
        </p>
        <p className="text-lg">
          Sessions are calm and painless. You come to us, and we&apos;ll talk through what you or
          your animal needs before we start.
        </p>
        <div>
          <ButtonLink href="/book">Book now</ButtonLink>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-2xl font-bold">Natural products</h2>
        <p className="text-lg">
          We also make natural creams and ointments, available during your session.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <ButtonLink href="/services" variant="secondary">
            See services and prices
          </ButtonLink>
          <ButtonLink href="/products" variant="secondary">
            See products
          </ButtonLink>
        </div>
      </section>

      {testimonials.length > 0 && <Testimonials items={testimonials} />}
    </div>
  );
}
