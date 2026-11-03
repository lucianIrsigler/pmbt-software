import { expect, test } from "@playwright/test";
import { seedTodayAppointment, signIn } from "./helpers";
import { waitForEmail } from "./outbox";

test.describe.configure({ mode: "serial" });

test("a full day: see today's bookings, take notes, sell a product, mark done", async ({
  page,
}) => {
  await seedTodayAppointment({
    clientName: "Margaret Owner",
    phone: "+27821112233",
    hour: 6,
    clientNotes: "Hard of hearing, speak clearly",
    lastVisitNotes: "Left shoulder, 8 min\nFeeling better",
  });
  await signIn(page);

  // Today
  const weekday = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Johannesburg",
    weekday: "long",
  }).format(new Date());
  await expect(page.getByRole("heading", { level: 1 })).toContainText(weekday);
  const tabs = page.getByRole("navigation", { name: "Main" });
  await expect(tabs.getByRole("link")).toHaveText(["Today", "Calendar", "Clients"]);
  await page.getByRole("link", { name: /Margaret Owner/ }).click();

  // Detail
  await expect(page.getByRole("heading", { level: 1 })).toContainText("06:00");
  await expect(page.getByRole("link", { name: /Call Margaret · 082 111 2233/ })).toHaveAttribute(
    "href",
    "tel:+27821112233",
  );
  // Big tap targets (the UX rules ask for at least 48px).
  const callBox = await page.getByRole("link", { name: /Call Margaret/ }).boundingBox();
  expect(callBox?.height ?? 0).toBeGreaterThanOrEqual(48);
  await expect(page.getByText("Hard of hearing, speak clearly")).toBeVisible();
  const history = page.getByRole("region", { name: "Previous visits" });
  await expect(history).toContainText("Left shoulder, 8 min");
  await expect(history).not.toContainText("Feeling better");

  // Notes autosave, and survive a reload.
  const notes = page.getByLabel("Notes for this visit");
  await notes.fill("Right knee, 10 min.\nAsked about the cream.");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Notes for this visit")).toHaveValue(
    "Right knee, 10 min.\nAsked about the cream.",
  );

  // Products sold
  const products = page.getByRole("region", { name: "Products sold" });
  await products.getByRole("button", { name: "+ Add product" }).click();
  await products.getByRole("button", { name: /Paw balm/ }).click();
  await expect(products).toContainText("1 × Paw balm (30 ml)");
  await products.getByRole("button", { name: "+ Add product" }).click();
  await products.getByRole("button", { name: /Paw balm/ }).click();
  await expect(products).toContainText("2 × Paw balm (30 ml)");
  await expect(products).toContainText("Total: R240");

  await products.getByRole("button", { name: "Remove" }).click();
  await expect(products.getByText("Remove Paw balm (30 ml)?")).toBeVisible();
  await products.getByRole("button", { name: "No" }).click();
  await expect(products).toContainText("2 × Paw balm");
  await products.getByRole("button", { name: "Remove" }).click();
  await products.getByRole("button", { name: "Yes, remove" }).click();
  await expect(products).toContainText("None yet.");

  // Done, with confirmation, then Undo.
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.getByText("Mark this visit as done?")).toBeVisible();
  await page.getByRole("button", { name: "Yes, done" }).click();
  await expect(page.getByText("Done ✓")).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("button", { name: "Done", exact: true })).toBeVisible();

  // Didn't come
  await page.getByRole("button", { name: "Didn't come" }).click();
  await page.getByRole("button", { name: "Yes", exact: true }).click();
  await expect(page.getByText("Didn't come").first()).toBeVisible();

  // Back on Today the card shows the status.
  await page.getByRole("link", { name: "← Today" }).click();
  await expect(page.getByRole("link", { name: /Margaret Owner/ })).toContainText("Didn't come");
});

test("cancelling from the detail page removes it from Today", async ({ page }) => {
  await seedTodayAppointment({
    clientName: "Cancel Me",
    phone: "+27821119999",
    hour: 7,
    email: "cancel.me@example.com",
  });
  await signIn(page);
  await page.getByRole("link", { name: /Cancel Me/ }).click();

  await page.getByRole("button", { name: "Cancel booking" }).click();
  await expect(page.getByText("Cancel this booking?")).toBeVisible();
  await page.getByRole("button", { name: "Yes, cancel" }).click();
  await expect(page.getByText("This booking was cancelled.")).toBeVisible();

  await page.getByRole("link", { name: "Today", exact: true }).click();
  await expect(page.getByRole("link", { name: /Cancel Me/ })).toHaveCount(0);

  // The client is told by email.
  const email = await waitForEmail((e) => e.to === "cancel.me@example.com");
  expect(email.subject).toMatch(/is cancelled$/);
  expect(email.text).toContain("Hi Cancel,");
});
