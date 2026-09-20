import { expect, test } from "./fixtures";

import {
  addPlayerEntry,
  createDraftAuction,
  signIn,
  uniqueEmail,
} from "./helpers";

async function openTeams(page: import("@playwright/test").Page): Promise<void> {
  await page.getByRole("link", { name: "Teams", exact: true }).click();
  await expect(page).toHaveURL(/\/setup\/teams$/);
  await expect(
    page.getByRole("heading", { name: "Teams", exact: true }),
  ).toBeVisible();
}

test("an Organizer creates, renames, reorders, and removes Teams", async ({
  page,
}) => {
  await signIn(page, uniqueEmail("teams-manage"));
  await createDraftAuction(page, { title: "Winter Classic" });
  await openTeams(page);

  const table = page.getByRole("table", { name: "Teams" });
  await expect(
    page.getByText("You haven't created any Teams yet."),
  ).toBeVisible();

  const addForm = page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "Add Team" }) });
  await addForm.getByLabel("Team name").fill("Reds");
  await addForm.getByLabel("Color").fill("#ff0000");
  await addForm.getByRole("button", { name: "Add Team" }).click();
  await expect(
    table.getByRole("cell", { name: "Reds", exact: true }),
  ).toBeVisible();

  // Names are unique after normalization.
  await addForm.getByLabel("Team name").fill("  reds ");
  await addForm.getByRole("button", { name: "Add Team" }).click();
  await expect(
    page.getByText("Another Team already uses that name."),
  ).toBeVisible();

  await addForm.getByLabel("Team name").fill("Blues");
  await addForm.getByRole("button", { name: "Add Team" }).click();
  await expect(
    table.getByRole("cell", { name: "Blues", exact: true }),
  ).toBeVisible();
  await expect(table.getByRole("row")).toHaveCount(3);

  // Reorder and rename.
  await page.getByRole("button", { name: "Move Blues up" }).click();
  await expect(table.getByRole("row").nth(1)).toContainText("Blues");

  await table
    .getByRole("row", { name: /Reds/ })
    .getByRole("button", { name: "Edit" })
    .click();
  await page.getByLabel("Team name").last().fill("Crimson");
  await page.getByRole("button", { name: "Save Team" }).click();
  await expect(
    table.getByRole("cell", { name: "Crimson", exact: true }),
  ).toBeVisible();

  await page.reload();
  await expect(table.getByRole("row")).toHaveCount(3);
  await expect(
    table.getByRole("cell", { name: "Crimson", exact: true }),
  ).toBeVisible();

  await table
    .getByRole("row", { name: /Blues/ })
    .getByRole("button", { name: "Remove" })
    .click();
  await expect(table.getByRole("row")).toHaveCount(2);
});

test("Calculate Teams lists feasible counts and creates unnamed Teams", async ({
  page,
}) => {
  await signIn(page, uniqueEmail("teams-calculate"));
  await createDraftAuction(page, { title: "Calculation" });

  await page.getByRole("link", { name: "Players" }).click();
  await expect(page).toHaveURL(/\/setup\/players$/);
  await addPlayerEntry(page, "Alice");
  await addPlayerEntry(page, "Bob");
  await addPlayerEntry(page, "Carol");
  await addPlayerEntry(page, "Dave");

  await openTeams(page);

  const calculator = page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "Calculate" }) });
  await calculator.getByLabel("Minimum Roster size").fill("2");
  await calculator.getByLabel("Maximum Roster size").fill("3");

  // Impossible before entering a Roster range that fits the Player count.
  await calculator.getByLabel("Minimum Roster size").fill("3");
  await calculator.getByRole("button", { name: "Calculate" }).click();
  await expect(page.getByText("No Team count works")).toBeVisible();

  await calculator.getByLabel("Minimum Roster size").fill("2");
  await calculator.getByRole("button", { name: "Calculate" }).click();
  await expect(page.getByText(/Feasible Team counts: 2/)).toBeVisible();

  await page.getByRole("button", { name: "Create 2 unnamed Teams" }).click();

  const table = page.getByRole("table", { name: "Teams" });
  await expect(table.getByRole("row")).toHaveCount(3);
  await expect(
    table.getByRole("cell", { name: "Unnamed Team", exact: true }),
  ).toHaveCount(2);
});
