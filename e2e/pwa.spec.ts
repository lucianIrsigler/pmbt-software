import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test.describe.configure({ mode: "serial" });

test("the owner's app links a valid manifest with icons; the public site doesn't", async ({
  page,
  request,
}) => {
  const response = await request.get("/manifest.webmanifest");
  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toContain("application/manifest+json");
  const manifest = (await response.json()) as {
    name: string;
    start_url: string;
    display: string;
    icons: { src: string; sizes: string }[];
  };
  expect(manifest).toMatchObject({
    name: "My bookings",
    start_url: "/app",
    display: "standalone",
  });
  for (const icon of manifest.icons) {
    const image = await request.get(icon.src);
    expect(image.ok(), icon.src).toBe(true);
    expect(image.headers()["content-type"]).toBe("image/png");
  }
  expect((await request.get("/apple-icon")).headers()["content-type"]).toBe("image/png");

  const sw = await request.get("/sw.js");
  expect(sw.ok()).toBe(true);
  expect(sw.headers()["content-type"]).toContain("javascript");

  await page.goto("/");
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(0);
  await signIn(page);
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    "href",
    "/manifest.webmanifest",
  );
});

test("without internet, the app shows a friendly offline page", async ({ page, context }) => {
  await signIn(page);
  // Wait for the service worker to install and take control of the page.
  await page.waitForFunction(async () => {
    const registration = await navigator.serviceWorker.getRegistration("/app");
    return registration?.active?.state === "activated";
  });
  const scope = await page.evaluate(
    async () => (await navigator.serviceWorker.getRegistration("/app"))?.scope ?? "",
  );
  expect(new URL(scope).pathname).toBe("/app");
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

  await context.setOffline(true);
  await page.goto("/app/calendar");
  await expect(page.getByRole("heading", { name: "You're offline" })).toBeVisible();

  await context.setOffline(false);
  await page.getByRole("link", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Calendar" })).toBeVisible();
});

test("install instructions are reachable from Settings", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: "Settings" }).click();
  await page.getByRole("link", { name: "How to install the app" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Put the app on your home screen" }),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "Android phone" })).toContainText(
    "Add to Home screen",
  );
  await expect(page.getByRole("region", { name: "iPhone" })).toContainText("Add to Home Screen");
  // The three tabs are still the only main navigation.
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link")).toHaveText([
    "Today",
    "Calendar",
    "Clients",
  ]);
});
