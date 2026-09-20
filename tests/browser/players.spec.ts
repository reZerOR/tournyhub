import { expect, test } from "./fixtures";
import type { APIRequestContext, Page } from "@playwright/test";

function uniqueEmail(label: string): string {
  return `browser-players-${label}-${Date.now()}-${Math.floor(
    Math.random() * 1_000_000,
  )}@example.com`;
}

async function readOtp(
  request: APIRequestContext,
  email: string,
): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await request.get(
      `/api/dev/test-inbox?email=${encodeURIComponent(email)}&type=sign-in`,
    );
    const body = (await response.json()) as { otp: string | null };
    if (body.otp) return body.otp;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`No OTP was recorded for ${email}`);
}

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByLabel("Code")).toBeVisible();
  await page.getByLabel("Code").fill(await readOtp(page.request, email));
  await page.getByRole("button", { name: "Verify and sign in" }).click();
  await expect(page).toHaveURL(/\/app$/);
}

async function openPlayersSection(page: Page): Promise<void> {
  await page.getByRole("link", { name: "New Auction" }).click();
  await page.getByLabel("Title").fill("Winter Classic");
  await page.getByLabel("Game").fill("Chess");
  await page.getByRole("button", { name: "Create Draft Auction" }).click();
  await expect(page).toHaveURL(/\/app\/auctions\/[^/]+\/setup\/basics$/);

  await page.getByRole("link", { name: "Players" }).click();
  await expect(page).toHaveURL(/\/setup\/players$/);
  await expect(page.getByRole("heading", { name: "Players" })).toBeVisible();
}

test("an Organizer manages Player Entries, custom fields, and duplicate warnings", async ({
  page,
}) => {
  await signIn(page, uniqueEmail("manage"));

  await openPlayersSection(page);

  const addForm = page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "Add Player" }) });
  const editForm = page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "Save Player" }) });
  const fieldForm = page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "Add field" }) });
  const table = page.getByRole("table", { name: "Player Entries" });

  await expect(
    page.getByText("You haven't added any Player Entries yet."),
  ).toBeVisible();

  await fieldForm.getByLabel("Field label").fill("Position");
  await fieldForm.getByRole("button", { name: "Add field" }).click();
  await expect(addForm.getByLabel("Position")).toBeVisible();

  await addForm.getByLabel("Display name").fill("Alice");
  await addForm.getByRole("button", { name: "Add Player" }).click();
  await expect(table.getByRole("row")).toHaveCount(2);
  // Saving resets the add form to empty; wait for that reset before the next
  // fill, otherwise the reset lands after it and clears the new values.
  await expect(addForm.getByLabel("Display name")).toHaveValue("");

  await addForm.getByLabel("Display name").fill("Bob");
  await addForm.getByLabel("Role").fill("Captain");
  await addForm.getByLabel("External Player ID").fill("uid-2");
  await addForm.getByLabel("Phone number").fill("+15550102030");
  await addForm.getByLabel("Starting price").fill("25");
  await addForm.getByLabel("Position").fill("Defender");
  await addForm.getByRole("button", { name: "Add Player" }).click();
  await expect(table.getByRole("cell", { name: "uid-2" })).toBeVisible();
  await expect(table.getByText("Position: Defender")).toBeVisible();

  await expect(table).not.toContainText("+15550102030");

  await addForm.getByLabel("Display name").fill("alice");
  await addForm.getByRole("button", { name: "Add Player" }).click();
  await expect(page.getByText("Duplicate display names")).toBeVisible();
  await expect(table.getByRole("row")).toHaveCount(4);

  await page.reload();
  await expect(table.getByRole("row")).toHaveCount(4);
  await expect(table).not.toContainText("+15550102030");

  const bobRow = table.getByRole("row", { name: /Bob/ });
  await bobRow.getByRole("button", { name: "Edit" }).click();
  await expect(editForm.getByLabel("Phone number")).toHaveValue("+15550102030");
  await editForm.getByLabel("Role").fill("Coach");
  await editForm.getByRole("button", { name: "Save Player" }).click();
  await expect(table.getByRole("cell", { name: "Coach" })).toBeVisible();

  await table
    .getByRole("row", { name: /Bob/ })
    .getByRole("button", { name: "Remove" })
    .click();
  await expect(table.getByRole("row")).toHaveCount(3);
});

test("an unrelated User cannot open another Organizer's Players setup", async ({
  page,
}) => {
  await signIn(page, uniqueEmail("owner"));
  await openPlayersSection(page);
  const playersUrl = page.url();

  await page.context().clearCookies();
  await signIn(page, uniqueEmail("unrelated"));

  // A streaming route sends its headers before the page decides the Auction is
  // not visible, so the privacy guarantee is the content, not the status: the
  // unrelated User gets the not-found page and no Player data.
  await page.goto(playersUrl);
  await expect(
    page.getByRole("heading", { name: "This page is not available" }),
  ).toBeVisible();
  await expect(page.getByText("Bob")).toBeHidden();
});
