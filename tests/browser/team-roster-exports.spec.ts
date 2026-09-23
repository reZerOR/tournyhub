import { createHmac, randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { Pool } from "pg";
import type { BrowserContext } from "@playwright/test";
import { expect, test } from "./fixtures";

// Seed closed fixtures directly so this test never interrupts a Live Auction.
test("team rosters support copy, styled downloads and authorized team scopes", async ({
  page,
  browser,
  baseURL,
}, testInfo) => {
  test.setTimeout(180_000);
  const pool = new Pool({
    connectionString:
      process.env.DATABASE_URL ??
      "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  });
  const userIds: string[] = [];
  const representativeContext = await browser.newContext();
  async function login(context: BrowserContext, name: string) {
    const id = randomUUID();
    const token = randomUUID();
    userIds.push(id);
    await pool.query(
      'insert into "user" (id, name, email, "emailVerified") values ($1, $2, $3, true)',
      [id, name, `browser-roster-${id}@example.com`],
    );
    await pool.query(
      'insert into "session" (id, token, "userId", "expiresAt", "updatedAt") values ($1, $2, $3, now() + interval \'1 hour\', now())',
      [randomUUID(), token, id],
    );
    const signature = createHmac(
      "sha256",
      process.env.BETTER_AUTH_SECRET ?? "browser-test-secret-of-32-chars!!",
    )
      .update(token)
      .digest("base64");
    await context.addCookies([
      {
        name: "tournyhub.session_token",
        value: encodeURIComponent(`${token}.${signature}`),
        url: baseURL!,
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    return id;
  }

  try {
    const organizerId = await login(page.context(), "Roster Organizer");
    const representativeId = await login(
      representativeContext,
      "Team A Representative",
    );
    const auctionId = randomUUID();
    await pool.query(
      "insert into auction (id, organizer_id, title, game, rules_mode, close_mode, status) values ($1, $2, $3, 'Chess', 'tiered', 'manual', 'completed')",
      [auctionId, organizerId, "Winter Classic"],
    );
    await pool.query(
      "insert into auction_rule_set (auction_id, budget) values ($1, 10000)",
      [auctionId],
    );
    const tierId = randomUUID();
    await pool.query(
      "insert into tier (id, auction_id, label, normalized_label, starting_price, max_per_team) values ($1, $2, 'Grandmaster', 'grandmaster', 100, 5)",
      [tierId, auctionId],
    );
    const teams: string[] = [];
    const names = [
      ["Raihan", "Elena Petrova", "Kavya Nair", "Grace Okafor"],
      ["Jonas Berg", "Bianca Ferreira", "Maya Cohen", "Noor Al-Amin"],
      ["Aarav Menon", "Diego Alvarez", "Isla McGregor", "Omar Haddad"],
    ];
    for (let i = 0; i < names.length; i++) {
      const teamId = randomUUID();
      teams.push(teamId);
      await pool.query(
        "insert into team (id, auction_id, name, color, position, representative_user_id, representative_type) values ($1, $2, $3, $4, $5, $6, $7)",
        [
          teamId,
          auctionId,
          `Team ${String.fromCharCode(65 + i)}`,
          ["#00cfe8", "#a855f7", "#10b981"][i],
          i,
          i === 0 ? representativeId : null,
          i === 0 ? "player" : null,
        ],
      );
      for (const [index, name] of names[i]!.entries()) {
        const playerId = randomUUID();
        await pool.query(
          "insert into player_entry (id, auction_id, display_name, phone_number, team_id, is_representative, tier_id) values ($1, $2, $3, $4, $5, $6, $7)",
          [
            playerId,
            auctionId,
            name,
            `+8801000000${i}${index}`,
            index === 0 ? teamId : null,
            index === 0,
            index === 0 ? null : tierId,
          ],
        );
        if (index > 0) {
          const presentationId = randomUUID();
          await pool.query(
            "insert into player_presentation (id, auction_id, player_entry_id, starting_price, selection_method, state, close_mode) values ($1, $2, $3, 100, 'manual', 'sold', 'manual')",
            [presentationId, auctionId, playerId],
          );
          await pool.query(
            "insert into sale (auction_id, presentation_id, player_entry_id, team_id, amount, source) values ($1, $2, $3, $4, $5, $6)",
            [
              auctionId,
              presentationId,
              playerId,
              teamId,
              1200 + index * 55,
              index === 2 ? "forced" : "bid",
            ],
          );
        }
      }
    }
    const path = `/app/auctions/${auctionId}/results`;
    await page.goto(path);
    await expect(
      page.getByRole("heading", { name: "Auction Results" }),
    ).toBeVisible();
    await expect(page.getByText("Champion", { exact: true })).toHaveCount(0);
    const team = page.getByRole("region", { name: "Team A", exact: true });
    await expect(
      team.getByRole("cell", { name: "Raihan", exact: true }),
    ).toBeVisible();
    await page
      .context()
      .grantPermissions(["clipboard-read", "clipboard-write"]);
    await team.getByRole("button", { name: "Copy roster" }).click();
    await expect(
      team.getByRole("button", { name: "Copied", exact: true }),
    ).toBeVisible();
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toContain("Grace Okafor");
    expect(clipboard).not.toContain("Jonas Berg");
    expect(clipboard).not.toContain("+880");

    const download = page.waitForEvent("download");
    await team.getByRole("link", { name: "Excel", exact: true }).click();
    expect((await download).suggestedFilename()).toContain(
      "Team-A-results.xlsx",
    );
    const pdf = await page.request.get(`${path}/export/pdf?teamId=${teams[0]}`);
    expect(pdf.status()).toBe(200);
    const pdfBytes = await pdf.body();
    expect(pdfBytes.toString("latin1")).toContain("Grace Okafor");
    expect(pdfBytes.toString("latin1")).not.toContain("Jonas Berg");
    expect(pdfBytes.toString("latin1")).not.toContain("+880");
    await writeFile(testInfo.outputPath("team-a.pdf"), pdfBytes);
    const allPdf = await page.request.get(`${path}/export/pdf`);
    await writeFile(testInfo.outputPath("all-teams.pdf"), await allPdf.body());
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: testInfo.outputPath("results-desktop.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: testInfo.outputPath("results-mobile.png"),
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);

    await page.addInitScript(() =>
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: () => Promise.reject(new Error("Blocked")) },
      }),
    );
    await page.reload();
    await team.getByRole("button", { name: "Copy roster" }).click();
    await expect(
      team.getByRole("textbox", { name: "Team A roster text" }),
    ).toBeVisible();

    const repPage = await representativeContext.newPage();
    await repPage.goto(path);
    const otherTeam = repPage.getByRole("region", {
      name: "Team B",
      exact: true,
    });
    await expect(
      otherTeam.getByRole("link", { name: "Excel", exact: true }),
    ).toHaveCount(0);
    await expect(
      otherTeam.getByRole("link", { name: "PDF", exact: true }),
    ).toBeVisible();
    for (const format of ["csv", "xlsx"]) {
      expect(
        (
          await repPage.request.get(
            `${path}/export/${format}?teamId=${teams[1]}`,
          )
        ).status(),
      ).toBe(404);
      expect(
        (
          await repPage.request.get(
            `${path}/export/${format}?teamId=${teams[0]}`,
          )
        ).status(),
      ).toBe(200);
    }
    expect(
      (await repPage.request.get(`${path}/export/pdf?teamId=missing`)).status(),
    ).toBe(404);
    const csv = await repPage.request.get(`${path}/export/csv`);
    expect(await csv.text()).not.toContain("Jonas Berg");
    expect(await csv.text()).toContain("+880100000000");
    const audit = await pool.query(
      "select details from audit_entry where auction_id = $1 and action = 'export_results'",
      [auctionId],
    );
    expect(
      audit.rows.some(
        (row) =>
          row.details.format === "xlsx" && row.details.phoneNumberCount === 4,
      ),
    ).toBe(true);
  } finally {
    await representativeContext.close();
    await pool.query('delete from "user" where id = any($1::text[])', [
      userIds,
    ]);
    await pool.end();
  }
});
