import { describe, expect, it } from "vitest";
import {
  addProductSchema,
  createBookingSchema,
  localDateSchema,
  manageTokenSchema,
  newClientSchema,
  newPetSchema,
} from "./schemas";

const SERVICE_ID = "6f1c2a4e-8b3d-4c5e-9f0a-1b2c3d4e5f60";

describe("newClientSchema", () => {
  it("trims, normalises the phone and lower-cases the email", () => {
    expect(
      newClientSchema.parse({
        name: "  Thandi  ",
        phone: "082 123 4567",
        email: " T@Example.COM ",
      }),
    ).toEqual({ name: "Thandi", phone: "+27821234567", email: "t@example.com" });
  });

  it("treats a blank email as none", () => {
    expect(newClientSchema.parse({ name: "A", phone: "0821234567", email: "" }).email).toBe(
      undefined,
    );
  });

  it("gives friendly messages", () => {
    const result = newClientSchema.safeParse({ name: " ", phone: "123", email: "nope" });
    expect(result.success).toBe(false);
    const messages = result.error?.issues.map((i) => i.message);
    expect(messages).toEqual(
      expect.arrayContaining([
        "Please enter your name",
        "Please enter a valid phone number",
        "Please enter a valid email address",
      ]),
    );
  });
});

describe("newPetSchema", () => {
  it("makes a blank breed undefined", () => {
    expect(newPetSchema.parse({ name: "Rex", species: "Dog", breed: " " })).toEqual({
      name: "Rex",
      species: "Dog",
    });
  });
});

describe("createBookingSchema", () => {
  const base = {
    serviceId: SERVICE_ID,
    start: "2030-03-04T07:00:00.000Z",
    client: { name: "Thandi", phone: "0821234567" },
    source: "web",
  } as const;

  it("accepts a new client and coerces the start to a Date", () => {
    const parsed = createBookingSchema.parse(base);
    expect(parsed.start).toEqual(new Date("2030-03-04T07:00:00.000Z"));
    expect(parsed.client).toEqual({ name: "Thandi", phone: "+27821234567" });
  });

  it("accepts an existing client and pet by id", () => {
    const parsed = createBookingSchema.parse({
      ...base,
      client: { id: SERVICE_ID },
      pet: { id: SERVICE_ID },
      source: "app",
    });
    expect(parsed.client).toEqual({ id: SERVICE_ID });
  });

  it("rejects unknown fields and bad sources", () => {
    expect(createBookingSchema.safeParse({ ...base, status: "done" }).success).toBe(false);
    expect(createBookingSchema.safeParse({ ...base, source: "phone" }).success).toBe(false);
  });
});

describe("small schemas", () => {
  it("validates calendar dates", () => {
    expect(localDateSchema.safeParse("2030-02-28").success).toBe(true);
    expect(localDateSchema.safeParse("2030-02-30").success).toBe(false);
    expect(localDateSchema.safeParse("30-02-2030").success).toBe(false);
  });

  it("validates manage tokens", () => {
    expect(manageTokenSchema.safeParse("a".repeat(43)).success).toBe(true);
    expect(manageTokenSchema.safeParse("a".repeat(42)).success).toBe(false);
    expect(manageTokenSchema.safeParse(`${"a".repeat(42)}/`).success).toBe(false);
  });

  it("defaults product qty to 1 and limits it", () => {
    const ids = { appointmentId: SERVICE_ID, productId: SERVICE_ID };
    expect(addProductSchema.parse(ids).qty).toBe(1);
    expect(addProductSchema.safeParse({ ...ids, qty: 0 }).success).toBe(false);
  });
});
