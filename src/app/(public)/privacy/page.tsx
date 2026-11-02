import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Notice, PageTitle } from "@/components/ui";

export const metadata: Metadata = { title: "Privacy notice" };

// TODO(owner): this is a placeholder. Have it reviewed (POPIA) and fill in the blanks
// marked [TODO] before going live.
export default function PrivacyPage(): ReactNode {
  return (
    <article className="flex flex-col gap-5 text-lg [&_h2]:mt-2 [&_h2]:text-2xl [&_h2]:font-bold [&_li]:ml-6 [&_li]:list-disc">
      <PageTitle>Privacy notice</PageTitle>
      <Notice tone="warn">
        <strong>Draft:</strong> this notice is a placeholder and must be reviewed by the business
        owner before the website goes live.
      </Notice>

      <p>
        We respect your privacy and handle your personal information in line with the Protection of
        Personal Information Act (POPIA).
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>Your name and phone number, and your email address if you give it.</li>
        <li>For animal bookings: your animal&apos;s name, species and breed.</li>
        <li>Your bookings, and notes about your sessions.</li>
      </ul>

      <h2>Why we collect it</h2>
      <ul>
        <li>To manage your bookings and contact you about them.</li>
        <li>To keep a record of your sessions so we can care for you or your animal properly.</li>
      </ul>
      <p>We don&apos;t sell or share your information, and we don&apos;t use it for marketing.</p>

      <h2>Who can see it</h2>
      <p>
        Only the practitioner. It is stored on our own secure server in [TODO: country], and our
        email provider sees your email address when we send you booking emails.
      </p>

      <h2>How long we keep it</h2>
      <p>[TODO: retention period, e.g. as long as you are a client, plus N years.]</p>

      <h2>Your rights</h2>
      <p>
        You may ask to see, correct or delete your information, or object to how we use it. You may
        also complain to the Information Regulator (inforegulator.org.za).
      </p>

      <h2>Contact</h2>
      <p>Information Officer: [TODO: name, email and phone number].</p>
    </article>
  );
}
