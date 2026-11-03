/**
 * Minimal CSV (RFC 4180) for exports. Cells that a spreadsheet would treat as a formula
 * (starting with = + - @, tab or carriage return) get a leading apostrophe, so opening
 * the file in Excel can't run anything a client typed into their name.
 */

const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (typeof value === "string" && FORMULA_START.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Rows to CSV text with CRLF line endings and a UTF-8 BOM (so Excel reads accents). */
export function toCsv(rows: readonly (readonly (string | number | null | undefined)[])[]): string {
  return `﻿${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
