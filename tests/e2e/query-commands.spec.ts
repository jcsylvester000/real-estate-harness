import { expect, test } from "@playwright/test";
import path from "node:path";
import { openApp, signIn } from "./helpers";

test.describe.configure({ mode: "serial" });

test("Deal Desk / commands: pick a feature, answer the follow-ups, get the answer", async ({ page }) => {
  await signIn(page);
  // Sample listings for the pickers.
  const ls = await openApp(page, "listings", "Listings");
  await ls.getByRole("button", { name: "Import CSV" }).click();
  await ls.locator('input[type="file"]').setInputFiles(path.join(process.cwd(), "tests/fixtures/grid-listings-sample.csv"));
  await expect(ls.getByRole("status").filter({ hasText: "rows read" })).toBeVisible();
  await page.locator('[data-window="listings"]').getByRole("button", { name: "Close" }).click();

  const dd = await openApp(page, "deal-desk", "Deal Desk AI");
  const box = dd.getByLabel("Message");
  const menu = dd.getByTestId("command-menu");

  // Typing "/" opens the commands; typing filters them.
  await box.fill("/");
  await expect(menu).toBeVisible();
  await box.fill("/calc");
  await expect(menu.getByRole("option")).toHaveCount(1);
  await box.press("Enter");
  await expect(menu).toContainText("Which calculator?");
  await menu.getByRole("option", { name: /One lender's monthly payment/ }).click();
  await expect(menu).toContainText("Which lender?");
  await box.fill("pag");
  await box.press("Enter");
  await expect(menu).toContainText("Property price");
  await box.fill("3m");
  await expect(menu.getByRole("option").first()).toContainText("Use ₱3M");
  await box.press("Enter");
  await menu.getByRole("option", { name: /10% down/ }).click();
  await menu.getByRole("option", { name: /30 years/ }).click();
  await expect(dd.getByText("Pag-IBIG Fund home loan for ₱3M, 10% down, 30 years")).toBeVisible();
  await expect(dd.getByText("Calculations used: lenders.compare").last()).toBeVisible({ timeout: 15_000 });

  // Backspace on an empty box goes back a step; Esc closes.
  await box.fill("/");
  await menu.getByRole("option", { name: /Listings/ }).click();
  await expect(menu).toContainText("Which listing?");
  await box.press("Backspace");
  await expect(menu).toContainText("Commands");
  await box.press("Escape");
  await expect(menu).toBeHidden();

  // Listings flow: search, pick, act.
  await box.fill("/list");
  await box.press("Enter");
  await box.fill("Merville");
  await menu.getByRole("option", { name: /Merville/ }).click();
  await menu.getByRole("option", { name: /Taxes and fees/ }).click();
  await expect(dd.getByText("Calculations used: compute_acquisition_costs").last()).toBeVisible({ timeout: 15_000 });

  // "Up next" predicts a follow-up command from what is on screen.
  await expect(dd.getByRole("group", { name: "Up next" }).or(dd.getByLabel("Up next"))).toBeVisible();
});

test("starter cards open the same flows, and the box predicts the rest of a sentence", async ({ page }) => {
  await signIn(page);
  const dd = await openApp(page, "deal-desk", "Deal Desk AI");
  await dd.locator('[data-starter="search"]').click();
  const menu = dd.getByTestId("command-menu");
  await expect(menu).toContainText("Buy or rent?");
  await menu.getByRole("option", { name: /Rent/ }).click();
  await menu.getByRole("option", { name: /Condominium unit/ }).click();
  await menu.getByRole("option", { name: /^Taguig/ }).click();
  await menu.getByRole("option", { name: /Up to ₱60k/ }).click();
  await expect(dd.getByText("Find condo for rent in Taguig under ₱60k")).toBeVisible();
  await expect(dd.getByText("Calculations used: listings.search").last()).toBeVisible({ timeout: 15_000 });

  const box = dd.getByLabel("Message");
  await box.fill("How much can a buyer");
  await expect(dd.getByTestId("ghost")).toHaveText(" earning ₱80k a month afford?");
  await box.press("Tab");
  await expect(box).toHaveValue("How much can a buyer earning ₱80k a month afford?");
});

test("desktop icons snap to the grid or move freely", async ({ page }) => {
  await signIn(page);
  const icon = page.locator('[data-desktop-icon="notes"]');
  await page.waitForTimeout(700); // let the icons' entrance animation finish
  const before = (await icon.boundingBox())!;
  // Grid mode: drag about one cell right; the icon lands exactly on a cell.
  await page.mouse.move(before.x + 40, before.y + 30);
  await page.mouse.down();
  await page.mouse.move(before.x + 100, before.y + 50, { steps: 6 });
  await page.mouse.move(before.x + 140, before.y + 40, { steps: 4 });
  await page.mouse.up();
  const snapped = (await icon.boundingBox())!;
  expect(snapped.x - before.x).toBeCloseTo(96, -1);
  expect(snapped.y).toBeCloseTo(before.y, -1);

  // Free mode: the icon stays where it is dropped.
  await page.locator("[data-desktop-surface]").click({ button: "right", position: { x: 700, y: 400 } });
  await page.getByRole("menuitemradio", { name: "Free icon placement" }).click();
  const b2 = (await icon.boundingBox())!;
  await page.mouse.move(b2.x + 40, b2.y + 30);
  await page.mouse.down();
  await page.mouse.move(640, 430, { steps: 8 });
  await page.mouse.up();
  const free = (await icon.boundingBox())!;
  expect(Math.abs(free.x - 600)).toBeLessThan(6);
  expect(Math.abs(free.y - 400)).toBeLessThan(6);

  // Saved: still there after a reload. Then tidy up.
  await page.waitForTimeout(800); // the drop is saved right after release
  await page.reload();
  await expect(icon).toBeVisible();
  const reloaded = (await icon.boundingBox())!;
  expect(Math.abs(reloaded.x - free.x)).toBeLessThan(3);
  await page.locator("[data-desktop-surface]").click({ button: "right", position: { x: 700, y: 400 } });
  await page.getByRole("menuitemradio", { name: "Snap icons to grid" }).click();
  // A double-click still opens the app.
  await icon.dblclick();
  await expect(page.locator('[data-window="notes"]')).toBeVisible();
});
