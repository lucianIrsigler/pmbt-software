import Link from "next/link";
import type { ReactNode } from "react";
import { RefreshOnReturn } from "@/components/owner/refresh-on-return";
import { listDay, type DayAppointment } from "@/domain/appointments";
import { localDateOf } from "@/domain/time";
import { formatDayLong, formatTime } from "@/lib/format";
import { requestContext } from "@/lib/request";

const STATUS_BADGE: Partial<
  Record<DayAppointment["status"], { label: string; className: string }>
> = {
  done: { label: "Done", className: "bg-accent text-white" },
  no_show: {
    label: "Didn't come",
    className: "bg-warn-soft text-warn-ink border-2 border-warn-ink",
  },
};

function AppointmentCard({ a, tz }: { a: DayAppointment; tz: string }): ReactNode {
  const badge = STATUS_BADGE[a.status];
  return (
    <Link
      href={`/app/appointment/${a.id}`}
      className="flex flex-col gap-1 rounded-2xl border-2 border-line bg-card p-5 hover:border-accent"
    >
      <span className="flex items-center justify-between gap-3">
        <span className="text-2xl font-bold">
          {formatTime(a.start, tz)} – {formatTime(a.end, tz)}
        </span>
        {badge && (
          <span className={`rounded-lg px-3 py-1 text-base font-bold ${badge.className}`}>
            {badge.label}
          </span>
        )}
      </span>
      <span className="text-xl font-semibold">{a.clientName}</span>
      {a.petName && (
        <span className="text-xl">
          {a.petName}
          {a.petSpecies && <span className="text-ink-soft"> ({a.petSpecies})</span>}
        </span>
      )}
      <span className="text-lg text-ink-soft">{a.serviceName}</span>
    </Link>
  );
}

export default async function TodayPage(): Promise<ReactNode> {
  const { db, tz, now } = await requestContext();
  const appointments = await listDay(db, localDateOf(now, tz), tz);

  return (
    <div className="flex flex-col gap-5">
      <RefreshOnReturn />
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-lg font-semibold text-ink-soft">Today</p>
          <h1 className="text-3xl font-bold">{formatDayLong(now, tz)}</h1>
        </div>
        <Link href="/app/settings" className="py-2 text-lg text-accent underline">
          Settings
        </Link>
      </div>

      {appointments.length === 0 ? (
        <p className="rounded-2xl border-2 border-line bg-card p-6 text-xl">No bookings today.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {appointments.map((a) => (
            <li key={a.id}>
              <AppointmentCard a={a} tz={tz} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
