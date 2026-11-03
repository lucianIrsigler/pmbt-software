import { expect, test, type Page } from "@playwright/test";
import { waitForEmail } from "./outbox";

/**
 * Public booking flow on a phone-sized screen, against a freshly seeded database.
 * Dates depend on the real clock, so we always pick the first available day and time.
 */

/**
 * Picks the first free day and time. With `nextMonth`, picks a day in next month, which is
 * always more than the 24-hour cancel cutoff away (and within the 42-day horizon).
 */
async function chooseFirstDateAndTime(page: Page, { nextMonth = false } = {}): Promise<void> {
  await expect(page.getByRole("heading", { name: "Choose a date" })).toBeVisible();
  const calendar = page.getByRole("main").locator("ol").first();
  // Late in the month there may be nothing left; move on to next month.
  if (nextMonth || (await calendar.getByRole("link").count()) === 0) {
    const heading = await page.getByRole("main").getByRole("heading", { level: 2 }).textContent();
    await page.getByRole("link", { name: "Next →" }).click();
    await expect(page.getByRole("main").getByRole("heading", { level: 2 })).not.toHaveText(
      heading ?? "",
    );
  }
  await calendar.getByRole("link").first().click();

  await expect(page.getByRole("heading", { name: "Choose a time" })).toBeVisible();
  await page.getByRole("main").getByRole("listitem").getByRole("link").first().click();
  await expect(page.getByRole("heading", { name: "Your details" })).toBeVisible();
}

async function fillClient(page: Page, name: string, phone: string): Promise<void> {
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("Phone number").fill(phone);
  await page.getByLabel("Email (optional)").fill("client@example.com");
}

async function confirm(page: Page): Promise<string> {
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Confirm booking" }).click();
  await expect(page.getByRole("heading", { name: "You're booked!" })).toBeVisible();
  await expect(page.getByText("Keep this link")).toBeVisible();
  return new URL(page.url()).pathname;
}

test.describe.configure({ mode: "serial" });

let humanBookingPath = "";

test("book a service for a person", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Book now" }).click();

  await expect(page.getByRole("heading", { name: "Choose a service" })).toBeVisible();
  await page.getByRole("link", { name: /PBMT session \(30 min\)/ }).click();
  await chooseFirstDateAndTime(page, { nextMonth: true });

  // Validation errors keep what was typed.
  await page.getByLabel("Your name").fill("Thandi Test");
  await page.getByLabel("Phone number").fill("123");
  await page.getByRole("button", { name: "Confirm booking" }).click();
  await expect(page.getByText("Please enter a valid phone number")).toBeVisible();
  await expect(page.getByText("Please tick the box")).toBeVisible();
  await expect(page.getByLabel("Your name")).toHaveValue("Thandi Test");

  await fillClient(page, "Thandi Test", "082 100 0001");
  humanBookingPath = await confirm(page);

  const details = page.getByRole("main").locator("dl");
  await expect(details).toContainText("PBMT session (30 min)");
  await expect(details).toContainText("Thandi Test");
  await expect(page.getByRole("link", { name: "Add to calendar" })).toBeVisible();

  // A confirmation email with the private link and a calendar file.
  const email = await waitForEmail(
    (e) => e.subject.startsWith("Your booking on") && e.text.includes(humanBookingPath),
  );
  expect(email.to).toBe("client@example.com");
  expect(email.text).toContain("Hi Thandi,");
  expect(email.text).toContain("What: PBMT session (30 min)");
  expect(email.html).toContain(humanBookingPath);
  const [ics] = email.attachments ?? [];
  expect(ics?.filename).toBe("booking.ics");
  expect(ics?.content).toContain("STATUS:CONFIRMED");
});

test("book a service for an animal", async ({ page }) => {
  await page.goto("/services");
  await expect(page.getByRole("heading", { name: "For your animals" })).toBeVisible();
  await page.goto("/book");
  await page.getByRole("link", { name: /Dog PBMT session \(small or medium dog\)/ }).click();
  await chooseFirstDateAndTime(page);

  await fillClient(page, "Pieter Test", "+27 82 100 0002");
  await page.getByLabel("Name", { exact: true }).fill("Bella");
  await page.getByLabel("Species").fill("Dog");
  await page.getByLabel("Breed (optional)").fill("Labrador");
  await confirm(page);

  const details = page.getByRole("main").locator("dl");
  await expect(details).toContainText("Dog PBMT session (small or medium dog)");
  await expect(details).toContainText("Bella");
});

test("add to calendar and cancel via the private link", async ({ page, request }) => {
  expect(humanBookingPath).toMatch(/^\/booking\/[A-Za-z0-9_-]{43}$/);

  const ics = await request.get(`${humanBookingPath}/calendar.ics`);
  expect(ics.headers()["content-type"]).toContain("text/calendar");
  const body = await ics.text();
  expect(body).toContain("BEGIN:VEVENT");
  expect(body).toMatch(/DTSTART:\d{8}T\d{6}Z/);

  await page.goto(humanBookingPath);
  await expect(page.getByRole("heading", { name: "Your booking" })).toBeVisible();
  await page.getByRole("link", { name: "Cancel booking" }).click();
  await expect(page.getByText("Are you sure you want to cancel this booking?")).toBeVisible();

  // "No" keeps it.
  await page.getByRole("link", { name: "No, keep it" }).click();
  await expect(page.getByRole("link", { name: "Cancel booking" })).toBeVisible();

  await page.getByRole("link", { name: "Cancel booking" }).click();
  await page.getByRole("button", { name: "Yes, cancel it" }).click();
  await expect(page.getByText("Your booking has been cancelled.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Cancel booking" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Add to calendar" })).toHaveCount(0);

  // A cancellation email whose calendar file removes the event.
  const email = await waitForEmail(
    (e) => e.subject.endsWith("is cancelled") && e.to === "client@example.com",
  );
  expect(email.text).toContain("has been cancelled");
  expect(email.attachments?.[0]?.content).toContain("STATUS:CANCELLED");
});

test("unknown booking links show a friendly not-found page", async ({ page }) => {
  const response = await page.goto(`/booking/${"x".repeat(43)}`);
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
});

test("someone else takes the slot first: back to step 3 with a message", async ({ browser }) => {
  const first = await browser.newPage();
  await first.goto("/book");
  await first.getByRole("link", { name: /PBMT session \(60 min\)/ }).click();
  await chooseFirstDateAndTime(first, { nextMonth: true });

  // A second visitor opens the same time before the first one confirms.
  const second = await browser.newPage();
  await second.goto(first.url());
  await expect(second.getByRole("heading", { name: "Your details" })).toBeVisible();

  await fillClient(first, "First Visitor", "082 100 0003");
  await confirm(first);

  await fillClient(second, "Second Visitor", "082 100 0004");
  await second.getByRole("checkbox").check();
  await second.getByRole("button", { name: "Confirm booking" }).click();
  await expect(second.getByRole("heading", { name: "Choose a time" })).toBeVisible();
  await expect(
    second.getByText("Sorry, that time was just taken, please pick another."),
  ).toBeVisible();
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("the whole booking flow still works", async ({ page }) => {
    await page.goto("/book");
    await page.getByRole("link", { name: /First visit/ }).click();
    await chooseFirstDateAndTime(page, { nextMonth: true });
    await fillClient(page, "No Script", "082 100 0005");
    await confirm(page);
  });
});
