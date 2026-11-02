import { describe, expect, it } from "vitest";
import { CANCEL_GRACE_MINUTES, canClientCancel, cancelDeadline } from "./booking";

const HOUR = 3_600_000;
const start = new Date("2030-03-04T07:00:00Z");
const at = (msBeforeStart: number): Date => new Date(start.getTime() - msBeforeStart);

describe("client cancel window (24 h cutoff, 1 h grace)", () => {
  it("uses the cutoff for bookings made well in advance", () => {
    const createdAt = at(7 * 24 * HOUR);
    expect(cancelDeadline(start, createdAt, 24)).toEqual(at(24 * HOUR));
    expect(canClientCancel({ start, createdAt }, at(24 * HOUR), 24)).toBe(true);
    expect(canClientCancel({ start, createdAt }, at(24 * HOUR - 1), 24)).toBe(false);
  });

  it("allows cancelling for an hour after a late booking", () => {
    const createdAt = at(14 * HOUR); // booked tonight for tomorrow morning
    const deadline = cancelDeadline(start, createdAt, 24);
    expect(deadline).toEqual(new Date(createdAt.getTime() + CANCEL_GRACE_MINUTES * 60_000));
    expect(
      canClientCancel({ start, createdAt }, new Date(createdAt.getTime() + 59 * 60_000), 24),
    ).toBe(true);
    expect(canClientCancel({ start, createdAt }, new Date(deadline.getTime() + 1), 24)).toBe(false);
  });

  it("never allows cancelling once the session has started", () => {
    const createdAt = at(20 * 60_000); // booked by the owner 20 minutes before
    expect(cancelDeadline(start, createdAt, 24)).toEqual(start);
    expect(canClientCancel({ start, createdAt }, at(1), 24)).toBe(true);
    expect(canClientCancel({ start, createdAt }, start, 24)).toBe(false);
  });

  it("with a zero cutoff, allows cancelling until the start", () => {
    const createdAt = at(7 * 24 * HOUR);
    expect(canClientCancel({ start, createdAt }, at(1), 0)).toBe(true);
    expect(canClientCancel({ start, createdAt }, start, 0)).toBe(false);
  });
});
