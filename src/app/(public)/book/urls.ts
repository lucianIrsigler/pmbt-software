/** Builds `/book?...` URLs for each step. The flow's state lives entirely in the URL. */
export function bookingStepUrl(params: {
  service?: string;
  month?: string;
  date?: string;
  start?: string;
  error?: string;
}): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
  const query = search.toString();
  return query ? `/book?${query}` : "/book";
}
