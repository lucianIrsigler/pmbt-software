import { expect, test, type Page } from "@playwright/test";
import { seedTodayAppointment, signIn } from "./helpers";

/**
 * Admin area. Each test that changes shared settings puts them back, so the other specs
 * (which book real slots) are unaffected.
 */

test.describe.configure({ mode: "serial" });

const TZ = "Africa/Johannesburg";

function today(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

/** The first date at least `minDays` after today that falls on `weekday` (0 = Sunday). */
function nextWeekday(minDays: number, weekday: number): string {
  const [y, m, d] = today().split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d + minDays));
  while (date.getUTCDay() !== weekday) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function longDate(date: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(`${date}T12:00:00Z`));
}

async function editService(page: Page, name: string): Promise<void> {
  await page.goto("/admin/services");
  await page.getByRole("link", { name: `Edit ${name}` }).click();
  await expect(page.getByRole("heading", { level: 1, name: `Edit ${name}` })).toBeVisible();
}

test("dashboard and bookings show the numbers, and the CSV downloads", async ({
  page,
  request,
}) => {
  await seedTodayAppointment({ clientName: "Admin Viewer", phone: "+27824440000", hour: 9 });
  await signIn(page, "/admin");

  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Bookings" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Estimated revenue" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Busiest weekdays (visits)" })).toContainText(
    "Monday",
  );
  await page.getByRole("link", { name: "Last 3 months" }).click();
  await expect(page.getByRole("link", { name: "Last 3 months" })).toHaveAttribute(
    "aria-current",
    "true",
  );

  await page
    .getByRole("navigation", { name: "Admin" })
    .getByRole("link", { name: "Bookings" })
    .click();
  await expect(page.getByRole("heading", { level: 1, name: "Bookings" })).toBeVisible();
  await expect(page.getByRole("table")).toContainText("Admin Viewer");
  await page.getByLabel("Status").selectOption("cancelled");
  await page.getByRole("button", { name: "Filter" }).click();
  await expect(page.getByRole("table")).toHaveCount(0);

  // The CSV, with the login; and refused without it.
  const csv = await page.request.get("/admin/bookings.csv?range=this-month");
  expect(csv.ok()).toBe(true);
  expect(csv.headers()["content-type"]).toContain("text/csv");
  expect(csv.headers()["cache-control"]).toContain("no-store");
  const body = await csv.text();
  expect(body.replace(/^﻿/, "").startsWith("Date,Time,Client,Phone")).toBe(true);
  expect(body).toContain("Admin Viewer");
  // Without a login: sent to the sign-in page, no data.
  const anonymous = await request.get("/admin/bookings.csv", { maxRedirects: 0 });
  expect(anonymous.status()).toBe(307);
  expect(anonymous.headers()["location"]).toContain("/login");
});

test("a new price shows on the website; prices are checked", async ({ page }) => {
  const name = "PBMT session (30 min)";
  await signIn(page, "/admin");
  await editService(page, name);
  const price = page.getByLabel("Price (R)");
  const original = await price.inputValue();

  await price.fill("abc");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Please enter a price in rands")).toBeVisible();

  await price.fill("475");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Saved ✓")).toBeVisible();
  await expect(
    page.getByRole("row", { name: new RegExp(name.replace(/[()]/g, "\\$&")) }),
  ).toContainText("R475");

  await page.goto("/services");
  await expect(page.getByRole("main")).toContainText("R475");

  // Put it back.
  await editService(page, name);
  await page.getByLabel("Price (R)").fill(original);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Saved ✓")).toBeVisible();
});

test("a new service can be offered, then hidden from booking", async ({ page }) => {
  await signIn(page, "/admin");
  await page.goto("/admin/services");
  await page.getByRole("link", { name: "Add service" }).click();
  await page.getByLabel("Name").fill("E2E hidden service");
  await page.getByLabel("Price (R)").fill("300");
  await page.getByRole("button", { name: "Add service" }).click();
  await expect(page.getByText("Saved ✓")).toBeVisible();

  await page.goto("/book");
  await expect(page.getByRole("link", { name: /E2E hidden service/ })).toBeVisible();

  await editService(page, "E2E hidden service");
  await page.getByLabel(/^Offered/).uncheck();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("row", { name: /E2E hidden service/ })).toContainText("Hidden");

  await page.goto("/book");
  await expect(page.getByRole("heading", { name: "Choose a service" })).toBeVisible();
  await expect(page.getByRole("link", { name: /E2E hidden service/ })).toHaveCount(0);
});

test("closing Saturdays stops Saturday bookings; overlapping hours are refused", async ({
  page,
}) => {
  const saturday = nextWeekday(3, 6);
  await signIn(page, "/admin");
  await page.goto("/book");
  await page.getByRole("link", { name: /PBMT session \(30 min\)/ }).click();
  await expect(page.getByRole("heading", { name: "Choose a date" })).toBeVisible();
  const serviceId = new URL(page.url()).searchParams.get("service") ?? "";
  const publicMonth = `/book?service=${serviceId}&month=${saturday.slice(0, 7)}`;
  await page.goto(publicMonth);
  await expect(page.getByRole("link", { name: longDate(saturday), exact: true })).toBeVisible();

  await page.goto("/admin/hours");
  const saturdayCard = page.getByRole("region", { name: "Saturday" });

  // An overlapping block is refused.
  await saturdayCard.getByText("Add more hours on Saturday").click();
  await saturdayCard.getByLabel("Opens").last().fill("10:00");
  await saturdayCard.getByLabel("Closes").last().fill("12:00");
  await saturdayCard.getByRole("button", { name: "Add" }).click();
  await expect(
    saturdayCard.getByText("These hours overlap other hours on the same day."),
  ).toBeVisible();

  // Close Saturdays.
  await saturdayCard.getByRole("button", { name: "Remove Saturday 09:00–13:00" }).click();
  await expect(saturdayCard.getByText("Closed.")).toBeVisible();
  await page.goto(publicMonth);
  await expect(page.getByLabel(`${longDate(saturday)}, not available`)).toBeVisible();

  // Open again.
  await page.goto("/admin/hours");
  await saturdayCard.getByText("Open on Saturday").click();
  await saturdayCard.getByLabel("Opens").fill("09:00");
  await saturdayCard.getByLabel("Closes").fill("13:00");
  await saturdayCard.getByRole("button", { name: "Add" }).click();
  await expect(page.getByText("Saved ✓")).toBeVisible();
  await page.goto(publicMonth);
  await expect(page.getByRole("link", { name: longDate(saturday), exact: true })).toBeVisible();
});

test("settings: business details show on the website", async ({ page }) => {
  await signIn(page, "/admin");
  await page.goto("/admin/settings");
  const phone = page.getByLabel("Contact phone (optional)");
  const original = await phone.inputValue();
  await phone.fill("011 555 0123");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Saved ✓")).toBeVisible();
  await page.goto("/");
  await expect(page.getByRole("contentinfo")).toContainText("011 555 0123");

  await page.goto("/admin/settings");
  await page.getByLabel("Slot step (minutes)").selectOption("15");
  await page.getByLabel("Business name").fill("");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Please enter the business name")).toBeVisible();

  // Put it back.
  await page.goto("/admin/settings");
  await page.getByLabel("Contact phone (optional)").fill(original);
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Saved ✓")).toBeVisible();
});
