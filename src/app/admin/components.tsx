import Link from "next/link";
import type { ReactNode } from "react";
import { input } from "@/components/ui";
import type { DateRange } from "@/domain/date-range";
import { formatLocalDate } from "@/lib/format";

/** Shared pieces for admin pages (server components). */

export const adminCard = "rounded-2xl border border-line bg-card p-5";
export const adminButton =
  "inline-flex min-h-11 items-center justify-center rounded-lg bg-accent px-4 font-semibold text-white hover:bg-accent-strong disabled:opacity-60";
export const adminButtonSecondary =
  "inline-flex min-h-11 items-center justify-center rounded-lg border-2 border-accent bg-card px-4 font-semibold text-accent hover:bg-accent-soft";

const PRESETS = [
  ["this-month", "This month"],
  ["last-month", "Last month"],
  ["last-3-months", "Last 3 months"],
] as const;

function withParams(path: string, params: Record<string, string>): string {
  const query = new URLSearchParams(params).toString();
  return query ? `${path}?${query}` : path;
}

/**
 * Preset links plus a from–to form for a custom range. `keep` carries other filters
 * (e.g. status) across range changes.
 */
export function RangePicker({
  range,
  path,
  keep = {},
}: {
  range: DateRange;
  path: string;
  keep?: Record<string, string>;
}): ReactNode {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map(([preset, label]) => (
          <Link
            key={preset}
            href={withParams(path, { ...keep, range: preset })}
            aria-current={range.preset === preset ? "true" : undefined}
            className={range.preset === preset ? adminButton : adminButtonSecondary}
          >
            {label}
          </Link>
        ))}
      </div>
      <form action={path} className="flex flex-wrap items-end gap-3">
        {Object.entries(keep).map(([key, value]) => (
          <input key={key} type="hidden" name={key} value={value} />
        ))}
        <input type="hidden" name="range" value="custom" />
        <label className="flex flex-col gap-1 font-semibold">
          From
          <input type="date" name="from" defaultValue={range.from} required className={input} />
        </label>
        <label className="flex flex-col gap-1 font-semibold">
          To
          <input type="date" name="to" defaultValue={range.to} required className={input} />
        </label>
        <button type="submit" className={adminButton}>
          Show
        </button>
      </form>
      <p className="text-ink-soft">
        Showing {formatLocalDate(range.from)} to {formatLocalDate(range.to)}.
      </p>
    </div>
  );
}

export interface Bar {
  label: string;
  value: number;
  /** What to show next to the bar, e.g. "3 · R1 200". Defaults to the value. */
  display?: string;
}

/** Horizontal bar chart in plain CSS. The numbers are always written out as text. */
export function BarList({
  title,
  bars,
  empty = "Nothing yet.",
}: {
  title: string;
  bars: Bar[];
  empty?: string;
}): ReactNode {
  const max = Math.max(1, ...bars.map((b) => b.value));
  return (
    <section className={adminCard} aria-label={title}>
      <h2 className="mb-3 text-xl font-bold">{title}</h2>
      {bars.length === 0 ? (
        <p className="text-ink-soft">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {bars.map((bar) => (
            <li
              key={bar.label}
              className="grid grid-cols-[minmax(6rem,12rem)_1fr_auto] items-center gap-3"
            >
              <span className="truncate" title={bar.label}>
                {bar.label}
              </span>
              <span className="h-5 rounded bg-accent-soft" aria-hidden="true">
                <span
                  className="block h-full rounded bg-accent"
                  style={{ width: `${(bar.value / max) * 100}%` }}
                />
              </span>
              <span className="font-semibold tabular-nums">{bar.display ?? bar.value}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="text-2xl font-bold tabular-nums">{value}</dd>
      {note && <dd className="text-sm text-ink-soft">{note}</dd>}
    </div>
  );
}
