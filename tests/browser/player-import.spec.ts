import { readFile } from "node:fs/promises";

import { expect, test } from "./fixtures";
import type { APIRequestContext, Page } from "@playwright/test";
import * as XLSX from "xlsx";

function uniqueEmail(label: string): string {
  return `browser-import-${label}-${Date.now()}-${Math.floor(
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
  await expect(
    page.getByRole("heading", { exact: true, name: "Players" }),
  ).toBeVisible();
}

async function uploadCsv(page: Page, name: string, content: string) {
  await page.getByLabel("Import file").setInputFiles({
    buffer: Buffer.from(content),
    mimeType: "text/csv",
    name,
  });
  await page.getByRole("button", { name: "Preview import" }).click();
}

test("an Organizer previews and imports Player Entries from a CSV", async ({
  page,
}) => {
  await signIn(page, uniqueEmail("csv"));
  await openPlayersSection(page);

  const fieldForm = page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "Add field" }) });
  await fieldForm.getByLabel("Field label").fill("Position");
  await fieldForm.getByRole("button", { name: "Add field" }).click();
  await expect(fieldForm.getByLabel("Field label")).toHaveValue("");

  await uploadCsv(
    page,
    "players.csv",
    "Role,Player Name,Phone,Position\n" +
      "=CAPTAIN,Alice,+15550102030,Defender\n" +
      ",=1+1,,\n",
  );

  await expect(page.getByLabel("Map column Player Name")).toHaveValue(
    "displayName",
  );
  await expect(page.getByLabel("Map column Role")).toHaveValue("role");
  await expect(page.getByLabel("Map column Phone")).toHaveValue("phoneNumber");
  await expect(page.getByLabel("Map column Position")).toHaveValue(/^custom:/);

  await expect(
    page.getByText(/2 Player Entries accepted, 0 with warnings, 0 with errors/),
  ).toBeVisible();

  await page.getByRole("button", { name: "Import 2 Players" }).click();
  await expect(page.getByText(/Imported 2 Player Entries/)).toBeVisible();

  const table = page.getByRole("table", { name: "Player Entries" });
  await expect(table.getByRole("cell", { name: "Alice" })).toBeVisible();
  await expect(table.getByRole("cell", { name: "=1+1" })).toBeVisible();
  await expect(table.getByRole("cell", { name: "=CAPTAIN" })).toBeVisible();
  await expect(table).not.toContainText("+15550102030");
});

test("an Organizer imports a chosen worksheet from an XLSX file", async ({
  page,
}) => {
  await signIn(page, uniqueEmail("xlsx"));
  await openPlayersSection(page);

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([["Name"], ["Ignored"]]),
    "First",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([["Player Name"], ["Bob"]]),
    "Roster",
  );

  await page.getByLabel("Import file").setInputFiles({
    buffer: Buffer.from(
      XLSX.write(workbook, { bookType: "xlsx", type: "array" }) as ArrayBuffer,
    ),
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    name: "players.xlsx",
  });
  await page.getByRole("button", { name: "Preview import" }).click();

  await page.getByLabel("Worksheet").selectOption("Roster");
  await expect(
    page.getByText(/1 Player Entry accepted, 0 with warnings, 0 with errors/),
  ).toBeVisible();

  await page.getByRole("button", { name: "Import 1 Players" }).click();
  await expect(page.getByText(/Imported 1 Player Entry/)).toBeVisible();

  const table = page.getByRole("table", { name: "Player Entries" });
  await expect(table.getByRole("cell", { name: "Bob" })).toBeVisible();
  await expect(table).not.toContainText("Ignored");
});

test("an Organizer downloads row-specific import errors and nothing is saved", async ({
  page,
}) => {
  await signIn(page, uniqueEmail("errors"));
  await openPlayersSection(page);

  await uploadCsv(page, "players.csv", "Name,Phone\nAlice,nope\n");

  await expect(
    page.getByText(/0 Player Entries accepted, 0 with warnings, 1 with errors/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Import 0 Players" }),
  ).toBeDisabled();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download errors" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("player-import-errors.csv");

  const path = await download.path();
  const content = await readFile(path, "utf8");
  expect(content.split("\r\n")[0]).toBe("Row,Problem");
  expect(content).toContain("2,");

  const table = page.getByRole("table", { name: "Player Entries" });
  await expect(table).toContainText(
    "You haven't added any Player Entries yet.",
  );

  await page.reload();
  await expect(table).toContainText(
    "You haven't added any Player Entries yet.",
  );
});
