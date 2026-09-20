import { test as base } from "@playwright/test";

/**
 * Extends the default `page` fixture with a fresh forwarded client address per
 * test. Better Auth throttles OTP requests per IP; every browser test would
 * otherwise share the suite's loopback address and exhaust that bucket as the
 * suite grows, the same way the database tests assign each case its own IP.
 */
export const test = base.extend({
  page: async ({ page }, provide) => {
    const octet = () => Math.floor(Math.random() * 254) + 1;
    await page.context().setExtraHTTPHeaders({
      "x-forwarded-for": `198.51.${octet()}.${octet()}`,
    });
    await provide(page);
  },
});

export { expect } from "@playwright/test";
