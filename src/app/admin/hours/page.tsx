import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Notice } from "@/components/ui";
import { listHours } from "@/domain/admin";
import { requestContext } from "@/lib/request";
import type { SearchParams } from "@/lib/search-params";
import { removeHoursAction, saveHoursAction } from "../actions";
import { AdminForm } from "../admin-form";
import { adminButtonSecondary, adminCard } from "../components";
import { HOURS_FIELDS } from "../fields";

export const metadata: Metadata = { title: "Hours" };

/** Monday first; 0 = Sunday as stored. */
const DAYS: readonly (readonly [weekday: number, name: string])[] = [
  [1, "Monday"],
  [2, "Tuesday"],
  [3, "Wednesday"],
  [4, "Thursday"],
  [5, "Friday"],
  [6, "Saturday"],
  [0, "Sunday"],
];

export default async function AdminHoursPage({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<ReactNode> {
  const { db } = await requestContext();
  const [hours, params] = await Promise.all([listHours(db), searchParams]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold">Opening hours</h1>
      <p className="max-w-2xl text-ink-soft">
        Clients can book inside these hours. Changing them never moves or cancels existing bookings.
        To close for a holiday, use &ldquo;Block time&rdquo; in the owner&apos;s calendar.
      </p>
      {params.saved === "1" && <Notice tone="success">Saved ✓</Notice>}

      <div className="grid gap-4 lg:grid-cols-2">
        {DAYS.map(([weekday, name]) => {
          const blocks = hours.filter((h) => h.weekday === weekday);
          return (
            <section key={weekday} aria-label={name} className={adminCard}>
              <h2 className="mb-3 text-xl font-bold">{name}</h2>
              {blocks.length === 0 && <p className="mb-3 text-ink-soft">Closed.</p>}
              <ul className="flex flex-col gap-3">
                {blocks.map((block) => (
                  <li key={block.id} className="flex flex-wrap items-end gap-3">
                    <AdminForm
                      inline
                      idPrefix={`hours-${block.id}`}
                      action={saveHoursAction.bind(null, block.id)}
                      fields={HOURS_FIELDS}
                      initial={{
                        weekday: String(weekday),
                        startTime: block.startTime,
                        endTime: block.endTime,
                      }}
                      submitLabel="Save"
                    />
                    <form action={removeHoursAction.bind(null, block.id)}>
                      <button
                        type="submit"
                        className={adminButtonSecondary}
                        aria-label={`Remove ${name} ${block.startTime}–${block.endTime}`}
                      >
                        Remove
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
              <details className="mt-4">
                <summary className="cursor-pointer font-semibold text-accent">
                  {blocks.length === 0 ? `Open on ${name}` : `Add more hours on ${name}`}
                </summary>
                <div className="mt-3">
                  <AdminForm
                    inline
                    idPrefix={`add-${weekday}`}
                    action={saveHoursAction.bind(null, null)}
                    fields={HOURS_FIELDS}
                    initial={{ weekday: String(weekday), startTime: "09:00", endTime: "13:00" }}
                    submitLabel="Add"
                  />
                </div>
              </details>
            </section>
          );
        })}
      </div>
    </div>
  );
}
