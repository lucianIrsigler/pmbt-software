/** Form field definitions for the admin settings screens (plain data, safe on client and server). */

export interface FieldSpec {
  name: string;
  label: string;
  kind:
    "text" | "textarea" | "number" | "email" | "time" | "money" | "select" | "checkbox" | "hidden";
  options?: readonly (readonly [value: string, label: string])[];
  hint?: string;
}

export const SERVICE_FIELDS: readonly FieldSpec[] = [
  { name: "name", label: "Name", kind: "text" },
  { name: "description", label: "Description", kind: "textarea" },
  {
    name: "forKind",
    label: "For",
    kind: "select",
    options: [
      ["human", "People"],
      ["animal", "Animals"],
    ],
  },
  { name: "durationMin", label: "Duration (minutes)", kind: "number" },
  {
    name: "bufferMin",
    label: "Buffer after (minutes)",
    kind: "number",
    hint: "Time kept free after the session, e.g. to clean up.",
  },
  { name: "priceCents", label: "Price (R)", kind: "money" },
  { name: "sortOrder", label: "Order", kind: "number", hint: "Lower numbers are listed first." },
  {
    name: "active",
    label: "Offered (untick to hide it from the website and new bookings)",
    kind: "checkbox",
  },
];

export const PRODUCT_FIELDS: readonly FieldSpec[] = [
  { name: "name", label: "Name", kind: "text" },
  { name: "description", label: "Description", kind: "textarea" },
  { name: "priceCents", label: "Price (R)", kind: "money" },
  { name: "sortOrder", label: "Order", kind: "number", hint: "Lower numbers are listed first." },
  { name: "active", label: "Shown (untick to hide it)", kind: "checkbox" },
];

export const HOURS_FIELDS: readonly FieldSpec[] = [
  { name: "weekday", label: "Day", kind: "hidden" },
  { name: "startTime", label: "Opens", kind: "time" },
  { name: "endTime", label: "Closes", kind: "time" },
];

export const SETTINGS_FIELDS: readonly FieldSpec[] = [
  { name: "businessName", label: "Business name", kind: "text" },
  { name: "contactPhone", label: "Contact phone (optional)", kind: "text" },
  { name: "contactEmail", label: "Contact email (optional)", kind: "email" },
  { name: "address", label: "Address (optional)", kind: "textarea" },
  {
    name: "minNoticeHours",
    label: "Minimum notice (hours)",
    kind: "number",
    hint: "How soon before a slot clients can book it online.",
  },
  {
    name: "maxDaysAhead",
    label: "Bookable ahead (days)",
    kind: "number",
    hint: "How far ahead clients can book online.",
  },
  {
    name: "slotStepMin",
    label: "Slot step (minutes)",
    kind: "select",
    options: [
      ["10", "10"],
      ["15", "15"],
      ["20", "20"],
      ["30", "30"],
      ["60", "60"],
    ],
    hint: "Bookings start on these boundaries, e.g. every 30 minutes.",
  },
  {
    name: "cancelCutoffHours",
    label: "Online cancellation cutoff (hours)",
    kind: "number",
    hint: "Clients can cancel online until this long before.",
  },
];

export function fieldNames(fields: readonly FieldSpec[]): string[] {
  return fields.map((f) => f.name);
}
