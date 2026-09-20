import { Pool } from "pg";

import { expect, test } from "./fixtures";

import { signIn, uniqueEmail } from "./helpers";
import { resetRunningAuctions, setupLiveAuction } from "./live-helpers";

test.beforeEach(resetRunningAuctions);
test.afterAll(resetRunningAuctions);

const PHONES = {
  alice: "+880100000001",
  bob: "+880100000002",
  carol: "+880100000003",
  dave: "+880100000004",
};

/** Writes supplied phone numbers onto the fixture's Player Entries. */
async function setPhones(
  auctionId: string,
  emails: Record<string, string>,
): Promise<void> {
  const pool = new Pool({
    connectionString:
      process.env.DATABASE_URL ??
      "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  });
  try {
    for (const [displayName, phone] of Object.entries(emails)) {
      await pool.query(
        `update "player_entry" set "phone_number" = $3
          where "auction_id" = $1 and "display_name" = $2`,
        [auctionId, displayName, phone],
      );
    }
  } finally {
    await pool.end();
  }
}

test("publishes privacy-filtered Results and exports for participants only", async ({
  browser,
  page,
}) => {
  test.setTimeout(240_000);
  const setup = await setupLiveAuction(browser, page, {
    title: "Results Export Auction",
  });
  const strangerContext = await browser.newContext();
  const strangerPage = await strangerContext.newPage();

  try {
    const auctionId = new URL(page.url()).pathname.split("/")[3]!;
    await setPhones(auctionId, {
      Alice: PHONES.alice,
      Bob: PHONES.bob,
      Carol: PHONES.carol,
      Dave: PHONES.dave,
    });

    await page.getByRole("button", { name: "Pause Auction" }).click();
    await page
      .getByRole("link", { name: "Open Manage Auction for paused changes" })
      .click();
    await page.getByLabel("Reason for this change").fill("Ended early");
    await page.getByRole("button", { name: "Cancel Auction" }).click();
    await expect(
      page.getByRole("heading", { name: "Auction cancelled" }),
    ).toBeVisible();

    // The Organizer opens Results and sees every supplied phone number.
    await page.goto(`/app/auctions/${auctionId}/results`);
    await expect(
      page.getByRole("heading", { name: "Auction Results" }),
    ).toBeVisible();
    await page.getByText(/Show Player details/).click();
    await expect(
      page.getByRole("cell", { name: PHONES.alice, exact: true }),
    ).toBeVisible();

    const organizerCsv = await page.request.get(
      `/app/auctions/${auctionId}/results/export/csv`,
    );
    expect(organizerCsv.status()).toBe(200);
    const organizerCsvText = await organizerCsv.text();
    for (const phone of Object.values(PHONES)) {
      expect(organizerCsvText).toContain(phone.slice(1));
    }

    const pdf = await page.request.get(
      `/app/auctions/${auctionId}/results/export/pdf`,
    );
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()["content-type"]).toContain("application/pdf");
    const pdfText = await pdf.text();
    for (const phone of Object.values(PHONES)) {
      expect(pdfText).not.toContain(phone.slice(1));
    }

    // A Representative keeps only its own Roster's phone numbers.
    await setup.redsRepPage.goto(`/app/auctions/${auctionId}/results`);
    await expect(
      setup.redsRepPage.getByRole("heading", { name: "Auction Results" }),
    ).toBeVisible();
    await setup.redsRepPage.getByText(/Show Player details/).click();
    await expect(
      setup.redsRepPage.getByRole("cell", { name: PHONES.alice, exact: true }),
    ).toBeVisible();
    await expect(
      setup.redsRepPage
        .getByRole("cell", { name: "Hidden", exact: true })
        .first(),
    ).toBeVisible();

    const repCsv = await setup.redsRepPage.request.get(
      `/app/auctions/${auctionId}/results/export/csv`,
    );
    const repCsvText = await repCsv.text();
    expect(repCsvText).toContain(PHONES.alice.slice(1));
    expect(repCsvText).not.toContain(PHONES.bob.slice(1));
    expect(repCsvText).not.toContain(PHONES.carol.slice(1));

    // An unrelated User can neither read Results nor export them. The page
    // streams, so its privacy guarantee is the content: the not-found page and
    // none of the Auction's data. The export route answers 404 outright.
    await signIn(strangerPage, uniqueEmail("results-stranger"));
    const deniedPage = await strangerPage.request.get(
      `/app/auctions/${auctionId}/results`,
    );
    const deniedBody = await deniedPage.text();
    expect(deniedBody).not.toContain("Results Export Auction");
    expect(deniedBody).not.toContain(PHONES.alice.slice(1));
    const deniedCsv = await strangerPage.request.get(
      `/app/auctions/${auctionId}/results/export/csv`,
    );
    expect(deniedCsv.status()).toBe(404);
  } finally {
    await strangerContext.close();
    await setup.dispose();
  }
});
