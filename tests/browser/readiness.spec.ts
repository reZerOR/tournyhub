import { expect, test } from "./fixtures";
import type { Page } from "@playwright/test";

import {
  addPlayerEntry,
  createDraftAuction,
  signIn,
  uniqueEmail,
} from "./helpers";

async function addTeam(page: Page, name: string): Promise<void> {
  const addForm = page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "Add Team" }) });
  await addForm.getByLabel("Team name").fill(name);
  await addForm.getByRole("button", { name: "Add Team" }).click();
  await expect(page.getByRole("cell", { name, exact: true })).toBeVisible();
}

async function assignPlayerRepresentative(
  page: Page,
  teamName: string,
  playerName: string,
  email: string,
): Promise<void> {
  const row = page
    .locator("li")
    .filter({ hasText: teamName })
    .filter({ has: page.getByLabel("Representative email") });
  await row.getByLabel("Player Entry").selectOption({ label: playerName });
  await row.getByLabel("Representative email").fill(email);
  await row
    .getByRole("button", { name: "Assign Player Representative" })
    .click();
  await expect(
    page.getByText(`Player Representative: ${playerName}`),
  ).toBeVisible();
}

test("an Organizer resolves Readiness and starts a feasible Auction", async ({
  browser,
  page,
}) => {
  const firstRepEmail = uniqueEmail("start-rep-one");
  const secondRepEmail = uniqueEmail("start-rep-two");
  const firstRepContext = await browser.newContext();
  const secondRepContext = await browser.newContext();

  try {
    await signIn(await firstRepContext.newPage(), firstRepEmail);
    await signIn(await secondRepContext.newPage(), secondRepEmail);

    await signIn(page, uniqueEmail("start-organizer"));
    await createDraftAuction(page, { title: "Startable Auction" });

    await page.getByRole("link", { name: "Players" }).click();
    await expect(page).toHaveURL(/\/setup\/players$/);
    for (const name of ["Alice", "Bob", "Carol", "Dave"]) {
      await addPlayerEntry(page, name);
    }

    await page.getByRole("link", { name: "Teams", exact: true }).click();
    await expect(page).toHaveURL(/\/setup\/teams$/);
    await addTeam(page, "Reds");
    await addTeam(page, "Blues");

    // Readiness reports the unresolved Teams before representatives exist.
    await page.getByRole("link", { name: "Readiness" }).click();
    await expect(page).toHaveURL(/\/setup\/readiness$/);
    await expect(page.getByText(/still need attention/)).toBeVisible();

    await page.getByRole("link", { name: "Representatives" }).click();
    await expect(page).toHaveURL(/\/setup\/representatives$/);
    await assignPlayerRepresentative(page, "Reds", "Alice", firstRepEmail);
    await assignPlayerRepresentative(page, "Blues", "Bob", secondRepEmail);

    await page.getByRole("link", { name: "Rules" }).click();
    await expect(page).toHaveURL(/\/setup\/rules$/);
    await page.getByLabel("Budget").fill("100");
    await page.getByLabel("Bid Increment").fill("5");
    await page.getByLabel("Minimum Roster size").fill("2");
    await page.getByLabel("Maximum Roster size").fill("3");
    await page.getByLabel("Default Starting Price").fill("10");
    await page.getByRole("button", { name: "Save Rules" }).click();
    await expect(page.getByRole("status")).toHaveText("Saved");

    await page.getByRole("link", { name: "Readiness" }).click();
    await expect(page).toHaveURL(/\/setup\/readiness$/);
    await expect(
      page.getByText("Every requirement holds. This Auction is Ready."),
    ).toBeVisible();

    await page.getByRole("button", { name: "Start Auction" }).click();
    await expect(page).toHaveURL(/\/app$/);

    const startedRow = page
      .locator("a")
      .filter({ hasText: "Startable Auction" });
    await expect(startedRow.getByText("live", { exact: true })).toBeVisible();
  } finally {
    await firstRepContext.close();
    await secondRepContext.close();
  }
});
