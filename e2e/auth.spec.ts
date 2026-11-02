import { expect, test } from "@playwright/test";
import { E2E_USER } from "./user";

test.describe.configure({ mode: "serial" });

test("the owner app and admin require signing in", async ({ page }) => {
  await page.goto("/app");
  await expect(page).toHaveURL(/\/login\?next=%2Fapp$/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

  await page.goto("/admin");
  await expect(page).toHaveURL(/\/login\?next=%2Fadmin$/);
});

test("a forged session cookie doesn't get in", async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: "session", value: "forged", url: baseURL ?? "" }]);
  await page.goto("/app");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("wrong password shows a friendly error", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_USER.email);
  await page.getByLabel("Password").fill("not the password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("That email or password isn't right.")).toBeVisible();
  await expect(page.getByLabel("Email")).toHaveValue(E2E_USER.email);
});

test("sign in, stay signed in, and log out from settings", async ({ page, context }) => {
  await page.goto("/admin");
  await page.getByLabel("Email").fill(E2E_USER.email);
  await page.getByLabel("Password").fill(E2E_USER.password);
  await page.getByRole("button", { name: "Sign in" }).click();

  // Back to where she was going.
  await expect(page).toHaveURL(/\/admin$/);

  const cookie = (await context.cookies()).find((c) => c.name === "session");
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe("Lax");
  // ~90 days.
  expect((cookie?.expires ?? 0) - Date.now() / 1000).toBeGreaterThan(89 * 86_400);

  await page.goto("/app");
  await expect(page.getByRole("navigation", { name: "Main" })).toContainText("Today");
  await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();

  // The login page sends a signed-in user straight on.
  await page.goto("/login");
  await expect(page).toHaveURL(/\/app$/);

  await page.getByRole("link", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

  await page.goto("/app");
  await expect(page).toHaveURL(/\/login/);
});
