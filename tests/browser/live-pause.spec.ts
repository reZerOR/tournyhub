import { expect, test } from "./fixtures";

import {
  offerRandomPlayer,
  resetRunningAuctions,
  setupLiveAuction,
} from "./live-helpers";

test.beforeEach(resetRunningAuctions);

test("pauses and resumes a Live Auction without losing the Active Player", async ({
  browser,
  page,
}) => {
  test.setTimeout(180_000);
  const setup = await setupLiveAuction(browser, page, {
    title: "Pause Auction",
  });

  try {
    await offerRandomPlayer(page);
    await expect(
      page.getByRole("heading", { name: "Live Auction" }),
    ).toBeVisible();
    await expect(
      setup.redsRepPage.getByRole("button", { name: /^Bid \d+$/ }),
    ).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: "Pause Auction" }).click();
    await expect(page.getByRole("heading", { name: "Paused" })).toBeVisible();
    await expect(page.getByText(/Bidding is suspended/)).toBeVisible();

    // The Representative console refuses Bids while the Auction is Paused, and
    // still shows the same Active Player.
    await expect(setup.redsRepPage.getByText(/Lifecycle:/)).toContainText(
      "paused",
      { timeout: 20_000 },
    );
    await expect(
      setup.redsRepPage.getByText(
        "Bidding is suspended while the Auction is Paused.",
      ),
    ).toBeVisible();

    await page.getByRole("button", { name: "Resume Auction" }).click();
    await expect(
      page.getByRole("heading", { name: "Live Auction" }),
    ).toBeVisible();
    await expect(
      setup.redsRepPage.getByRole("button", { name: /^Bid \d+$/ }),
    ).toBeVisible({ timeout: 20_000 });

    // Repeated pause and resume keep one Active Player.
    await page.getByRole("button", { name: "Pause Auction" }).click();
    await expect(page.getByRole("heading", { name: "Paused" })).toBeVisible();
    await page.getByRole("button", { name: "Resume Auction" }).click();
    await expect(page.getByText("No Active Player.")).toBeHidden();
  } finally {
    await setup.dispose();
  }
});

test("shows connection health, disables controls offline, and replaces state on reconnect", async ({
  browser,
  page,
}) => {
  test.setTimeout(180_000);
  const setup = await setupLiveAuction(browser, page, {
    title: "Reconnect Auction",
  });

  try {
    await offerRandomPlayer(page);
    await expect(
      setup.redsRepPage.getByRole("button", { name: /^Bid \d+$/ }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(setup.redsRepPage.getByText("Connection:")).toBeVisible();
    await expect(setup.redsRepPage.getByText("Controls:")).toContainText(
      "Ready",
    );

    // Losing the connection makes the console stale, which disables bidding.
    await setup.redsRepPage.context().setOffline(true);
    await expect(
      setup.redsRepPage.getByText("Reconnecting…", { exact: true }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      setup.redsRepPage.getByText("Reconnecting before bidding is available…"),
    ).toBeVisible();
    await expect(setup.redsRepPage.getByText("Controls:")).toContainText(
      "Unavailable",
    );

    // Coming back fetches a fresh authorized snapshot before controls return.
    await setup.redsRepPage.context().setOffline(false);
    await setup.redsRepPage.evaluate(() => {
      window.dispatchEvent(new Event("focus"));
    });
    await expect(
      setup.redsRepPage.getByRole("button", { name: /^Bid \d+$/ }),
    ).toBeVisible({ timeout: 30_000 });

    // The Organizer pauses twice, so the Representative missed revisions and
    // must converge on the same authoritative revision.
    await page.getByRole("button", { name: "Pause Auction" }).click();
    await page.getByRole("button", { name: "Resume Auction" }).click();
    await page.getByRole("button", { name: "Pause Auction" }).click();

    await expect
      .poll(
        async () => {
          const organizer = await page
            .getByText(/Revision \d+/)
            .first()
            .textContent();
          const rep = await setup.redsRepPage
            .getByText(/Revision \d+/)
            .first()
            .textContent();
          return organizer === rep;
        },
        { timeout: 30_000 },
      )
      .toBe(true);
  } finally {
    await setup.dispose();
  }
});
