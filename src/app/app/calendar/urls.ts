/**
 * `/app/calendar?date=...`, optionally with a notice to show, or booking for a client
 * (free times then skip choosing the client). Only ids go in the URL.
 */
export function calendarUrl(
  date: string,
  extra: { booked?: boolean; error?: "taken" | "unavailable"; client?: string | undefined } = {},
): string {
  const search = new URLSearchParams({ date });
  if (extra.client) search.set("client", extra.client);
  if (extra.booked) search.set("booked", "1");
  if (extra.error) search.set("error", extra.error);
  return `/app/calendar?${search.toString()}`;
}
