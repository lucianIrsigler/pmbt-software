/**
 * Expected business errors. Messages are safe to show to users and never contain
 * personal information (POPIA): log the `code` and ids, not the message context.
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;
}

/** Someone else booked an overlapping time first (Postgres exclusion constraint 23P01). */
export class SlotTakenError extends DomainError {
  readonly code = "slot_taken";
  constructor() {
    super("Sorry, that time was just taken, please pick another.");
  }
}

/** The requested time isn't bookable: closed, time off, too soon or too far ahead, off-step. */
export class SlotUnavailableError extends DomainError {
  readonly code = "slot_unavailable";
  constructor() {
    super("Sorry, that time isn't available, please pick another.");
  }
}

export class NotFoundError extends DomainError {
  readonly code = "not_found";
  constructor(
    readonly entity: "appointment" | "client" | "pet" | "service" | "product" | "time off",
  ) {
    super(`That ${entity} could not be found.`);
  }
}

/** The appointment isn't in a status that allows this action (e.g. marking a cancelled booking done). */
export class InvalidStatusError extends DomainError {
  readonly code = "invalid_status";
  constructor(
    readonly status: string,
    readonly action: string,
  ) {
    super(`This booking is ${status.replace("_", "-")} and can't be ${action}.`);
  }
}

/** Clients can only cancel online until `cancel_cutoff_hours` before the start. */
export class CancelTooLateError extends DomainError {
  readonly code = "cancel_too_late";
  constructor(readonly cutoffHours: number) {
    super(
      `Bookings can only be cancelled online up to ${cutoffHours} hours before. Please phone us instead.`,
    );
  }
}

/** Public spam guard: the client already has the maximum number of upcoming bookings. */
export class TooManyBookingsError extends DomainError {
  readonly code = "too_many_bookings";
  constructor(readonly max: number) {
    super(
      `You already have ${max} upcoming bookings with us. Please phone us if you'd like to book more.`,
    );
  }
}

/** The booking request is inconsistent, e.g. an animal service without a pet. */
export class InvalidBookingError extends DomainError {
  readonly code = "invalid_booking";
}

/** A time-off block that can't be added, e.g. one that has already passed. */
export class InvalidTimeOffError extends DomainError {
  readonly code = "invalid_time_off";
}

/** Another current client already has this phone number (no names in the message). */
export class PhoneInUseError extends DomainError {
  readonly code = "phone_in_use";
  constructor() {
    super("Another client already has this phone number.");
  }
}

/** Settings row missing: run `pnpm db:seed`. */
export class SettingsMissingError extends Error {
  constructor() {
    super("Settings row missing; run `pnpm db:seed`.");
  }
}
