import { expect, test } from "@playwright/test";
import { openApp, signIn } from "./helpers";

test("Home loan calculator compares Philippine lenders and lender rates can be edited", async ({ page }) => {
  await signIn(page);
  const c = await openApp(page, "calculators", "Calculators");
  await expect(c.getByRole("tab", { name: "Home loan (lenders)" })).toHaveAttribute("aria-selected", "true");
  await expect(c.locator("[data-lender=pagibig]")).toBeVisible();
  await expect(c.locator("[data-lender=bpi]")).toContainText("%");

  // Pick one lender: Pag-IBIG promo tier for a ₱4.5M loan.
  await c.getByLabel("Property price (₱)").fill("5000000");
  await c.getByLabel("Down payment").fill("10");
  await c.getByLabel("Lender").selectOption("pagibig");
  await expect(c.getByTestId("single-quote")).toContainText("Pag-IBIG Fund");
  await expect(c.getByTestId("single-quote")).toContainText("/mo");

  // A lender without published rates asks for the quoted rate.
  await c.getByLabel("Lender").selectOption("metrobank");
  await c.getByLabel(/Rate Metrobank quoted/).fill("8");
  await expect(c.getByTestId("single-quote")).toContainText("/mo");

  // Edit BPI's rates in the Lender rates tab.
  await c.getByRole("tab", { name: "Lender rates" }).click();
  const card = c.locator("[data-lender-card=bpi]");
  await card.getByRole("button", { name: "Update rates" }).click();
  const form = c.getByRole("form", { name: "Update BPI rates" });
  await form.getByLabel("Rate %").first().fill("6.5");
  await form.getByRole("button", { name: "Save rates" }).click();
  await expect(card).toContainText("6.5%");
  await expect(card).toContainText("edited");
  await card.getByRole("button", { name: "Reset" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "OK" }).click();
  await expect(card).not.toContainText("edited");
});
