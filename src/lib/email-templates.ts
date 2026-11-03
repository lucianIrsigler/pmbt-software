import { formatDateTime, formatDayLong, formatPrice, formatTime } from "./format";

/**
 * Client emails: confirmation, cancellation and reminder. Each email is built from one
 * list of blocks, rendered both as plain text and as simple HTML, so the two always say
 * the same thing. Pure functions: no I/O.
 */

export interface EmailBusiness {
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
}

export interface EmailBooking {
  clientName: string;
  serviceName: string;
  petName: string | null;
  start: Date;
  end: Date;
  priceCents: number;
  /** The client's private link to see or cancel the booking. */
  manageUrl: string;
  /** Last moment the client may cancel online. */
  cancelDeadline: Date;
  business: EmailBusiness;
  tz: string;
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

type Block =
  | { kind: "p"; text: string }
  | { kind: "rows"; rows: [label: string, value: string][] }
  | { kind: "link"; label: string; href: string };

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderText(blocks: Block[]): string {
  return `${blocks
    .map((b) => {
      if (b.kind === "p") return b.text;
      if (b.kind === "rows") return b.rows.map(([label, value]) => `${label}: ${value}`).join("\n");
      return `${b.label}:\n${b.href}`;
    })
    .join("\n\n")}\n`;
}

const FONT = "font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:1.5;color:#1d1a16";

function renderHtml(subject: string, blocks: Block[]): string {
  const body = blocks
    .map((b) => {
      if (b.kind === "p") {
        const lines = b.text.split("\n").map(escapeHtml).join("<br>");
        return `<p style="margin:0 0 16px">${lines}</p>`;
      }
      if (b.kind === "rows") {
        const rows = b.rows
          .map(
            ([label, value]) =>
              `<tr><td style="padding:4px 16px 4px 0;vertical-align:top;color:#4a433b">${escapeHtml(label)}</td>` +
              `<td style="padding:4px 0;font-weight:bold">${escapeHtml(value)}</td></tr>`,
          )
          .join("");
        return `<table role="presentation" style="margin:0 0 16px;border-collapse:collapse">${rows}</table>`;
      }
      return (
        `<p style="margin:0 0 16px"><a href="${escapeHtml(b.href)}" ` +
        `style="display:inline-block;padding:12px 20px;background:#1f5f4a;color:#ffffff;` +
        `text-decoration:none;border-radius:8px;font-weight:bold">${escapeHtml(b.label)}</a></p>`
      );
    })
    .join("\n");
  return [
    "<!doctype html>",
    '<html lang="en"><head><meta charset="utf-8">',
    `<meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>`,
    `<body style="margin:0;padding:24px 16px;background:#fdf8f1"><div style="max-width:560px;margin:0 auto;${FONT}">`,
    body,
    "</div></body></html>",
  ].join("\n");
}

function render(subject: string, blocks: Block[]): RenderedEmail {
  return { subject, text: renderText(blocks), html: renderHtml(subject, blocks) };
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

function what(b: EmailBooking): string {
  return b.petName ? `${b.serviceName} for ${b.petName}` : b.serviceName;
}

/** "Please phone us on 082 123 4567." or "Please contact us." */
function contactLine(business: EmailBusiness, lead: string): string {
  if (business.phone) return `${lead} please phone us on ${business.phone}.`;
  if (business.email) return `${lead} please email us at ${business.email}.`;
  return `${lead} please contact us.`;
}

function signature(business: EmailBusiness): Block {
  return { kind: "p", text: [business.name, business.phone].filter(Boolean).join("\n") };
}

export function confirmationEmail(b: EmailBooking): RenderedEmail {
  const when = `${formatDateTime(b.start, b.tz)} (until ${formatTime(b.end, b.tz)})`;
  const rows: [string, string][] = [
    ["When", when],
    ["What", what(b)],
    ["Price", `${formatPrice(b.priceCents)}, paid at your session`],
  ];
  if (b.business.address) rows.push(["Where", b.business.address]);
  return render(`Your booking on ${formatDayLong(b.start, b.tz)} at ${formatTime(b.start, b.tz)}`, [
    { kind: "p", text: `Hi ${firstName(b.clientName)},` },
    { kind: "p", text: `You're booked in with ${b.business.name}.` },
    { kind: "rows", rows },
    { kind: "p", text: "To add it to your calendar, open the attached file." },
    { kind: "link", label: "See or cancel your booking", href: b.manageUrl },
    {
      kind: "p",
      text: `You can cancel online until ${formatDateTime(b.cancelDeadline, b.tz)}. ${contactLine(b.business, "After that,")}`,
    },
    { kind: "p", text: "See you soon," },
    signature(b.business),
  ]);
}

export function cancellationEmail(b: EmailBooking, bookUrl: string): RenderedEmail {
  return render(`Your booking on ${formatDayLong(b.start, b.tz)} is cancelled`, [
    { kind: "p", text: `Hi ${firstName(b.clientName)},` },
    {
      kind: "p",
      text: `Your booking for ${what(b)} on ${formatDateTime(b.start, b.tz)} has been cancelled.`,
    },
    { kind: "link", label: "Book another time", href: bookUrl },
    { kind: "p", text: contactLine(b.business, "If you have any questions,") },
    signature(b.business),
  ]);
}

export function reminderEmail(b: EmailBooking): RenderedEmail {
  const rows: [string, string][] = [
    ["When", `Tomorrow, ${formatDateTime(b.start, b.tz)}`],
    ["What", what(b)],
  ];
  if (b.business.address) rows.push(["Where", b.business.address]);
  return render(`See you tomorrow at ${formatTime(b.start, b.tz)}`, [
    { kind: "p", text: `Hi ${firstName(b.clientName)},` },
    { kind: "p", text: `A reminder of your booking with ${b.business.name} tomorrow.` },
    { kind: "rows", rows },
    { kind: "p", text: contactLine(b.business, "If you can't make it,") },
    { kind: "link", label: "See your booking", href: b.manageUrl },
    signature(b.business),
  ]);
}
