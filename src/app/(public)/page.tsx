import type { ReactNode } from "react";
import { ButtonLink, PageTitle } from "@/components/ui";

// TODO(owner): review and replace this placeholder copy.
export default function Home(): ReactNode {
  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
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
    </div>
  );
}
