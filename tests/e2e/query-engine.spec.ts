import { expect, test } from "@playwright/test";
import path from "node:path";
import { openApp, signIn } from "./helpers";

const fixture = (f: string) => path.join(process.cwd(), "tests/fixtures", f);

test("Query Engine reads a PDF and a photo (OCR), summarizes, and answers from them", async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page);
  const dd = await openApp(page, "deal-desk", "Deal Desk AI");
  await expect(dd.getByText("Deal Desk · Query Engine (no AI)")).toBeVisible();

  // PDF with a text layer.
  await dd.getByLabel("Upload a document").setInputFiles(fixture("sample-lease.pdf"));
  await expect(dd.getByText(/Added \*?\*?sample-lease\.pdf|Added sample-lease\.pdf/)).toBeVisible({ timeout: 30_000 });
  await dd.getByRole("button", { name: "summarize sample-lease" }).click();
  await expect(dd.getByText(/75,000/).first()).toBeVisible({ timeout: 15_000 });
  await dd.getByLabel("Message").fill("what does the lease say about pets?");
  await dd.getByRole("button", { name: "Send" }).click();
  await expect(dd.getByText(/“Pets are not allowed in the unit/)).toBeVisible({ timeout: 15_000 });

  // Photo of a page: self-hosted OCR (no CDN), then deadlines.
  await dd.getByLabel("Upload a document").setInputFiles(fixture("scanned-reservation.png"));
  await expect(dd.getByText(/Added .*scanned-reservation\.png/)).toBeVisible({ timeout: 90_000 });
  await expect(dd.getByText(/Read with OCR/)).toBeVisible();
  await dd.getByLabel("Message").fill("what are the deadlines in the reservation?");
  await dd.getByRole("button", { name: "Send" }).click();
  await expect(dd.getByText(/February 15, 2027/).first()).toBeVisible({ timeout: 15_000 });

  await dd.getByRole("button", { name: /Documents \(2\)/ }).click();
  await expect(dd.getByRole("complementary", { name: "Documents" })).toContainText("sample-lease.pdf");
});

test("Query Engine follows up: lender comparison, then a shorter term", async ({ page }) => {
  await signIn(page);
  const dd = await openApp(page, "deal-desk", "Deal Desk AI");
  await dd.getByLabel("Message").fill("Compare lenders for a ₱7.6M condo, 20% down");
  await dd.getByRole("button", { name: "Send" }).click();
  await expect(dd.getByText("Pag-IBIG Fund").first()).toBeVisible({ timeout: 15_000 });
  await dd.getByRole("button", { name: "how about 15 years" }).click();
  await expect(dd.getByText(/15 years/).last()).toBeVisible({ timeout: 15_000 });
  await expect(dd.getByText("Query Engine · no AI").last()).toBeVisible();
});
