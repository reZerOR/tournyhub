import { expect, test } from "./fixtures";

import {
  addPlayerEntry,
  createDraftAuction,
  signIn,
  uniqueEmail,
} from "./helpers";

test("copies an earlier Auction and archives and restores the copy", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await signIn(page, uniqueEmail("lifecycle-organizer"));

  await createDraftAuction(page, { title: "Lifecycle Source" });
  await page.getByRole("link", { name: "Players" }).click();
  await addPlayerEntry(page, "Alice");
  await addPlayerEntry(page, "Bob");

  // Copy the Draft into a new one, without carrying Tier or price data.
  await page.goto("/app/auctions/new");
  await page.getByLabel("Source Auction").selectOption({ index: 1 });
  await expect(page.getByLabel("New Auction title")).toHaveValue(
    "Lifecycle Source copy",
  );
  await expect(page.getByText("Alice")).toBeVisible();
  await page.getByRole("button", { name: "Copy into a new Draft" }).click();

  await expect(page).toHaveURL(/\/setup\/basics$/);
  await expect(page.getByLabel("Title")).toHaveValue("Lifecycle Source copy");
  await page.getByRole("link", { name: "Players" }).click();
  await expect(
    page.getByRole("cell", { name: "Alice", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "Bob", exact: true }),
  ).toBeVisible();

  // Archive the copy from the Manage page, then restore it from the dashboard.
  await page.getByRole("link", { name: "Manage Auction" }).click();
  await expect(page).toHaveURL(/\/manage$/);
  await page.getByRole("button", { name: "Archive Auction" }).click();

  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByText(/recoverable until/)).toBeVisible();

  await page.getByRole("button", { name: "Restore" }).click();
  await expect(page.getByText("You have no Archived Auctions.")).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Lifecycle Source copy/ }),
  ).toBeVisible();
});
