/**
 * The whole user journey, as a broker would use Grid Agentic, from the PIN screen to a cited research answer.
 * With JOURNEY_SHOTS=<folder>, it also saves the screenshots used in the User Journey documentation.
 * The AI and the web are the local stand-in from stub-ai.ts (no network, no real key).
 */
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import type { Server } from "node:http";
import path from "node:path";
import { openApp, PIN } from "./helpers";
import { startStub } from "./stub-ai";

test.describe.configure({ mode: "serial" });
// Documentation screenshots are taken at 2x for sharp images in the Word documents.
if (process.env.JOURNEY_SHOTS) test.use({ deviceScaleFactor: 2 });
const SHOTS = process.env.JOURNEY_SHOTS;
let stub: Server;
let shotNo = 0;

async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  shotNo++;
  await page.waitForTimeout(450); // let entrance animations settle
  await page.screenshot({ path: path.join(SHOTS, `${String(shotNo).padStart(2, "0")}-${name}.png`) });
}
const maximize = (page: Page, id: string) => page.locator(`[data-window="${id}"]`).getByRole("button", { name: "Maximize" }).click();
const close = (page: Page, id: string) => page.locator(`[data-window="${id}"]`).getByRole("button", { name: "Close" }).last().click();

test.beforeAll(async () => {
  stub = await startStub(4011);
});
test.afterAll(() => new Promise<void>((ok) => stub.close(() => ok())));

test("a broker's day: PIN, listings, search, matching, loans, Deal Desk, AI key, Agent, Research, Property Teaser, Settings", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 900 });

  // 1. Unlock.
  await page.goto("/desktop");
  await expect(page.getByLabel("PIN")).toBeVisible();
  await shot(page, "pin");
  await page.getByLabel("PIN").fill(PIN);
  await expect(page.getByRole("navigation", { name: "Taskbar" })).toBeVisible();
  await shot(page, "desktop");

  // 2. Import listings.
  const ls = await openApp(page, "listings", "Listings");
  await maximize(page, "listings");
  await ls.getByRole("button", { name: "Import CSV" }).click();
  await ls.locator('input[type="file"]').setInputFiles(path.join(process.cwd(), "tests/fixtures/grid-listings-sample.csv"));
  await expect(ls.getByRole("status").filter({ hasText: "rows read" })).toBeVisible();
  await shot(page, "listings-import");
  await close(page, "listings");

  // 3. Property Finder: a client's request in plain words.
  const pf = await openApp(page, "property-finder", "Property Finder");
  await maximize(page, "property-finder");
  await pf.getByLabel("What is the client looking for?").fill("condo for rent in Taguig under 40k");
  await pf.getByRole("button", { name: "Search", exact: true }).click();
  await expect(pf.locator("[data-listing]").first()).toBeVisible();
  await shot(page, "property-finder");
  await close(page, "property-finder");

  // 4. Buyer Matching.
  const bm = await openApp(page, "buyer-match", "Buyer Matching");
  await maximize(page, "buyer-match");
  await bm.getByRole("button", { name: "Rent", exact: true }).click();
  await bm.getByLabel("Property kind").selectOption("condominium-unit");
  await bm.getByLabel("City").selectOption("Taguig");
  await bm.getByLabel("Budget up to").selectOption("40000");
  await expect(bm.locator("[data-match]").first()).toBeVisible();
  await bm.locator("[data-match]").first().getByRole("button", { name: "Why this score" }).click();
  await shot(page, "buyer-matching");
  await close(page, "buyer-match");

  // 5. Calculators: home loan across lenders.
  const calc = await openApp(page, "calculators", "Calculators");
  await maximize(page, "calculators");
  await calc.getByLabel("Property price (₱)").fill("7600000");
  await calc.getByLabel("Down payment").fill("20");
  await expect(calc.locator("[data-lender=pagibig]")).toBeVisible();
  await shot(page, "calculators-lenders");
  await close(page, "calculators");

  // 6. Deal Desk with the Query Engine (no AI) and the "/" menu.
  const dd = await openApp(page, "deal-desk", "Deal Desk AI");
  await maximize(page, "deal-desk");
  await shot(page, "deal-desk-start");
  const box = dd.getByLabel("Message");
  await box.fill("/");
  await expect(dd.getByTestId("command-menu")).toBeVisible();
  await shot(page, "deal-desk-commands");
  await box.press("Escape");
  await box.fill("Cost to buy a ₱7.6M condo in Pasig");
  await box.press("Enter");
  await expect(dd.getByText(/Calculations used/).last()).toBeVisible({ timeout: 15_000 });
  await shot(page, "deal-desk-query-engine");
  // Without a key, Agent and Research are off.
  await expect(dd.getByRole("radio", { name: "Research" })).toHaveAttribute("aria-disabled", "true");

  // 7. Add an AI key (the stand-in AI service) and test it. Tapping Research without a key offers to add one.
  await dd.getByRole("radio", { name: "Research" }).click({ force: true });
  const dlg = dd.getByRole("dialog", { name: "Add an AI key" });
  await shot(page, "add-key-providers");
  await dlg.getByRole("radio", { name: /Other OpenAI-compatible/ }).click();
  await dlg.getByLabel(/Base URL/).fill("http://127.0.0.1:4011/v1");
  await dlg.getByLabel("Model", { exact: true }).fill("demo-model");
  await dlg.locator("#ak-name").fill("Office AI");
  await dlg.getByLabel(/API key/).fill("sk-demo-key-for-the-walkthrough-0001");
  await dlg.getByRole("button", { name: "Test connection" }).click();
  await expect(dlg.getByRole("button", { name: "Add to my AIs" })).toBeVisible({ timeout: 20_000 });
  await shot(page, "add-key-tested");
  await dlg.getByRole("button", { name: "Add to my AIs" }).click();
  await expect(dd.locator("#provider")).toHaveValue(/^mine:/);
  await expect(dd.getByRole("radio", { name: "Agent" })).toHaveAttribute("aria-disabled", "false");

  // 8. Agent: work in the apps.
  await dd.getByRole("button", { name: "New" }).first().click();
  await dd.getByRole("radio", { name: "Agent" }).click();
  await box.fill("Find the Merville house and make a presentation for it");
  await box.press("Enter");
  const agentAnswer = dd.locator("article").filter({ hasText: "made a presentation" });
  await expect(agentAnswer).toBeVisible({ timeout: 30_000 });
  await expect(agentAnswer.getByText("Agent", { exact: true })).toBeVisible();
  await shot(page, "agent-answer");
  await agentAnswer.locator('[data-action="property-teaser"]').click();
  const tz = page.locator('[data-window="property-teaser"] iframe').last().contentFrame();
  await expect(tz.getByTestId("teaser-editor")).toBeVisible({ timeout: 20_000 });
  await maximize(page, "property-teaser");
  await shot(page, "teaser-editor-from-agent");
  await close(page, "property-teaser");

  // 9. Research: "/" → Research → Zonal value.
  await box.fill("/research");
  await box.press("Enter");
  const menu = dd.getByTestId("command-menu");
  await menu.getByRole("option", { name: /Zonal value/ }).click();
  await box.fill("Ortigas Avenue, San Antonio, Pasig City");
  await box.press("Enter");
  const research = dd.locator("article").filter({ hasText: "₱210,000 per sqm" });
  await expect(research).toBeVisible({ timeout: 45_000 });
  const sources = research.getByTestId("sources");
  await expect(sources).toContainText("Zonal Values – RDO No. 43");
  await expect(research.getByRole("link", { name: /^S\d+$/ }).first()).toBeVisible();
  await expect(dd.getByRole("radio", { name: "Research" })).toHaveAttribute("aria-checked", "true");
  await research.scrollIntoViewIfNeeded();
  await shot(page, "research-answer");

  // 10. Property Teaser intake from Deal Desk.
  await box.fill("/teaser");
  await box.press("Enter");
  await menu.getByRole("option", { name: /New presentation/ }).click();
  await menu.getByRole("option", { name: /^Customize/ }).click();
  const card = dd.getByTestId("teaser-intake");
  await card.getByLabel("Type or paste everything about the property").fill("Verde Residences\nBeautifull 2 bedrom condo in Alabng, 68 sqm, swiming pool, gym. Price: P8.5M. Contact Ana Cruz 0917 123 4567");
  await card.getByRole("button", { name: "Understand it" }).click();
  await expect(card.getByTestId("intake-fixes")).toBeVisible();
  await card.scrollIntoViewIfNeeded();
  await shot(page, "teaser-intake-sheet");
  await close(page, "deal-desk");

  // 11. Property Teaser home, templates.
  const pt = await openApp(page, "property-teaser", "Property Teaser");
  await maximize(page, "property-teaser");
  await expect(pt.locator("[data-project]").first()).toBeVisible();
  await shot(page, "teaser-home");
  await pt.locator('[data-new="deck"]').click();
  await expect(pt.locator("[data-template]")).toHaveCount(20);
  await shot(page, "teaser-templates");
  await close(page, "property-teaser");

  // 12. Settings → AI setup.
  const st = await openApp(page, "settings", "Settings");
  await maximize(page, "settings");
  await st.getByRole("button", { name: /AI setup/ }).or(st.getByRole("tab", { name: /AI setup/ })).first().click();
  await expect(st.getByTestId("ai-modes")).toBeVisible();
  await expect(st.getByTestId("saved-keys")).toContainText("Office AI");
  await shot(page, "settings-ai");
  await expect(page.locator('[data-ai-status="ready"]')).toBeVisible();

  // Clean up: remove the walkthrough key; the badge goes back to the Query Engine.
  await st.getByRole("button", { name: "Remove Office AI" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Remove" }).click();
  await expect(st.getByTestId("saved-keys")).toHaveCount(0);
  await expect(page.locator('[data-ai-status="off"]')).toBeVisible();
});

test("on a phone, Deal Desk opens full screen", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto("/desktop");
  await page.getByLabel("PIN").fill(PIN);
  await expect(page.getByRole("navigation", { name: "Taskbar" })).toBeVisible();
  await page.locator('[data-desktop-icon="deal-desk"]').click();
  const dd = page.locator('[data-window="deal-desk"] iframe').last().contentFrame();
  await expect(dd.getByLabel("Message")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  if (SHOTS) {
    mkdirSync(SHOTS, { recursive: true });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(SHOTS, "99-mobile-deal-desk.png") });
  }
  await ctx.close();
});
