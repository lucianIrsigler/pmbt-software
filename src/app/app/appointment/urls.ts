import { localDateSchema } from "@/domain/schemas";
import type { LocalDate } from "@/domain/time";
import { calendarUrl } from "../calendar/urls";

/** Where an appointment was opened from, so its back link can return there. */
export type AppointmentFrom = { calendar: LocalDate } | "client";

/** `/app/appointment/<id>`, remembering where it was opened from. */
export function appointmentUrl(id: string, from?: AppointmentFrom): string {
  const base = `/app/appointment/${id}`;
  if (from === "client") return `${base}?from=client`;
  if (from) return `${base}?${new URLSearchParams({ from: "calendar", date: from.calendar })}`;
  return base;
}

/**
 * The back link for an appointment page. Only the calendar (with a valid date) and the
 * appointment's own client are accepted; anything else falls back to Today, so the URL
 * can't send her anywhere else.
 */
export function appointmentBackLink(
  params: { from?: string | undefined; date?: string | undefined },
  client: { id: string; name: string },
): { href: string; label: string } {
  if (params.from === "calendar") {
    const date = localDateSchema.safeParse(params.date);
    if (date.success) return { href: calendarUrl(date.data), label: "Calendar" };
  }
  if (params.from === "client") return { href: `/app/clients/${client.id}`, label: client.name };
  return { href: "/app", label: "Today" };
}
