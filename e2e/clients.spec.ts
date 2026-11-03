import { expect, test } from "@playwright/test";
import { seedTodayAppointment, signIn } from "./helpers";

test.describe.configure({ mode: "serial" });

test("find a client, edit details and notes, manage animals, open a past visit", async ({
  page,
}) => {
  await seedTodayAppointment({
    clientName: "Grace Clientpage",
    phone: "+27823334444",
    hour: 8,
    lastVisitNotes: "Neck, 6 min\nSlept well after",
  });
  await signIn(page);

  // Find her by phone number.
  await page.getByRole("link", { name: "Clients", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Clients" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recent clients" })).toBeVisible();
  await page.getByLabel("Find a client by name or phone").fill("082 333 44");
  await page.getByRole("button", { name: "Search" }).click();
  const found = page.getByRole("list", { name: "Clients found" });
  await found.getByRole("link", { name: /Grace Clientpage/ }).click();

  // Client page with history.
  await expect(page.getByRole("heading", { level: 1, name: "Grace Clientpage" })).toBeVisible();
  const past = page.getByRole("region", { name: "Past visits" });
  await expect(past).toContainText("Neck, 6 min");
  await expect(past).not.toContainText("Slept well after");
  await expect(past).toContainText("Done");
  await expect(page.getByRole("link", { name: "Call Grace" })).toHaveAttribute(
    "href",
    "tel:+27823334444",
  );

  // Edit details, with a validation error first.
  await page.getByRole("link", { name: "Edit details" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Edit details" })).toBeVisible();
  await expect(page.getByLabel("Phone number")).toHaveValue("082 333 4444");
  await page.getByLabel("Name", { exact: true }).fill("Grace Edited");
  await page.getByLabel("Email (optional)").fill("not-an-email");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Please enter a valid email address")).toBeVisible();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Grace Edited");
  await page.getByLabel("Email (optional)").fill("grace@example.com");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Saved ✓")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Grace Edited" })).toBeVisible();
  await expect(page.getByText("grace@example.com")).toBeVisible();

  // Client notes save by themselves.
  await page.getByLabel("Notes about Grace").fill("Prefers afternoon visits");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Notes about Grace")).toHaveValue("Prefers afternoon visits");

  // Add an animal, then edit it.
  await page.getByRole("link", { name: "Add an animal" }).click();
  await page.getByRole("button", { name: "Save animal" }).click();
  await expect(page.getByText("Please enter the animal's name")).toBeVisible();
  await page.getByLabel("Animal's name").fill("Rolo");
  await page.getByLabel("What kind of animal? (e.g. Dog)").fill("Dog");
  await page.getByRole("button", { name: "Save animal" }).click();
  const animals = page.getByRole("region", { name: "Animals" });
  await animals.getByRole("link", { name: /Rolo \(Dog\)/ }).click();

  await expect(page.getByRole("heading", { level: 1, name: /Rolo/ })).toBeVisible();
  await page.getByLabel("Notes about Rolo").fill("Loves the paw balm");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.getByLabel("Breed (optional)").fill("Dachshund");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Saved ✓")).toBeVisible();
  await expect(animals).toContainText("Dachshund");

  // A past visit opens the appointment, which links back to the client page.
  await past.getByRole("link", { name: /Neck, 6 min/ }).click();
  await expect(page.getByText("Neck, 6 min")).toBeVisible();
  await page.getByRole("link", { name: "Client page and full history" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Grace Edited" })).toBeVisible();
});

test("add a client, spot a known number, archive and bring back", async ({ page }) => {
  await signIn(page);
  await page.goto("/app/clients");
  await page.getByRole("link", { name: "Add client" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Add client" })).toBeVisible();
  await page.getByLabel("Name", { exact: true }).fill("Archie Archive");
  await page.getByLabel("Phone number").fill("082 555 6666");
  await page.getByRole("button", { name: "Save client" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Archie Archive" })).toBeVisible();
  const clientUrl = page.url().split("?")[0] ?? "";

  // Adding the same number again opens the existing client.
  await page.goto("/app/clients/new");
  await expect(page.getByRole("heading", { level: 1, name: "Add client" })).toBeVisible();
  await page.getByLabel("Name", { exact: true }).fill("Someone Else");
  await page.getByLabel("Phone number").fill("0825556666");
  await page.getByRole("button", { name: "Save client" }).click();
  await expect(
    page.getByText("This phone number already belongs to Archie Archive."),
  ).toBeVisible();

  // Archive, with confirmation.
  await page.getByRole("button", { name: "Archive client" }).click();
  await expect(page.getByText(/Archive Archie Archive\?/)).toBeVisible();
  await page.getByRole("button", { name: "Yes, archive" }).click();
  await expect(page.getByText("This client is archived.")).toBeVisible();

  await page.goto("/app/clients?q=Archie");
  await expect(page.getByText("No clients found.")).toBeVisible();

  // Bring back.
  await page.goto(clientUrl);
  await page.getByRole("button", { name: "Bring back" }).click();
  await expect(page.getByText("This client is archived.")).toHaveCount(0);
  await page.goto("/app/clients?q=Archie");
  await expect(page.getByRole("link", { name: /Archie Archive/ })).toBeVisible();
});
