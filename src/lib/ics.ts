/**
 * Minimal iCalendar (RFC 5545) generation for a single event. Times are written in UTC
 * (`...Z`), so every calendar app shows them in the viewer's own zone correctly.
 */

export interface IcsEvent {
  /** Globally unique, stable id, e.g. `<appointment id>@<host>`. */
  uid: string;
  start: Date;
  end: Date;
  summary: string;
  location?: string | undefined;
  description?: string | undefined;
  url?: string | undefined;
  /** When the file was generated; defaults to now. */
  stamp?: Date | undefined;
  /** CANCELLED events let calendar apps remove a previously added booking. */
  status?: "CONFIRMED" | "CANCELLED";
  /**
   * Who sends the event. Strict calendar apps (Outlook) ignore a cancellation without
   * one, and only accept it when SEQUENCE is higher than the confirmation's.
   */
  organizer?: { name: string; email: string } | undefined;
  /** Revision number: 0 for the confirmation, higher for later changes. */
  sequence?: number | undefined;
}

/** `ORGANIZER;CN="Name":mailto:email`. Quotes can't be escaped in a parameter, so drop them. */
function organizerLine(organizer: { name: string; email: string }): string {
  const name = organizer.name.replace(/["\r\n]/g, "");
  return `ORGANIZER;CN="${name}":mailto:${organizer.email}`;
}

/** `20261103T073000Z` */
export function icsDateTime(date: Date): string {
  return date
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z")
    .replace(/[-:]/g, "");
}

/** Escapes TEXT values: backslash, semicolon, comma and newlines. */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Folds a content line to at most 75 octets per line (continuations start with a space). */
export function foldLine(line: string): string {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  let current = "";
  let currentBytes = 0;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    const limit = parts.length === 0 ? 75 : 74; // continuation lines lose one octet to the space
    if (currentBytes + bytes > limit) {
      parts.push(current);
      current = "";
      currentBytes = 0;
    }
    current += char;
    currentBytes += bytes;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

export function buildIcs(event: IcsEvent): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//dog-stuff//booking//EN",
    "CALSCALE:GREGORIAN",
    `METHOD:${event.status === "CANCELLED" ? "CANCEL" : "PUBLISH"}`,
    "BEGIN:VEVENT",
    `UID:${event.uid}`,
    `DTSTAMP:${icsDateTime(event.stamp ?? new Date())}`,
    `DTSTART:${icsDateTime(event.start)}`,
    `DTEND:${icsDateTime(event.end)}`,
    `SEQUENCE:${event.sequence ?? 0}`,
    `SUMMARY:${escapeText(event.summary)}`,
    ...(event.location ? [`LOCATION:${escapeText(event.location)}`] : []),
    ...(event.description ? [`DESCRIPTION:${escapeText(event.description)}`] : []),
    ...(event.url ? [`URL:${event.url}`] : []),
    ...(event.organizer ? [organizerLine(event.organizer)] : []),
    `STATUS:${event.status ?? "CONFIRMED"}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}
