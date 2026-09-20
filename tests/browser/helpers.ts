import { expect } from "@playwright/test";
import type { APIRequestContext, Page } from "@playwright/test";

export function uniqueEmail(label: string): string {
  return `browser-${label}-${Date.now()}-${Math.floor(
    Math.random() * 1_000_000,
  )}@example.com`;
}

/**
 * Better Auth throttles OTP requests per IP. Every browser test runs from the
 * suite's loopback address, so a fresh forwarded address per sign-in keeps
 * parallel tests in separate buckets, the same way the database tests do.
 */
function uniqueIp(): string {
  const octet = () => Math.floor(Math.random() * 254) + 1;
  return `198.51.${octet()}.${octet()}`;
}

export async function setFreshClientIp(page: Page): Promise<void> {
  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": uniqueIp() });
}

export async function readOtp(
  request: APIRequestContext,
  email: string,
): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await request.get(
      `/api/dev/test-inbox?email=${encodeURIComponent(email)}&type=sign-in`,
    );
    const body = (await response.json()) as { otp?: string | null } | null;
    if (body?.otp) return body.otp;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`No OTP was recorded for ${email}`);
}

export async function readInvitationLink(
  request: APIRequestContext,
  email: string,
): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await request.get(
      `/api/dev/test-inbox?email=${encodeURIComponent(email)}&type=invitation`,
    );
    const body = (await response.json()) as { link?: string | null } | null;
    if (body?.link) return body.link;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`No invitation was recorded for ${email}`);
}

export async function signIn(page: Page, email: string): Promise<void> {
  await setFreshClientIp(page);
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByLabel("Code")).toBeVisible();
  await page.getByLabel("Code").fill(await readOtp(page.request, email));
  await page.getByRole("button", { name: "Verify and sign in" }).click();
  await expect(page).toHaveURL(/\/app$/);
}

export async function createDraftAuction(
  page: Page,
  {
    closeMode = "Manual Close",
    game = "Chess",
    rulesMode = "Simple Rules",
    title,
  }: { closeMode?: string; game?: string; rulesMode?: string; title: string },
): Promise<void> {
  await page.getByRole("link", { name: "New Auction" }).click();
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Game").fill(game);
  await page.getByRole("button", { name: rulesMode }).click();
  await page.getByRole("button", { name: closeMode }).click();
  await page.getByRole("button", { name: "Create Draft Auction" }).click();
  await expect(page).toHaveURL(/\/app\/auctions\/[^/]+\/setup\/basics$/);
}

export async function addTeam(page: Page, name: string): Promise<void> {
  const addForm = page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "Add Team" }) });
  await addForm.getByLabel("Team name").fill(name);
  await addForm.getByRole("button", { name: "Add Team" }).click();
  await expect(page.getByRole("cell", { name, exact: true })).toBeVisible();
}

export async function assignPlayerRepresentative(
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

export async function addPlayerEntry(
  page: Page,
  displayName: string,
): Promise<void> {
  const addForm = page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "Add Player" }) });
  await addForm.getByLabel("Display name").fill(displayName);
  await addForm.getByRole("button", { name: "Add Player" }).click();
  // Saving resets the add form; wait for that before the next fill.
  await expect(addForm.getByLabel("Display name")).toHaveValue("");
}
