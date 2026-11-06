import { expect, type Page } from "@playwright/test";

export const ADMIN = { username: "e2e_admin", password: "admin pass phrase for tests" };

export async function signIn(page: Page, user = ADMIN) {
  await page.goto("/login");
  await page.getByLabel("Username").fill(user.username);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/desktop|\/change-password/);
}

/** Opens an app from its desktop icon and returns a locator for its iframe content. */
export async function openApp(page: Page, appId: string, title: string) {
  await page.locator(`[data-desktop-icon="${appId}"]`).dblclick();
  void title;
  return page.locator(`[data-window="${appId}"] iframe`).last().contentFrame();
}
