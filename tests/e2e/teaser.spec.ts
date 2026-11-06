import { expect, test, type Download, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { openApp, signIn } from "./helpers";

test.describe.configure({ mode: "serial" });
const fx = (f: string) => path.join(process.cwd(), "tests/fixtures/teaser", f);

async function exportAs(page: Page, tz: ReturnType<Page["frameLocator"]>, label: RegExp): Promise<Download> {
  await tz.getByRole("button", { name: "Export" }).click();
  const dl = page.waitForEvent("download", { timeout: 150_000 });
  await tz.getByRole("menuitem", { name: label }).click();
  const confirm = page.getByRole("alertdialog").getByRole("button", { name: "Export" });
  await confirm.click({ timeout: 3000 }).catch(() => {});
  return dl;
}

test("Property Teaser: template, details written for you, photos, logo, edit, export PowerPoint, PDF and Word", async ({ page }) => {
  test.setTimeout(150_000);
  await signIn(page);
  const tz = await openApp(page, "property-teaser", "Property Teaser");
  await page.locator('[data-window="property-teaser"]').getByRole("button", { name: "Maximize" }).click();
  await tz.locator('[data-new="deck"]').click();
  await expect(tz.locator("[data-template]")).toHaveCount(20);
  await tz.locator('[data-template="grid-signature"]').click();

  // Details: the no-AI copywriter.
  await tz.getByLabel("Property name").fill("Casa Verde Alabang");
  await tz.getByLabel("Paste your notes or listing text").fill("BRAND NEW 4BR HOUSE AND LOT IN ALABANG! Corner lot, 450 sqm lot area, 320 sqm floor area, 2-car garage, 3 T&B. Gated village with 24/7 security and swimming pool. Call 0917 123 4567");
  await tz.getByRole("button", { name: "Write it for me" }).click();
  await expect(tz.getByTestId("copy-result")).toContainText("Corner 4-bedroom house in Alabang");
  await expect(tz.getByTestId("copy-result")).toContainText("Removed from the text: 1 phone number");
  await tz.getByRole("button", { name: "Apply all" }).click();
  await expect(tz.getByLabel("Lot sqm")).toHaveValue("450");
  await expect(tz.getByRole("button", { name: "Swimming pool" })).toHaveAttribute("aria-pressed", "true");
  // Contact details may already be filled from your last project (collapsed then).
  const contact = tz.getByRole("button", { name: "Your contact details" });
  if ((await contact.getAttribute("aria-expanded")) === "false") await contact.click();
  await tz.getByLabel("Name", { exact: true }).fill("Maria Santos");
  await expect(tz.getByLabel("Project title")).toHaveValue("Casa Verde Alabang");

  // Photos and logo.
  await tz.getByRole("button", { name: "Photos", exact: true }).click();
  await tz.getByLabel("Upload photos").setInputFiles([fx("photo-1.jpg"), fx("photo-2.jpg")]);
  await expect(tz.getByRole("list", { name: "Property photos in order" }).getByRole("listitem")).toHaveCount(2, { timeout: 15_000 });
  await tz.getByRole("button", { name: "Brand", exact: true }).click();
  await tz.getByLabel("Upload logo").setInputFiles(fx("logo.png"));
  await expect(tz.getByAltText("Your logo")).toBeVisible();

  // Canvas editing: add a heading, style it, undo.
  await tz.getByRole("button", { name: "Elements", exact: true }).click();
  await tz.getByRole("button", { name: "Add a heading" }).click();
  const toolbar = tz.getByTestId("toolbar");
  await expect(toolbar.getByLabel("Font size")).toHaveValue("96");
  await toolbar.getByLabel("Font size").fill("120");
  await toolbar.getByRole("button", { name: "Italic" }).click();
  await expect(toolbar.getByRole("button", { name: "Italic" })).toHaveAttribute("aria-pressed", "true");
  await tz.getByRole("button", { name: "Add icon bed" }).click();
  await expect(toolbar.getByLabel("Icon colour")).toBeVisible();
  await tz.getByRole("button", { name: "Undo (Ctrl+Z)" }).click();
  await expect(toolbar).toContainText("Select something");
  await expect(tz.getByTestId("save-state")).toHaveText("Saved", { timeout: 10_000 });

  // Switching templates keeps the details.
  await tz.getByRole("button", { name: "Templates", exact: true }).click();
  await tz.locator('[data-template="urban-condo"]').click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Switch" }).click();
  await tz.getByRole("button", { name: "Details", exact: true }).click();
  await expect(tz.getByLabel("Property name")).toHaveValue("Casa Verde Alabang");

  // Exports.
  const pptx = await exportAs(page, tz, /PowerPoint/);
  expect(pptx.suggestedFilename()).toBe("Casa-Verde-Alabang.pptx");
  expect(readFileSync(await pptx.path()).subarray(0, 2).toString()).toBe("PK");
  const pdf = await exportAs(page, tz, /^PDF/);
  expect(readFileSync(await pdf.path()).subarray(0, 5).toString()).toBe("%PDF-");
  const docx = await exportAs(page, tz, /Word/);
  expect(docx.suggestedFilename()).toMatch(/\.docx$/);

  // Back to projects: it is listed.
  await tz.getByRole("button", { name: "Projects" }).click();
  await expect(tz.locator('[data-project="Casa Verde Alabang"]')).toBeVisible();
});

test("teaser trailer: plays in preview and exports an MP4 video", async ({ page }) => {
  test.setTimeout(200_000);
  await signIn(page);
  const tz = await openApp(page, "property-teaser", "Property Teaser");
  await tz.locator('[data-new="trailer"]').click();
  await expect(tz.locator("[data-template]")).toHaveCount(10);
  await tz.locator('[data-template="quick-tour-reel"]').click();
  await tz.getByLabel("Property name").fill("Sky Loft BGC");
  await tz.getByLabel("Price (₱)").fill("45000");
  // Shorten it: keep three scenes.
  const strip = tz.getByRole("listbox", { name: "Slides" });
  while ((await strip.getByRole("option").count()) > 3) {
    await strip.getByRole("option").last().click();
    await tz.getByRole("button", { name: "Delete slide" }).click();
  }
  await tz.getByRole("button", { name: "Preview" }).click();
  await expect(tz.getByTestId("player")).toBeVisible();
  await tz.getByRole("button", { name: "Close preview" }).click();
  const video = await exportAs(page, tz, /Video/);
  expect(video.suggestedFilename()).toMatch(/^Sky-Loft-BGC\.(mp4|webm)$/);
  expect(readFileSync(await video.path()).length).toBeGreaterThan(50_000);
});

test("a listing opens Property Teaser with its details filled in", async ({ page }) => {
  await signIn(page);
  const ls = await openApp(page, "listings", "Listings");
  await ls.getByRole("button", { name: "Import CSV" }).click();
  await ls.locator('input[type="file"]').setInputFiles(path.join(process.cwd(), "tests/fixtures/grid-listings-sample.csv"));
  await expect(ls.getByRole("status").filter({ hasText: "rows read" })).toBeVisible();
  await page.locator('[data-window="listings"]').getByRole("button", { name: "Close" }).click();
  const pf = await openApp(page, "property-finder", "Property Finder");
  await pf.getByLabel("What is the client looking for?").fill("Merville");
  await pf.getByRole("button", { name: "Search", exact: true }).click();
  await pf.locator('[data-listing="TEST_0006"]').getByRole("button", { name: "Details" }).click();
  await pf.locator("[data-make-teaser]").click();
  const tz = page.locator('[data-window="property-teaser"] iframe').last().contentFrame();
  await expect(tz.getByRole("heading", { name: "Choose a presentation template" })).toBeVisible();
  await tz.locator('[data-template="family-home"]').click();
  await tz.getByRole("button", { name: "Details", exact: true }).click();
  await expect(tz.getByLabel("Property name")).toHaveValue(/Merville/);
  await expect(tz.getByLabel("Price (₱)")).toHaveValue("45000000");
});
