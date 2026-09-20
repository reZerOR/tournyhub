import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";

import { createDraftAuction, signIn, uniqueEmail } from "./helpers";

/**
 * A focused structural accessibility audit. It checks the properties this
 * application is responsible for — one main heading, labelled controls,
 * captioned tables, no duplicate ids, and named interactive elements — without
 * pulling in an external rule engine.
 */
async function auditPage(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const problems: string[] = [];

    // The application renders its page title either as a real heading or with
    // an equivalent ARIA level-1 heading role.
    const headings = document.querySelectorAll(
      'h1, [role="heading"][aria-level="1"]',
    );
    if (headings.length !== 1) {
      problems.push(
        `expected exactly one level-1 heading, found ${headings.length}`,
      );
    }

    const ids = new Map<string, number>();
    document.querySelectorAll("[id]").forEach((element) => {
      const id = element.getAttribute("id")!;
      ids.set(id, (ids.get(id) ?? 0) + 1);
    });
    for (const [id, count] of ids) {
      if (count > 1) problems.push(`duplicate id "${id}"`);
    }

    const labelled = (element: Element): boolean => {
      const aria = element.getAttribute("aria-label");
      if (aria && aria.trim().length > 0) return true;
      const labelledBy = element.getAttribute("aria-labelledby");
      if (labelledBy) {
        const target = document.getElementById(labelledBy);
        if (target?.textContent?.trim()) return true;
      }
      if (element.id) {
        const label = document.querySelector(`label[for="${element.id}"]`);
        if (label?.textContent?.trim()) return true;
      }
      if (element.closest("label")?.textContent?.trim()) return true;
      if (element.textContent?.trim()) return true;
      if (element.tagName === "SUMMARY") return true;
      if ((element as HTMLInputElement).type === "hidden") return true;
      return false;
    };

    document
      .querySelectorAll("button, a, input, select, textarea")
      .forEach((element) => {
        if (!labelled(element)) {
          problems.push(
            `${element.tagName.toLowerCase()} has no accessible name: ${element.outerHTML.slice(0, 80)}`,
          );
        }
      });

    document.querySelectorAll("img").forEach((image) => {
      if (image.getAttribute("alt") === null) {
        problems.push("img without an alt attribute");
      }
    });

    document.querySelectorAll("table").forEach((table) => {
      if (!table.querySelector("caption")) {
        problems.push("table without a caption");
      }
      if (table.querySelector("th") && !table.querySelector("th[scope]")) {
        problems.push("table header without a scope");
      }
    });

    return problems;
  });
}

test("sign-in, dashboard, and setup expose an accessible structure", async ({
  page,
}) => {
  test.setTimeout(120_000);

  await page.goto("/sign-in");
  await expect(page.getByLabel("Email")).toBeVisible();
  expect(await auditPage(page)).toEqual([]);

  await signIn(page, uniqueEmail("a11y-organizer"));
  // The authenticated shell streams a loading state first, so wait for the
  // page's own heading before auditing it.
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  expect(await auditPage(page)).toEqual([]);

  // The skip link is the first tabbable control, and focusing it reveals it.
  expect(
    await page.evaluate(() =>
      document.querySelector("a")?.getAttribute("href"),
    ),
  ).toBe("#main");
  const skipLink = page.getByRole("link", { name: "Skip to main content" });
  await skipLink.focus();
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toBeVisible();

  await createDraftAuction(page, { title: "Accessible Auction" });
  for (const section of ["Players", "Teams", "Rules", "Readiness"]) {
    await page.getByRole("link", { name: section, exact: true }).click();
    await expect(
      page.getByRole("heading", { name: section, exact: true }),
    ).toBeVisible();
    expect(await auditPage(page)).toEqual([]);
  }
});

test("essential actions stay reachable on a phone-sized screen", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 375, height: 667 });
  await signIn(page, uniqueEmail("a11y-phone"));

  await expect(page.getByRole("link", { name: "New Auction" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  await createDraftAuction(page, { title: "Phone Auction" });

  // The setup navigation stays a reachable, scrollable row rather than
  // disappearing on a narrow screen.
  const nav = page.getByRole("navigation", { name: "Auction setup" });
  await expect(nav).toBeVisible();
  await expect(page.getByRole("link", { name: "Readiness" })).toBeVisible();

  await page.getByRole("link", { name: "Players" }).click();
  await expect(page.getByLabel("Display name")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add Player" })).toBeVisible();
});
