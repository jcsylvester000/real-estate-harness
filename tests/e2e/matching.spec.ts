import { expect, test } from "@playwright/test";
import path from "node:path";
import { openApp, signIn } from "./helpers";

test.describe.configure({ mode: "serial" });

test("Buyer Matching scores listings 1–10, saves the buyer, and shows the match on the listing (two-way)", async ({ page }) => {
  await signIn(page);
  // Make sure the sample listings are in (the listings spec may not have run first).
  const ls = await openApp(page, "listings", "Listings");
  await ls.getByRole("button", { name: "Import CSV" }).click();
  await ls.locator('input[type="file"]').setInputFiles(path.join(process.cwd(), "tests/fixtures/grid-listings-sample.csv"));
  await expect(ls.getByRole("status").filter({ hasText: "rows read" })).toBeVisible();
  await page.locator('[data-window="listings"]').getByRole("button", { name: "Close" }).click();

  const bm = await openApp(page, "buyer-match", "Buyer Matching");
  await bm.getByRole("button", { name: "Rent", exact: true }).click();
  await bm.getByLabel("Property kind").selectOption("condominium-unit");
  await bm.getByLabel("City").selectOption("Taguig");
  await bm.getByLabel("Budget up to").selectOption("40000");
  await bm.getByLabel("Show listings scoring at least").selectOption("7");
  await expect(bm.getByTestId("match-count")).toHaveText("2");
  const top = bm.locator("[data-match]").first();
  await expect(top.getByLabel(/Match score (9|10) of 10/)).toBeVisible();
  await top.getByRole("button", { name: "Why this score" }).click();
  await expect(top.getByRole("list", { name: "Why this score" })).toContainText("In Taguig");

  await bm.getByRole("button", { name: "Save as buyer" }).click();
  const dialog = page.getByRole("alertdialog");
  await dialog.getByRole("textbox").fill("BGC renter, condo, ₱40k");
  await dialog.getByRole("button", { name: "OK" }).click();
  await bm.getByRole("tab", { name: /Saved buyers \(1\)/ }).click();
  await expect(bm.getByText("BGC renter, condo, ₱40k")).toBeVisible();
  await bm.getByRole("button", { name: "See matches" }).click();
  await bm.locator("[data-match]").first().getByRole("button", { name: "Details" }).click();
  await expect(bm.getByTestId("analysis")).toContainText("Data completeness");
  await expect(bm.getByTestId("matching-buyers")).toContainText("BGC renter, condo, ₱40k");
});
