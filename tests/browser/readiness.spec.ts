import { expect, test } from "./fixtures";

import {
  addPlayerEntry,
  addTeam,
  assignPlayerRepresentative,
  createDraftAuction,
  signIn,
  uniqueEmail,
} from "./helpers";
import { resetRunningAuctions } from "./live-helpers";

test.beforeEach(resetRunningAuctions);
// Leave the service clean: the beta allows only one Live Auction, and a spec
// that ends mid-auction would block the next run.
test.afterAll(resetRunningAuctions);

test("an Organizer resolves Readiness and starts a feasible Auction", async ({
  browser,
  page,
}) => {
  // This test walks the whole Draft-to-Live path, including live console
  // polling and a three-second Manual Close, so it needs more than the default
  // budget when the suite runs many files in parallel.
  test.setTimeout(120_000);

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

    // The dashboard opens the private Live console for a Live Auction.
    await startedRow.click();
    await expect(page).toHaveURL(/\/live$/);

    // The Organizer offers the next Player.
    await page.getByRole("button", { name: "Random Player" }).click();
    await expect(page.getByText("No Active Player.")).toBeHidden();

    // A Team Representative sees the committed Player and submits the exact Bid.
    const repPage = await firstRepContext.newPage();
    await repPage.goto("/app");
    await repPage.getByRole("link", { name: /Startable Auction/ }).click();
    await expect(repPage).toHaveURL(/\/live$/);
    await repPage.getByRole("button", { name: /^Bid \d+$/ }).click();
    await expect(
      repPage.getByText("Your Team leads this Player."),
    ).toBeVisible();

    // The Organizer's console picks up the committed Bid and its new revision
    // before closing, exactly as a real Organizer would see the leader change.
    await expect(page.getByText("Reds (leading)")).toBeVisible();

    // A Manual Close warning can be cancelled without changing the leader, then
    // finalizes exactly one Sale.
    await page.getByRole("button", { name: "Start 3-second close" }).click();
    await expect(page.getByText(/Closing in/)).toBeVisible();
    await page.getByRole("button", { name: "Cancel warning" }).click();
    await expect(page.getByText(/Closing in/)).toBeHidden();

    await page.getByRole("button", { name: "Start 3-second close" }).click();
    await expect(page.getByText("No Active Player.")).toBeVisible({
      timeout: 15_000,
    });
  } finally {
    await firstRepContext.close();
    await secondRepContext.close();
  }
});
