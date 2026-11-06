import { expect, test } from "@playwright/test";
import path from "node:path";
import { openApp, signIn } from "./helpers";

test.describe.configure({ mode: "serial" });

test("a broker imports a GRID CSV export into the listings database", async ({ page }) => {
  await signIn(page);
  const ls = await openApp(page, "listings", "Listings");
  await ls.getByRole("button", { name: "Import CSV" }).click();
  await ls.locator('input[type="file"]').setInputFiles(path.join(process.cwd(), "tests/fixtures/grid-listings-sample.csv"));
  const status = ls.getByRole("status").filter({ hasText: "rows read" });
  await expect(status).toContainText("9 rows read");
  await expect(status).toContainText("8 new");
  await expect(status).toContainText("1 skipped");
  await expect(ls.getByText("Row 10 TEST_0009")).toBeVisible();
  await ls.getByRole("button", { name: "Close" }).click();
  await expect(ls.getByText("Prime Commercial Lot in Taguig Near C6")).toBeVisible();
});

test("Property Finder answers a plain-language inquiry from the index with no AI key", async ({ page }) => {
  await signIn(page);
  const pf = await openApp(page, "property-finder", "Property Finder");
  await pf.getByLabel("What is the client looking for?").fill("condo for rent in BGC under 40k");
  await pf.getByRole("button", { name: "Search", exact: true }).click();
  await expect(pf.getByTestId("result-count")).toHaveText("2");
  for (const chip of ["For rent", "Condominium unit", "Taguig", "Up to ₱40,000/mo"]) await expect(pf.getByRole("button", { name: `Remove ${chip}` })).toBeVisible();
  await expect(pf.locator('[data-listing="TEST_0002"]')).toBeVisible();
  await expect(pf.locator('[data-listing="TEST_0003"]')).toContainText("Condominium unit*");

  // Remove the budget chip: the search widens.
  // (the e2e server also holds the 8 demo listings: DEMO-008 is a ₱75,000/mo BGC condo)
  await pf.getByRole("button", { name: "Remove Up to ₱40,000/mo" }).click();
  await expect(pf.getByTestId("result-count")).toHaveText("3");
  await pf.getByRole("button", { name: "Remove Taguig" }).click();
  await expect(pf.getByTestId("result-count")).toHaveText("4");

  // Shortlist and details -> calculator pre-filled with the listing price.
  await pf.getByRole("button", { name: "Clear all" }).click();
  await pf.getByLabel("What is the client looking for?").fill("house in paranake");
  await pf.getByRole("button", { name: "Search", exact: true }).click();
  await expect(pf.locator('[data-listing="TEST_0006"]')).toBeVisible();
  await pf.getByRole("button", { name: "Add TEST_0006 to shortlist" }).click();
  await expect(pf.getByRole("button", { name: /Shortlist/ })).toContainText("(1)");
  await pf.locator('[data-listing="TEST_0006"]').getByRole("button", { name: "Details" }).click();
  await expect(pf.getByRole("dialog")).toContainText("Parañaque, Metro Manila");
  await pf.getByRole("button", { name: /Taxes & closing costs/ }).click();
  const calc = page.locator('[data-window="calculators"] iframe').contentFrame();
  await expect(calc.getByLabel(/Selling Price/)).toHaveValue("45000000");
});

test("Deal Desk in smart search mode searches the same index", async ({ page }) => {
  await signIn(page);
  const dd = await openApp(page, "deal-desk", "Deal Desk AI");
  await dd.getByLabel("Message").fill("warehouse for lease");
  await dd.getByRole("button", { name: "Send" }).click();
  await expect(dd.getByText("Calculations used: search_listings")).toBeVisible({ timeout: 15000 });
  await expect(dd.getByText("TEST_0007").first()).toBeVisible();
  await dd.getByLabel("Message").fill("How many listings do we have?");
  await dd.getByRole("button", { name: "Send" }).click();
  await expect(dd.getByText(/available listings/).first()).toBeVisible({ timeout: 15000 });
});

test("Settings explains what works without AI", async ({ page }) => {
  await signIn(page);
  await page.locator('[data-ai-status="off"]').click();
  const st = page.locator('[data-window="settings"] iframe').contentFrame();
  await expect(st.getByText("No AI key yet: smart search mode")).toBeVisible();
  await expect(st.getByText("What works without AI")).toBeVisible();
});
