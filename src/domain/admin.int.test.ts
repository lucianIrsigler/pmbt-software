import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Database } from "@/db/client";
import { seed } from "@/db/seed";
import { testDatabaseUrl } from "@/test/database";
import { resetBusinessTables } from "@/test/reset";
import {
  addHours,
  createProduct,
  createService,
  createTestimonial,
  getService,
  getTestimonial,
  HoursOverlapError,
  listAllServices,
  listAllTestimonials,
  listHours,
  removeHours,
  updateHours,
  updateService,
  updateSettings,
  updateTestimonial,
} from "./admin";
import { findSlots, loadSettings } from "./availability";
import { listActiveProducts, listActiveServices, listActiveTestimonials } from "./catalogue";

const TZ = "Africa/Johannesburg";
const clock = { tz: TZ, now: new Date("2030-03-01T06:00:00Z") };

let db: Database;

const serviceForm = {
  name: "Senior dog session",
  description: "Gentle session for older dogs",
  forKind: "animal",
  durationMin: "45",
  bufferMin: "15",
  priceCents: "520.50",
  sortOrder: "10",
  active: "on",
};

beforeAll(async () => {
  db = createDb(testDatabaseUrl(), { max: 2 });
  await resetBusinessTables(db);
  await seed(db);
});

afterAll(async () => {
  await db.$client.end();
});

describe("services", () => {
  it("adds a service from form text", async () => {
    const id = await createService(db, serviceForm);
    expect(await getService(db, id)).toMatchObject({
      name: "Senior dog session",
      forKind: "animal",
      durationMin: 45,
      bufferMin: 15,
      priceCents: 52_050,
      sortOrder: 10,
      active: true,
    });
  });

  it("hides a service: kept, but not offered for booking", async () => {
    const id = await createService(db, { ...serviceForm, name: "To hide" });
    await updateService(db, id, { ...serviceForm, name: "To hide", active: undefined });
    expect((await getService(db, id))?.active).toBe(false);
    expect((await listActiveServices(db)).map((s) => s.id)).not.toContain(id);
    expect((await listAllServices(db)).map((s) => s.id)).toContain(id);
  });

  it("rejects invalid input with friendly messages", async () => {
    await expect(
      createService(db, { ...serviceForm, name: " ", durationMin: "0", priceCents: "abc" }),
    ).rejects.toMatchObject({
      issues: expect.arrayContaining([
        expect.objectContaining({ path: ["name"], message: "Please enter a name" }),
        expect.objectContaining({ path: ["durationMin"], message: "At least 5" }),
        expect.objectContaining({ path: ["priceCents"] }),
      ]),
    });
  });
});

describe("products", () => {
  it("adds a product, hidden ones aren't listed as active", async () => {
    const id = await createProduct(db, {
      name: "Calming spray",
      description: "",
      priceCents: "95",
      sortOrder: "0",
    });
    expect((await listActiveProducts(db)).map((p) => p.id)).not.toContain(id); // not ticked
  });
});

describe("testimonials", () => {
  const form = { quote: "Rex walks easily again.", author: "Sam, with Rex", sortOrder: "5" };

  it("adds testimonials and lists the shown ones in order", async () => {
    const later = await createTestimonial(db, { ...form, active: "on" });
    const first = await createTestimonial(db, {
      ...form,
      author: "Ann",
      sortOrder: "1",
      active: "on",
    });
    expect(await getTestimonial(db, later)).toMatchObject({
      quote: "Rex walks easily again.",
      author: "Sam, with Rex",
      sortOrder: 5,
      active: true,
    });
    const shown = (await listActiveTestimonials(db)).map((t) => t.id);
    expect(shown.indexOf(first)).toBeLessThan(shown.indexOf(later));
  });

  it("hides a testimonial: kept, but not on the website", async () => {
    const id = await createTestimonial(db, { ...form, active: "on" });
    await updateTestimonial(db, id, { ...form, quote: "Edited.", active: undefined });
    expect(await getTestimonial(db, id)).toMatchObject({ quote: "Edited.", active: false });
    expect((await listActiveTestimonials(db)).map((t) => t.id)).not.toContain(id);
    expect((await listAllTestimonials(db)).map((t) => t.id)).toContain(id);
  });

  it("requires a quote and who said it", async () => {
    await expect(createTestimonial(db, { ...form, quote: " ", author: "" })).rejects.toMatchObject({
      issues: expect.arrayContaining([
        expect.objectContaining({ path: ["quote"], message: "Please enter the quote" }),
        expect.objectContaining({ path: ["author"], message: "Please enter who said it" }),
      ]),
    });
  });

  it("treats a malformed id as not found", async () => {
    expect(await getTestimonial(db, "not-a-uuid")).toBeNull();
  });
});

describe("working hours", () => {
  it("adds, refuses overlaps, edits and removes, and booking follows", async () => {
    const sunday = "2030-03-03";
    const human = (await listActiveServices(db, "human"))[0];
    if (!human) throw new Error("seed missing");
    expect(await findSlots(db, { serviceId: human.id, date: sunday }, clock)).toEqual([]);

    const id = await addHours(db, { weekday: "0", startTime: "10:00", endTime: "12:00" });
    expect(
      (await findSlots(db, { serviceId: human.id, date: sunday }, clock)).length,
    ).toBeGreaterThan(0);

    await expect(
      addHours(db, { weekday: "0", startTime: "11:00", endTime: "13:00" }),
    ).rejects.toBeInstanceOf(HoursOverlapError);
    // Touching blocks don't overlap.
    const afternoon = await addHours(db, { weekday: "0", startTime: "12:00", endTime: "14:00" });
    await expect(
      updateHours(db, afternoon, { weekday: "0", startTime: "11:30", endTime: "14:00" }),
    ).rejects.toBeInstanceOf(HoursOverlapError);
    await updateHours(db, id, { weekday: "0", startTime: "09:00", endTime: "12:00" });

    const sundayHours = (await listHours(db)).filter((h) => h.weekday === 0);
    expect(sundayHours.map((h) => [h.startTime, h.endTime])).toEqual([
      ["09:00", "12:00"],
      ["12:00", "14:00"],
    ]);

    await removeHours(db, id);
    await removeHours(db, afternoon);
    expect(await findSlots(db, { serviceId: human.id, date: sunday }, clock)).toEqual([]);
  });

  it("needs the closing time after the opening time", async () => {
    await expect(
      addHours(db, { weekday: "1", startTime: "12:00", endTime: "09:00" }),
    ).rejects.toMatchObject({
      issues: [expect.objectContaining({ path: ["endTime"] })],
    });
  });
});

describe("settings", () => {
  it("saves business details and booking rules", async () => {
    await updateSettings(db, {
      businessName: "Healing Paws",
      contactPhone: "082 123 4567",
      contactEmail: "Hello@Example.co.za",
      address: "",
      minNoticeHours: "2",
      maxDaysAhead: "60",
      slotStepMin: "15",
      cancelCutoffHours: "12",
    });
    expect(await loadSettings(db)).toMatchObject({
      businessName: "Healing Paws",
      contactPhone: "082 123 4567",
      contactEmail: "hello@example.co.za",
      address: null,
      minNoticeHours: 2,
      maxDaysAhead: 60,
      slotStepMin: 15,
      cancelCutoffHours: 12,
    });
  });

  it("refuses an odd slot step", async () => {
    await expect(
      updateSettings(db, {
        businessName: "X",
        contactPhone: "",
        contactEmail: "",
        address: "",
        minNoticeHours: "2",
        maxDaysAhead: "60",
        slotStepMin: "25",
        cancelCutoffHours: "12",
      }),
    ).rejects.toMatchObject({ issues: [expect.objectContaining({ path: ["slotStepMin"] })] });
  });
});
