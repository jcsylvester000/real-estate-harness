import { expect, test } from "@playwright/test";
import { openApp, signIn } from "./helpers";

test("on a phone, apps open full screen and the page does not scroll sideways", async ({ page }) => {
  await signIn(page);
  await page.locator('[data-desktop-icon="listings"]').click();
  const win = page.locator('[data-window="listings"]');
  await expect(win).toBeVisible();
  const box = (await win.boundingBox())!;
  const vp = page.viewportSize()!;
  expect(Math.round(box.width)).toBe(vp.width);
  const listings = page.locator('[data-window="listings"] iframe').contentFrame();
  await expect(listings.getByText("DEMO-001")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  void openApp;
});
