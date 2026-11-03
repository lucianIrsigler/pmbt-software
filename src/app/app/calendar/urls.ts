/** `/app/calendar?date=...`, optionally with a notice to show. */
export function calendarUrl(
  date: string,
  extra: { booked?: boolean; error?: "taken" | "unavailable" } = {},
): string {
  const search = new URLSearchParams({ date });
  if (extra.booked) search.set("booked", "1");
  if (extra.error) search.set("error", extra.error);
  return `/app/calendar?${search.toString()}`;
}
