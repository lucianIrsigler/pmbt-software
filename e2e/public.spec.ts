import { expect, test } from "@playwright/test";

/** The public site's header on a phone-sized screen. */

test("the title is Daisy Healing and the phone menu opens, navigates and closes", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveTitle("Daisy Healing");

  const menuButton = page.locator("summary", { hasText: "Menu" });
  const services = page.getByRole("navigation", { name: "Main" }).getByRole("link", {
    name: "Services",
  });
  await expect(services).toBeHidden();

  await menuButton.click();
  await expect(services).toBeVisible();
  await services.click();

  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page).toHaveURL(/\/services$/);
  await expect(page).toHaveTitle(/· Daisy Healing$/);
  // Choosing a page closes the menu again.
  await expect(services).toBeHidden();
});
