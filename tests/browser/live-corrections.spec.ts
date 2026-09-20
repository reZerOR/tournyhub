import { expect, test } from "./fixtures";

import {
  offerRandomPlayer,
  resetRunningAuctions,
  setupLiveAuction,
} from "./live-helpers";

test.beforeEach(resetRunningAuctions);

test("cancels the highest Bid while Paused and restores the preceding leader", async ({
  browser,
  page,
}) => {
  test.setTimeout(180_000);
  const setup = await setupLiveAuction(browser, page, {
    title: "Bid Cancellation Auction",
  });

  try {
    await offerRandomPlayer(page);

    await expect(
      setup.redsRepPage.getByRole("button", { name: /^Bid \d+$/ }),
    ).toBeVisible({ timeout: 20_000 });
    await setup.redsRepPage.getByRole("button", { name: /^Bid \d+$/ }).click();
    await expect(page.getByText("Reds (leading)")).toBeVisible({
      timeout: 20_000,
    });

    await expect(
      setup.bluesRepPage.getByRole("button", { name: /^Bid \d+$/ }),
    ).toBeVisible({ timeout: 20_000 });
    await setup.bluesRepPage.getByRole("button", { name: /^Bid \d+$/ }).click();
    await expect(page.getByText("Blues (leading)")).toBeVisible({
      timeout: 20_000,
    });

    // Corrections are only available while Paused.
    await expect(
      page.getByRole("button", { name: "Cancel highest Bid" }),
    ).toBeHidden();
    await page.getByRole("button", { name: "Pause Auction" }).click();
    await expect(page.getByRole("heading", { name: "Paused" })).toBeVisible();

    await page.getByLabel("Reason", { exact: true }).fill("Wrong amount");
    await page.getByRole("button", { name: "Cancel highest Bid" }).click();

    await expect(page.getByText("Highest Bid cancelled.")).toBeVisible();
    // The preceding valid Bid is the leader again.
    await expect(page.getByText("Reds (leading)")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText("Blues (leading)")).toBeHidden();
  } finally {
    await setup.dispose();
  }
});

test("reverses a completed Sale while Paused and returns the Player to the Unsold Pool", async ({
  browser,
  page,
}) => {
  test.setTimeout(180_000);
  const setup = await setupLiveAuction(browser, page, {
    title: "Sale Reversal Auction",
  });

  try {
    await offerRandomPlayer(page);
    await expect(
      setup.redsRepPage.getByRole("button", { name: /^Bid \d+$/ }),
    ).toBeVisible({ timeout: 20_000 });
    await setup.redsRepPage.getByRole("button", { name: /^Bid \d+$/ }).click();
    await expect(page.getByText("Reds (leading)")).toBeVisible({
      timeout: 20_000,
    });

    // Close the Player so the Sale commits.
    await page.getByRole("button", { name: "Start 3-second close" }).click();
    await expect(page.getByText("No Active Player.")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(/Roster 2 · Spent 10/)).toBeVisible();

    await page.getByRole("button", { name: "Pause Auction" }).click();
    await expect(page.getByRole("heading", { name: "Paused" })).toBeVisible();

    await page.getByLabel("Reason", { exact: true }).fill("Wrong Team won");
    await page.getByLabel("Sale to reverse").selectOption({ index: 1 });
    await page.getByRole("button", { name: "Reverse Sale" }).click();

    await expect(page.getByText("Sale reversed.")).toBeVisible();
    // The refund and the removed Roster entry are visible to every participant.
    const redsRow = page.locator("li").filter({ hasText: "Reds" });
    await expect(redsRow.getByText(/Roster 1 · Spent 0/)).toBeVisible({
      timeout: 20_000,
    });
    await expect(redsRow.getByText(/Roster 2 · Spent 10/)).toBeHidden();
  } finally {
    await setup.dispose();
  }
});
