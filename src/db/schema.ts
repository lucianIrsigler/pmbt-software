import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { formatTstzRange, parseTstzRange, type TimeRange } from "./range";

// ---------------------------------------------------------------------------
// Shared column types
// ---------------------------------------------------------------------------

/** `tstzrange`, always bounded and half-open `[start, end)`. */
const tstzrange = customType<{ data: TimeRange; driverData: string }>({
  dataType: () => "tstzrange",
  toDriver: formatTstzRange,
  fromDriver: parseTstzRange,
});

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

/** A range must be bounded and non-empty. */
const boundedRange = (name: string, column: string) =>
  check(
    name,
    sql`not isempty(${sql.raw(column)}) and not lower_inf(${sql.raw(column)}) and not upper_inf(${sql.raw(column)})`,
  );

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const serviceKind = pgEnum("service_kind", ["human", "animal"]);
export const appointmentStatus = pgEnum("appointment_status", [
  "booked",
  "done",
  "no_show",
  "cancelled",
]);
export const bookingSource = pgEnum("booking_source", ["web", "app"]);

// ---------------------------------------------------------------------------
// Clients and pets
// ---------------------------------------------------------------------------

export const client = pgTable(
  "client",
  {
    id: id(),
    name: text("name").notNull(),
    /** Normalised to E.164, e.g. `+27821234567`. */
    phone: text("phone").notNull(),
    email: text("email"),
    notes: text("notes").notNull().default(""),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("client_name_trgm_idx").using("gin", sql`lower(${t.name}) gin_trgm_ops`),
    index("client_phone_idx").on(t.phone),
  ],
);

export const pet = pgTable(
  "pet",
  {
    id: id(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => client.id),
    name: text("name").notNull(),
    species: text("species").notNull(),
    breed: text("breed"),
    notes: text("notes").notNull().default(""),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("pet_client_id_idx").on(t.clientId),
    // Lets appointment reference (pet_id, client_id) so a pet always belongs to the booking's client.
    unique("pet_id_client_id_key").on(t.id, t.clientId),
  ],
);

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------

export const service = pgTable(
  "service",
  {
    id: id(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    forKind: serviceKind("for_kind").notNull(),
    durationMin: integer("duration_min").notNull(),
    bufferMin: integer("buffer_min").notNull().default(10),
    priceCents: integer("price_cents").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    active: boolean("active").notNull().default(true),
  },
  (t) => [
    check("service_duration_positive", sql`${t.durationMin} > 0`),
    check("service_buffer_non_negative", sql`${t.bufferMin} >= 0`),
    check("service_price_non_negative", sql`${t.priceCents} >= 0`),
  ],
);

export const product = pgTable(
  "product",
  {
    id: id(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    priceCents: integer("price_cents").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    active: boolean("active").notNull().default(true),
  },
  (t) => [check("product_price_non_negative", sql`${t.priceCents} >= 0`)],
);

// ---------------------------------------------------------------------------
// Availability
// ---------------------------------------------------------------------------

export const workingHours = pgTable(
  "working_hours",
  {
    id: id(),
    /** 0 = Sunday … 6 = Saturday, in the business time zone. */
    weekday: smallint("weekday").notNull(),
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),
  },
  (t) => [
    check("working_hours_weekday_range", sql`${t.weekday} between 0 and 6`),
    check("working_hours_end_after_start", sql`${t.endTime} > ${t.startTime}`),
    index("working_hours_weekday_idx").on(t.weekday),
  ],
);

export const timeOff = pgTable(
  "time_off",
  {
    id: id(),
    during: tstzrange("during").notNull(),
    reason: text("reason"),
    createdAt: createdAt(),
  },
  () => [boundedRange("time_off_during_bounded", "during")],
);

// ---------------------------------------------------------------------------
// Appointments
// ---------------------------------------------------------------------------

export const appointment = pgTable(
  "appointment",
  {
    id: id(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => client.id),
    /** Null means the client themself is being treated. */
    petId: uuid("pet_id"),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => service.id),
    /**
     * Includes the service's buffer. Overlaps between `booked`/`done` rows are rejected
     * by the `appointment_no_overlap` exclusion constraint (migrations 0002, 0004).
     */
    during: tstzrange("during").notNull(),
    status: appointmentStatus("status").notNull().default("booked"),
    source: bookingSource("source").notNull(),
    notes: text("notes").notNull().default(""),
    manageToken: text("manage_token").notNull().unique(),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    foreignKey({
      name: "appointment_pet_belongs_to_client_fk",
      columns: [t.petId, t.clientId],
      foreignColumns: [pet.id, pet.clientId],
    }),
    boundedRange("appointment_during_bounded", "during"),
    check(
      "appointment_cancelled_at_matches_status",
      sql`(${t.status} = 'cancelled') = (${t.cancelledAt} is not null)`,
    ),
    index("appointment_during_start_idx").on(sql`lower(${t.during})`),
    index("appointment_client_id_idx").on(t.clientId),
    index("appointment_pet_id_idx").on(t.petId),
  ],
);

export const appointmentProduct = pgTable(
  "appointment_product",
  {
    appointmentId: uuid("appointment_id")
      .notNull()
      .references(() => appointment.id),
    productId: uuid("product_id")
      .notNull()
      .references(() => product.id),
    qty: integer("qty").notNull().default(1),
    /** Unit price at the time of sale. */
    priceCents: integer("price_cents").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.appointmentId, t.productId] }),
    check("appointment_product_qty_positive", sql`${t.qty} > 0`),
    check("appointment_product_price_non_negative", sql`${t.priceCents} >= 0`),
  ],
);

// ---------------------------------------------------------------------------
// Settings (single row)
// ---------------------------------------------------------------------------

export const settings = pgTable(
  "settings",
  {
    id: smallint("id").primaryKey().default(1),
    businessName: text("business_name").notNull(),
    /** Shown in the site footer and emails. Optional until the owner fills them in. */
    contactPhone: text("contact_phone"),
    contactEmail: text("contact_email"),
    address: text("address"),
    minNoticeHours: integer("min_notice_hours").notNull().default(12),
    maxDaysAhead: integer("max_days_ahead").notNull().default(42),
    slotStepMin: integer("slot_step_min").notNull().default(30),
    cancelCutoffHours: integer("cancel_cutoff_hours").notNull().default(24),
  },
  (t) => [
    check("settings_single_row", sql`${t.id} = 1`),
    check("settings_min_notice_non_negative", sql`${t.minNoticeHours} >= 0`),
    check("settings_max_days_ahead_positive", sql`${t.maxDaysAhead} > 0`),
    check("settings_slot_step_positive", sql`${t.slotStepMin} > 0`),
    check("settings_cancel_cutoff_non_negative", sql`${t.cancelCutoffHours} >= 0`),
  ],
);

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const user = pgTable("user", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: createdAt(),
});

export const session = pgTable(
  "session",
  {
    /** SHA-256 hash of the session token; the token itself lives only in the cookie. */
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("session_user_id_idx").on(t.userId)],
);

export const rateLimit = pgTable(
  "rate_limit",
  {
    key: text("key").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] })],
);
