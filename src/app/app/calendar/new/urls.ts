/**
 * `/app/calendar/new?...` for each step of an owner booking. Only ids go in the URL,
 * never names or phone numbers.
 */
export function newBookingStepUrl(params: {
  start: string;
  client?: string | undefined;
  /** A pet id, or `self` when the client is being treated. */
  pet?: string | undefined;
  service?: string | undefined;
  q?: string | undefined;
  add?: "client" | "pet" | undefined;
  error?: "failed" | undefined;
}): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
  return `/app/calendar/new?${search.toString()}`;
}
