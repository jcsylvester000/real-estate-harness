import { expect, test } from "@playwright/test";
import { openApp, signIn } from "./helpers";

test("the PIN modal guards the desktop; App Center is not on the desktop", async ({ page }) => {
  await page.goto("/login");
  await expect(page).toHaveURL(/\/desktop/);
  await expect(page.getByRole("dialog", { name: "Grid Agentic" })).toBeVisible();
  await signIn(page);
  await expect(page.locator('[data-desktop-icon="app-center"]')).toHaveCount(0);
  for (const id of ["deal-desk", "property-finder", "calculators", "listings", "files", "notes", "settings"]) await expect(page.locator(`[data-desktop-icon="${id}"]`)).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Taskbar" })).toBeVisible();
  // No AI key in the test server: the taskbar says so, and Deal Desk explains the Query Engine.
  await expect(page.locator('[data-ai-status="off"]')).toContainText("Query Engine (no AI)");
});

test("a wrong PIN is refused, counts down, and Lock returns to the PIN modal", async ({ page }) => {
  await page.goto("/desktop");
  await page.getByLabel("PIN").fill("1111");
  await expect(page.getByText("Wrong PIN. 4 tries left.")).toBeVisible();
  await page.getByLabel("PIN").fill("4120");
  await page.getByRole("button", { name: "Start" }).click();
  await page.getByRole("button", { name: "Lock" }).click();
  await expect(page.getByRole("dialog", { name: "Grid Agentic" })).toBeVisible();
});

test("calculators run without AI and windows can be moved, minimized and closed", async ({ page }) => {
  await signIn(page);
  const calc = await openApp(page, "calculators", "Calculators");
  await calc.getByRole("tab", { name: "Taxes & fees" }).click();
  await calc.getByRole("button", { name: "Calculate" }).click();
  await expect(calc.getByText("Buyer cash needed for closing")).toBeVisible();
  await expect(calc.getByText("₱190,000").first()).toBeVisible();

  const win = page.locator('[data-window="calculators"]');
  const before = await win.boundingBox();
  const bar = win.locator("header");
  const b = (await bar.boundingBox())!;
  await page.mouse.move(b.x + 120, b.y + 15);
  await page.mouse.down();
  await page.mouse.move(b.x + 220, b.y + 75, { steps: 5 });
  await page.mouse.up();
  const after = await win.boundingBox();
  expect(Math.round(after!.x - before!.x)).toBe(100);

  await win.getByRole("button", { name: "Minimize" }).click();
  await expect(win).toBeHidden();
  await page.getByRole("navigation", { name: "Taskbar" }).getByRole("button", { name: "Calculators" }).click();
  await expect(win).toBeVisible();
  await win.getByRole("button", { name: "Close" }).click();
  await expect(win).toHaveCount(0);
});

test("Deal Desk answers with harness calculators in demo mode and saves to Files", async ({ page }) => {
  await signIn(page);
  const dd = await openApp(page, "deal-desk", "Deal Desk AI");
  await expect(dd.getByTestId("smart-mode")).toBeVisible();
  await dd.getByRole("button", { name: /Cost to buy/ }).click();
  await expect(dd.getByText("Calculations used: compute_acquisition_costs")).toBeVisible({ timeout: 15000 });
  await expect(dd.locator("table").first()).toContainText("Capital Gains Tax");
  await expect(dd.getByTestId("turn-cost")).toContainText("₱0");

  await dd.getByLabel("Message").fill("2BR condos in Pasig under ₱8M");
  await dd.getByRole("button", { name: "Send" }).click();
  await expect(dd.getByText("Calculations used: listings.search")).toBeVisible({ timeout: 15000 });
  await expect(dd.getByText("DEMO-001").first()).toBeVisible();

  // Save answer -> desktop prompt -> file appears in Files.
  await dd.getByRole("button", { name: "Save to Files" }).first().click();
  const dialog = page.getByRole("alertdialog");
  await dialog.getByRole("textbox").fill("/Deals/pasig-costs.md");
  await dialog.getByRole("button", { name: "OK" }).click();
  await expect(page.getByRole("status").getByText("Saved to Files.")).toBeVisible();
  const files = await openApp(page, "files", "Files");
  await files.getByRole("button", { name: "Deals", exact: true }).dblclick();
  await expect(files.getByText("pasig-costs.md")).toBeVisible();
});

test("Notes writes a file that Files can reopen in Notes", async ({ page }) => {
  await signIn(page);
  const notes = await openApp(page, "notes", "Notes");
  await notes.getByLabel("Note text").fill("# Viewing checklist\n\n- Bring IDs");
  await notes.getByRole("button", { name: "Save", exact: true }).click();
  const dialog = page.getByRole("alertdialog");
  await dialog.getByRole("textbox").fill("/Documents/viewing.md");
  await dialog.getByRole("button", { name: "OK" }).click();
  await expect(notes.getByRole("status")).toContainText("Saved");
  const files = await openApp(page, "files", "Files");
  await files.getByRole("button", { name: "Documents", exact: true }).dblclick();
  await files.getByRole("button", { name: "viewing.md", exact: true }).dblclick();
  await expect(page.locator('[data-window="notes"]')).toHaveCount(2);
});

test("a third-party app must be installed by an admin and asks the user for each permission", async ({ page }) => {
  await signIn(page);
  await page.locator('[data-desktop-icon="settings"]').dblclick();
  const st = page.locator('[data-window="settings"] iframe').contentFrame();
  await st.getByRole("button", { name: "Apps" }).click();
  await st.getByRole("button", { name: "Open App Center" }).click();
  const ac = page.locator('[data-window="app-center"] iframe').contentFrame();
  await ac.getByRole("button", { name: "Install an app" }).click();
  await ac.getByLabel("App id").fill("loan-widget");
  await ac.getByLabel("Name").fill("Loan Widget");
  await ac.getByLabel(/^URL/).fill("/sample-apps/loan-widget/index.html");
  await ac.getByRole("checkbox", { name: /^tools/ }).check();
  await ac.getByRole("checkbox", { name: /^ai/ }).check();
  await ac.getByRole("button", { name: "Install", exact: true }).click();
  await expect(page.locator('[data-desktop-icon="loan-widget"]')).toBeVisible();

  const w = await openApp(page, "loan-widget", "Loan Widget");
  await expect(w.locator("#out")).toContainText("Ready. Signed in as");
  // Deny first: the call fails and nothing is stored.
  await w.getByRole("button", { name: /Calculate/ }).click();
  const dlg = page.getByRole("alertdialog", { name: "Allow access?" });
  await expect(dlg).toContainText("Run real-estate calculators");
  await dlg.getByRole("button", { name: "Don't allow" }).click();
  await expect(w.locator("#out")).toContainText("Not done");
  // Allow: the result arrives and the grant is remembered.
  await w.getByRole("button", { name: /Calculate/ }).click();
  await page.getByRole("alertdialog", { name: "Allow access?" }).getByRole("button", { name: "Allow", exact: true }).click();
  await expect(w.locator("#out")).toContainText("Monthly payment: ₱47,138");
  await w.getByRole("button", { name: /Calculate/ }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(w.locator("#out")).toContainText("Monthly payment");
});

test("the third-party sandbox cannot reach the session or the desktop DOM", async ({ page }) => {
  await signIn(page);
  // The app from the previous test is installed in this shared server; reinstall if this runs alone.
  const icon = page.locator('[data-desktop-icon="loan-widget"]');
  test.skip(!(await icon.count()), "needs the loan-widget install from the previous test");
  await icon.dblclick();
  await expect.poll(() => page.frames().some((f) => f.url().includes("/sample-apps/loan-widget/"))).toBe(true);
  const frame = page.frames().find((f) => f.url().includes("/sample-apps/loan-widget/"))!;
  const probe = await frame.evaluate(async () => {
    let parentDom = "blocked";
    try {
      parentDom = String(window.parent.document.title);
    } catch {
      /* expected */
    }
    const r = await fetch("/api/drivers/call", { method: "POST", headers: { "content-type": "application/json", "x-grid-app": "settings" }, body: JSON.stringify({ method: "users.list" }) }).then(
      (x) => x.status,
      () => 0,
    );
    let cookie = "blocked";
    try {
      cookie = document.cookie === "" ? "none" : "visible";
    } catch {
      /* sandboxed without allow-same-origin: no cookie access at all */
    }
    return { origin: window.origin, parentDom, cookie, status: r };
  }).catch((e: Error) => ({ error: e.message }));
  expect(probe).toMatchObject({ origin: "null", parentDom: "blocked", cookie: "blocked" });
  expect([0, 401, 403]).toContain((probe as { status: number }).status);
});
