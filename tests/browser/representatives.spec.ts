import { expect, test } from "./fixtures";
import type { Page } from "@playwright/test";

import {
  addPlayerEntry,
  createDraftAuction,
  readInvitationLink,
  readOtp,
  setFreshClientIp,
  signIn,
  uniqueEmail,
} from "./helpers";

async function addTeam(page: Page, name: string): Promise<void> {
  const addForm = page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "Add Team" }) });
  await addForm.getByLabel("Team name").fill(name);
  await addForm.getByRole("button", { name: "Add Team" }).click();
  await expect(page.getByRole("cell", { name, exact: true })).toBeVisible();
}

async function openRepresentatives(page: Page): Promise<void> {
  await page.getByRole("link", { name: "Representatives" }).click();
  await expect(page).toHaveURL(/\/setup\/representatives$/);
  await expect(
    page.getByRole("heading", { name: "Representatives" }),
  ).toBeVisible();
}

async function buildTeamsAndPlayers(page: Page, title: string): Promise<void> {
  await createDraftAuction(page, { title });
  await page.getByRole("link", { name: "Players" }).click();
  await expect(page).toHaveURL(/\/setup\/players$/);
  await addPlayerEntry(page, "Alice");
  await addPlayerEntry(page, "Bob");
  await page.getByRole("link", { name: "Teams", exact: true }).click();
  await expect(page).toHaveURL(/\/setup\/teams$/);
  await addTeam(page, "Reds");
  await addTeam(page, "Blues");
}

test("an Organizer assigns a registered User as a Player Representative", async ({
  browser,
  page,
}) => {
  const representativeEmail = uniqueEmail("player-rep");
  const representativeContext = await browser.newContext();
  try {
    await signIn(await representativeContext.newPage(), representativeEmail);

    await signIn(page, uniqueEmail("rep-organizer"));
    await buildTeamsAndPlayers(page, "Representative Draft");
    await openRepresentatives(page);

    const reds = page
      .locator("li")
      .filter({ hasText: "Reds" })
      .filter({ has: page.getByLabel("Representative email") });
    await reds.getByLabel("Player Entry").selectOption({ label: "Alice" });
    await reds.getByLabel("Representative email").fill(representativeEmail);
    await reds
      .getByRole("button", { name: "Assign Player Representative" })
      .click();

    await expect(page.getByText("Player Representative: Alice")).toBeVisible();

    await page.reload();
    await expect(page.getByText("Player Representative: Alice")).toBeVisible();
  } finally {
    await representativeContext.close();
  }
});

test("an invited Outside Representative can register and accept", async ({
  browser,
  page,
}) => {
  const inviteeEmail = uniqueEmail("outside-rep");
  await signIn(page, uniqueEmail("invite-organizer"));
  await buildTeamsAndPlayers(page, "Invitation Draft");
  await openRepresentatives(page);

  const reds = page
    .locator("li")
    .filter({ hasText: "Reds" })
    .filter({ has: page.getByLabel("Representative email") });
  await reds.getByLabel("Representative email").fill(inviteeEmail);
  await reds
    .getByRole("button", { name: "Invite Outside Representative" })
    .click();
  await expect(
    page.getByText(`Invitation sent to ${inviteeEmail}.`),
  ).toBeVisible();

  const link = await readInvitationLink(page.request, inviteeEmail);
  const path = new URL(link).pathname;

  const inviteeContext = await browser.newContext();
  try {
    const invitee = await inviteeContext.newPage();
    await invitee.goto(path);
    await expect(
      invitee.getByRole("heading", { name: "Represent Reds" }),
    ).toBeVisible();
    await invitee.getByRole("link", { name: "Sign in to accept" }).click();

    await expect(invitee.getByLabel("Email")).toBeVisible();
    await setFreshClientIp(invitee);
    await invitee.getByLabel("Email").fill(inviteeEmail);
    await invitee.getByRole("button", { name: "Send code" }).click();
    await expect(invitee.getByLabel("Code")).toBeVisible();
    await invitee
      .getByLabel("Code")
      .fill(await readOtp(invitee.request, inviteeEmail));
    await invitee.getByRole("button", { name: "Verify and sign in" }).click();

    await expect(invitee).toHaveURL(new RegExp(`${path}$`));
    await invitee.getByRole("button", { name: "Accept invitation" }).click();
    await expect(invitee).toHaveURL(/\/app$/);

    await page.reload();
    // The accepted invitee now appears as the Team's Outside Representative.
    await expect(page.getByText(inviteeEmail)).toBeVisible();
  } finally {
    await inviteeContext.close();
  }
});
