import { expect, test, type Page } from "@playwright/test";
import { longDate, nextWeekday } from "./dates";
import { signIn } from "./helpers";

/**
 * Owner calendar on a phone-sized screen (one day at a time). Dates depend on the real
 * clock, so we pick weekdays a few weeks ahead, inside the public booking horizon.
 */

async function openDay(page: Page, date: string): Promise<void> {
  await page.goto(`/app/calendar?date=${date}`);
  await expect(page.getByRole("heading", { level: 2, name: longDate(date) })).toBeVisible();
}

test.describe.configure({ mode: "serial" });

test("add a phone booking for a new client, then for the same client found by search", async ({
  page,
}) => {
  const date = nextWeekday(14, 4); // a Thursday at least two weeks ahead
  await signIn(page);
  await page.getByRole("link", { name: "Calendar", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Calendar" })).toBeVisible();
  await openDay(page, date);

  const tenOClock = page.getByRole("link", { name: /^10:00 Free/ });
  const box = await tenOClock.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(48);
  await tenOClock.click();

  // Step 1: new client
  await expect(page.getByRole("heading", { name: "New booking" })).toBeVisible();
  await expect(page.getByText(`${longDate(date)} at 10:00`)).toBeVisible();
  await page.getByRole("link", { name: "New client" }).click();
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page.getByText("Please enter the client's name")).toBeVisible();
  await page.getByLabel("Name").fill("Nomsa Phonecall");
  await page.getByLabel("Phone number").fill("082 765 4321");
  await page.getByRole("button", { name: "Save and continue" }).click();

  // Step 2: the client themself
  await expect(page.getByRole("heading", { name: "Who is being treated?" })).toBeVisible();
  await page.getByRole("link", { name: "Nomsa Phonecall (the person)" }).click();

  // Step 3: only human services, and only ones that fit
  await expect(page.getByRole("heading", { name: "Choose a service" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Dog PBMT/ })).toHaveCount(0);
  await page.getByRole("link", { name: /PBMT session \(30 min\)/ }).click();

  // Step 4: confirm
  await expect(page.getByRole("heading", { name: "Check and book" })).toBeVisible();
  await expect(page.getByText("Nomsa Phonecall · 082 765 4321")).toBeVisible();
  await page.getByRole("button", { name: "Book it" }).click();

  await expect(page.getByText("Booked ✓")).toBeVisible();
  const booking = page.getByRole("link", { name: /10:00\s*Nomsa Phonecall/ });
  await expect(booking).toBeVisible();
  await expect(page.getByRole("link", { name: /^10:00 Free/ })).toHaveCount(0);

  // A second booking the same day, finding her by phone number.
  await page.getByRole("link", { name: /^11:00 Free/ }).click();
  await page.getByLabel("Find a client by name or phone").fill("0827654");
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByRole("link", { name: /Nomsa Phonecall/ }).click();
  await page.getByRole("link", { name: "Nomsa Phonecall (the person)" }).click();
  await page.getByRole("link", { name: /PBMT session \(30 min\)/ }).click();
  await page.getByRole("button", { name: "Book it" }).click();
  await expect(page.getByText("Booked ✓")).toBeVisible();
  await expect(page.getByRole("link", { name: /11:00\s*Nomsa Phonecall/ })).toBeVisible();

  // Tapping a booking opens its detail page.
  await booking.click();
  await expect(page.getByRole("link", { name: /Call Nomsa/ })).toBeVisible();
});

test("block a whole day: it disappears from the public booking page until removed", async ({
  page,
}) => {
  const date = nextWeekday(21, 3); // a Wednesday three weeks ahead (horizon is 42 days)
  const month = date.slice(0, 7);
  const day = longDate(date);

  // Public site: the day is bookable to start with.
  await page.goto("/book");
  await page.getByRole("link", { name: /PBMT session \(30 min\)/ }).click();
  await expect(page.getByRole("heading", { name: "Choose a date" })).toBeVisible();
  const serviceId = new URL(page.url()).searchParams.get("service") ?? "";
  const publicMonth = `/book?service=${serviceId}&month=${month}`;
  await page.goto(publicMonth);
  await expect(page.getByRole("link", { name: day, exact: true })).toBeVisible();

  // Owner blocks the day.
  await signIn(page);
  await openDay(page, date);
  await page.getByRole("link", { name: "Block time" }).click();
  await expect(page.getByRole("heading", { name: "Block time" })).toBeVisible();
  await expect(page.getByLabel("Which day?")).toHaveValue(date);
  await page.getByLabel("Reason (optional)").fill("Family visit");
  await page.getByRole("button", { name: "Block this day" }).click();

  await expect(page.getByText("Blocked ✓")).toBeVisible();
  const upcoming = page.getByRole("region", { name: "Blocked times coming up" });
  await expect(upcoming).toContainText(`${day}, whole day`);
  await expect(upcoming).toContainText("Family visit");

  // The calendar shows it as Away, with nothing free.
  await page.getByRole("link", { name: "← Calendar" }).click();
  const column = page.getByRole("region", { name: day });
  await expect(column.getByText("Away", { exact: true })).toBeVisible();
  await expect(column.getByText("Family visit")).toBeVisible();
  await expect(page.getByRole("link", { name: /Free/ })).toHaveCount(0);

  // Public site: no longer bookable.
  await page.goto(publicMonth);
  await expect(page.getByLabel(`${day}, not available`)).toBeVisible();

  // Remove the block (with confirmation) and the day comes back.
  await page.goto(`/app/calendar/away?date=${date}`);
  const block = upcoming.getByRole("listitem").filter({ hasText: "Family visit" });
  await block.getByRole("button", { name: "Remove" }).click();
  await expect(block.getByText(/Remove this block\?/)).toBeVisible();
  await block.getByRole("button", { name: "Yes, remove" }).click();
  await expect(upcoming.getByText("Family visit")).toHaveCount(0);

  await page.goto(publicMonth);
  await expect(page.getByRole("link", { name: day, exact: true })).toBeVisible();
});

test("part of a day can be blocked, and the end must be after the start", async ({ page }) => {
  const date = nextWeekday(14, 5); // a Friday
  await signIn(page);
  await page.goto(`/app/calendar/away?date=${date}`);
  await page.getByRole("button", { name: "Part of the day" }).click();
  await page.getByLabel("From").fill("14:00");
  await page.getByLabel("To").fill("13:00");
  await page.getByRole("button", { name: "Block this time" }).click();
  await expect(page.getByText("The end time must be after the start time")).toBeVisible();
  // What she chose and typed is kept after the error.
  await expect(page.getByRole("button", { name: /Part of the day/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByLabel("From")).toHaveValue("14:00");

  await page.getByLabel("To").fill("16:00");
  await page.getByRole("button", { name: "Block this time" }).click();
  await expect(page.getByText("Blocked ✓")).toBeVisible();

  await openDay(page, date);
  const column = page.getByRole("region", { name: longDate(date) });
  await expect(column.getByText("Away", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /^13:30 Free/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /^14:00 Free/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /^16:00 Free/ })).toBeVisible();
});
