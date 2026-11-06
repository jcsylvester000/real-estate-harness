import { expect, test } from "@playwright/test";
import JSZip from "jszip";
import { readFileSync } from "node:fs";
import path from "node:path";
import { openApp, signIn } from "./helpers";

test.describe.configure({ mode: "serial" });
const fx = (f: string) => path.join(process.cwd(), "tests/fixtures/teaser", f);

test("Add key: pick a provider, test the connection, see a plain reason when it fails", async ({ page }) => {
  await signIn(page);
  const dd = await openApp(page, "deal-desk", "Deal Desk AI");
  await expect(dd.locator("#provider option", { hasText: "Team key" })).toHaveCount(0);
  await dd.locator("#provider").selectOption("__add");
  const dlg = dd.getByRole("dialog", { name: "Add an AI key" });
  await expect(dlg.getByRole("radiogroup", { name: "AI provider" })).toBeVisible();
  await dlg.getByRole("radio", { name: /Other OpenAI-compatible/ }).click();
  await dlg.getByLabel(/Base URL/).fill("http://127.0.0.1:9/v1");
  await dlg.getByLabel("Model", { exact: true }).fill("local-model");
  await dlg.getByLabel(/API key/).fill("sk-test-not-a-real-key-000000");
  await dlg.getByRole("button", { name: "Test connection" }).click();
  const steps = dlg.getByTestId("key-test");
  await expect(steps).toContainText("Reach the provider and sign in");
  await expect(dlg.getByRole("button", { name: "Back to fix it" })).toBeVisible({ timeout: 20_000 });
  await expect(dlg.getByRole("button", { name: "Add to my AIs" })).toHaveCount(0);
  await dlg.getByRole("button", { name: "Close" }).click();
});

test('Deal Desk "/" Property Teaser: customize in one go, spelling fixed, sheet, Excel and PowerPoint', async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page);
  const dd = await openApp(page, "deal-desk", "Deal Desk AI");
  await page.locator('[data-window="deal-desk"]').getByRole("button", { name: "Maximize" }).click();
  const box = dd.getByLabel("Message");
  const menu = dd.getByTestId("command-menu");
  await box.fill("/teaser");
  await box.press("Enter");
  await menu.getByRole("option", { name: /New presentation/ }).click();
  await expect(menu).toContainText("Start from");
  await menu.getByRole("option", { name: /^Customize/ }).click();

  const card = dd.getByTestId("teaser-intake");
  await card.getByLabel("Type or paste everything about the property").fill(
    "Verde Residences\nBeautifull 2 bedrom condominum in Alabng, 68 sqm, 2 baths, 1 parking. Fully furnised with lake view.\nAmenities: swiming pool, gym, 24/7 security. Near Festival Mall.\nPrice: P8.5M. 20% downpayment in 24 months.\nContact Ana Cruz, 0917 123 4567, ana@cruzrealty.ph, Cruz Realty",
  );
  await card.getByTestId("intake-photos").setInputFiles([fx("photo-1.jpg"), fx("photo-2.jpg")]);
  await expect(card.getByRole("list", { name: "Pictures added" }).getByRole("listitem")).toHaveCount(2, { timeout: 15_000 });
  await card.getByRole("button", { name: "Understand it" }).click();

  await expect(card.getByTestId("intake-fixes")).toContainText("Alabang");
  await expect(card.getByLabel("Property name")).toHaveValue("Verde Residences");
  await expect(card.getByLabel("Price (₱)")).toHaveValue("8500000");
  await expect(card.getByLabel("Email")).toHaveValue("ana@cruzrealty.ph");
  await expect(card.getByLabel("Description")).toHaveValue(/Beautiful 2 bedroom condominium/);
  await card.getByRole("button", { name: "Undo Beautiful" }).click();
  await expect(card.getByLabel("Description")).toHaveValue(/Beautifull/);
  await card.getByLabel("Price (₱)").fill("8.2M");

  const xl = page.waitForEvent("download");
  await card.getByRole("button", { name: "Excel" }).click();
  const x = await xl;
  expect(x.suggestedFilename()).toBe("Verde-Residences.xlsx");
  const z = await JSZip.loadAsync(readFileSync(await x.path()));
  expect(await z.file("xl/worksheets/sheet1.xml")!.async("string")).toContain("8.2M");

  const pp = page.waitForEvent("download", { timeout: 90_000 });
  await card.getByRole("button", { name: "PowerPoint" }).click();
  const p = await pp;
  expect(p.suggestedFilename()).toBe("Verde-Residences.pptx");
  const deck = await JSZip.loadAsync(readFileSync(await p.path()));
  const slides = Object.keys(deck.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f));
  expect(slides.length).toBeGreaterThan(3);
  const all = (await Promise.all(slides.map((f) => deck.file(f)!.async("string")))).join("");
  expect(all).toContain("Verde Residences");
  expect(all).toContain("₱8.2M");

  // Open it in the editor.
  await card.getByRole("button", { name: "Open in Property Teaser" }).click();
  const tz = page.locator('[data-window="property-teaser"] iframe').last().contentFrame();
  await expect(tz.getByTestId("teaser-editor")).toBeVisible({ timeout: 15_000 });
  await expect(tz.getByLabel("Project title")).toHaveValue("Verde Residences");
});

test("guided intake asks one thing at a time", async ({ page }) => {
  await signIn(page);
  const dd = await openApp(page, "deal-desk", "Deal Desk AI");
  const box = dd.getByLabel("Message");
  await box.fill("/teaser");
  await box.press("Enter");
  await dd.getByTestId("command-menu").getByRole("option", { name: /New teaser trailer/ }).click();
  await dd.getByTestId("command-menu").getByRole("option", { name: /^Guided/ }).click();
  const card = dd.getByTestId("teaser-intake");
  for (const s of ["Photos", "Logo", "Features & amenities", "Contact"]) await card.getByRole("button", { name: s, exact: true }).click();
  await expect(card.getByRole("button", { name: "Property details" })).toHaveAttribute("aria-pressed", "true");
  await card.getByRole("button", { name: "Start" }).click();
  await expect(card).toContainText("Step 1 of 2: Property details");
  await card.getByLabel("Property details").fill("Casa Mira townhouse in Quezon City, 3 bedroms, 120 sqm lot");
  await card.getByRole("button", { name: "Next" }).click();
  await card.getByLabel("Price & terms").fill("4.2M, reservation fee 20k");
  await card.getByRole("button", { name: "Understand it" }).click();
  await expect(card.getByRole("textbox", { name: "Bedrooms", exact: true })).toHaveValue("3");
  await expect(card.getByLabel("Payment terms")).toHaveValue(/reservation fee/);
  await expect(card.getByTestId("intake-fixes")).toContainText("bedrooms");
});

test("save a design once, then make projects for several listings with it", async ({ page }) => {
  test.setTimeout(90_000);
  await signIn(page);
  const ls = await openApp(page, "listings", "Listings");
  await ls.getByRole("button", { name: "Import CSV" }).click();
  await ls.locator('input[type="file"]').setInputFiles(path.join(process.cwd(), "tests/fixtures/grid-listings-sample.csv"));
  await expect(ls.getByRole("status").filter({ hasText: "rows read" })).toBeVisible();
  await page.locator('[data-window="listings"]').getByRole("button", { name: "Close" }).click();

  const tz = await openApp(page, "property-teaser", "Property Teaser");
  await page.locator('[data-window="property-teaser"]').getByRole("button", { name: "Maximize" }).click();
  await tz.locator('[data-new="deck"]').click();
  await tz.locator('[data-template="urban-condo"]').click();
  await tz.getByLabel("Property name").fill("Design sample");
  await tz.getByLabel("Name", { exact: true }).fill("Ana Cruz");
  await tz.getByRole("button", { name: "Save design" }).click();
  const prompt = page.getByRole("alertdialog");
  await prompt.getByRole("textbox").fill("Ana navy");
  await prompt.getByRole("button", { name: /OK|Save/ }).click();
  await tz.getByRole("button", { name: "Templates", exact: true }).click();
  await expect(tz.getByTestId("my-designs").locator('[data-design="Ana navy"]')).toBeVisible();

  await tz.getByRole("button", { name: "Projects" }).click();
  const mine = tz.getByRole("region", { name: "My designs" }).or(tz.locator('section[aria-label="My designs"]'));
  await mine.locator('[data-design="Ana navy"]').getByRole("button", { name: "Use for listings…" }).click();
  const dlg = tz.getByRole("dialog", { name: "Use Ana navy for listings" });
  await dlg.getByLabel("Search listings").fill("Merville");
  await dlg.locator('[data-listing="TEST_0006"]').click();
  await dlg.getByLabel("Search listings").fill("");
  await expect(dlg.locator("[data-listing]")).not.toHaveCount(1);
  await dlg.locator('[data-listing][aria-pressed="false"]').first().click();
  await expect(dlg.getByRole("status")).toHaveText("2 selected");
  await dlg.getByRole("button", { name: "Make 2 projects" }).click();
  await expect(dlg).toBeHidden({ timeout: 30_000 });
  await expect(tz.locator('[data-project*="· Ana navy"]')).toHaveCount(2);
  await tz.locator('[data-project*="Merville"]').click();
  await tz.getByRole("button", { name: "Details", exact: true }).click();
  await expect(tz.getByLabel("Property name")).toHaveValue(/Merville/);
  await tz.getByRole("button", { name: "Your contact details" }).click();
  await expect(tz.getByLabel("Name", { exact: true })).toHaveValue("Ana Cruz");
});
