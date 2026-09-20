import { expect, test } from "./fixtures";

import {
  addPlayerEntry,
  createDraftAuction,
  signIn,
  uniqueEmail,
} from "./helpers";

test("an Organizer configures ordered Tiers and assigns a Player", async ({
  page,
}) => {
  await signIn(page, uniqueEmail("tiered-organizer"));
  await createDraftAuction(page, {
    rulesMode: "Tiered Rules",
    title: "Tiered Auction",
  });

  await page.getByRole("link", { name: "Players" }).click();
  await expect(page).toHaveURL(/\/setup\/players$/);
  await addPlayerEntry(page, "Alice");

  await page.getByRole("link", { name: "Tiers" }).click();
  await expect(page).toHaveURL(/\/setup\/tiers$/);

  await page.getByLabel("New Tier name").fill("Gold");
  await page.locator("#new-tier-price").fill("50");
  await page.locator("#new-tier-min").fill("1");
  await page.locator("#new-tier-max").fill("2");
  await page.getByRole("button", { name: "Add Tier" }).click();
  await expect(page.locator("#new-tier-label")).toHaveValue("");

  const tierName = page.getByLabel("Tier name").first();
  await expect(tierName).toHaveValue("Gold");

  // Rename and reorder a second Tier to prove order is preserved.
  await page.getByLabel("New Tier name").fill("Bronze");
  await page.locator("#new-tier-price").fill("10");
  await page.locator("#new-tier-min").fill("0");
  await page.locator("#new-tier-max").fill("3");
  await page.getByRole("button", { name: "Add Tier" }).click();
  await expect(page.getByLabel("Tier name")).toHaveCount(2);

  await page.getByRole("button", { name: "Move up" }).nth(1).click();
  await expect(page.getByLabel("Tier name").first()).toHaveValue("Bronze");

  // Assign the Player to a Tier and confirm it persists across a reload. The
  // select only updates its checked option after the server action commits, so
  // waiting for that also confirms the assignment was written.
  const assignment = page
    .locator("li")
    .filter({ hasText: "Alice" })
    .filter({ has: page.locator("select") });
  await assignment.locator("select").selectOption({ label: "Gold" });
  await expect(assignment.locator("select option:checked")).toHaveText("Gold");

  await page.reload();
  await expect(
    page
      .locator("li")
      .filter({ hasText: "Alice" })
      .locator("select option:checked"),
  ).toHaveText("Gold");
});

test("Tiered Rules replace the default Starting Price with per-Tier prices", async ({
  page,
}) => {
  await signIn(page, uniqueEmail("tiered-rules-organizer"));
  await createDraftAuction(page, {
    rulesMode: "Tiered Rules",
    title: "Tiered Rules Auction",
  });

  await page.getByRole("link", { name: "Rules" }).click();
  await expect(page).toHaveURL(/\/setup\/rules$/);

  // Tiered Rules share the Budget, Bid Increment, and Roster limits only.
  await expect(page.getByLabel("Default Starting Price")).toHaveCount(0);

  await page.getByLabel("Budget").fill("100");
  await page.getByLabel("Bid Increment").fill("5");
  await page.getByLabel("Minimum Roster size").fill("3");
  await page.getByLabel("Maximum Roster size").fill("4");
  await page.getByRole("button", { name: "Save Rules" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved");
});
