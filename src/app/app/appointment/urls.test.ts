import { describe, expect, it } from "vitest";
import { appointmentBackLink, appointmentUrl } from "./urls";

const ID = "8f6c2c1e-1d2b-4c1a-9a51-0d6c1f3b2a10";
const CLIENT = { id: "c0ffee00-0000-4000-8000-000000000001", name: "Jane Doe" };

describe("appointmentUrl", () => {
  it("links plainly by default", () => {
    expect(appointmentUrl(ID)).toBe(`/app/appointment/${ID}`);
  });

  it("remembers the calendar day or the client page", () => {
    expect(appointmentUrl(ID, { calendar: "2030-03-04" })).toBe(
      `/app/appointment/${ID}?from=calendar&date=2030-03-04`,
    );
    expect(appointmentUrl(ID, "client")).toBe(`/app/appointment/${ID}?from=client`);
  });
});

describe("appointmentBackLink", () => {
  it("goes back to Today by default", () => {
    expect(appointmentBackLink({}, CLIENT)).toEqual({ href: "/app", label: "Today" });
  });

  it("goes back to the calendar day it came from", () => {
    expect(appointmentBackLink({ from: "calendar", date: "2030-03-04" }, CLIENT)).toEqual({
      href: "/app/calendar?date=2030-03-04",
      label: "Calendar",
    });
  });

  it("goes back to the appointment's own client", () => {
    expect(appointmentBackLink({ from: "client" }, CLIENT)).toEqual({
      href: `/app/clients/${CLIENT.id}`,
      label: "Jane Doe",
    });
  });

  it("ignores anything it doesn't recognise", () => {
    const today = { href: "/app", label: "Today" };
    expect(appointmentBackLink({ from: "calendar", date: "//evil.example" }, CLIENT)).toEqual(
      today,
    );
    expect(appointmentBackLink({ from: "calendar", date: "2030-02-30" }, CLIENT)).toEqual(today);
    expect(appointmentBackLink({ from: "https://evil.example" }, CLIENT)).toEqual(today);
  });
});
