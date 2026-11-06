import { expect, type Page } from "@playwright/test";

export const PIN = "4120";

/** Unlocks the desktop with the team PIN (the modal auto-submits on the fourth digit). */
export async function signIn(page: Page, pin = PIN) {
  await page.goto("/desktop");
  await page.getByLabel("PIN").fill(pin);
  await expect(page.getByRole("navigation", { name: "Taskbar" })).toBeVisible();
}

/** Opens an app from its desktop icon and returns a locator for its iframe content. */
export async function openApp(page: Page, appId: string, title: string) {
  await page.locator(`[data-desktop-icon="${appId}"]`).dblclick();
  void title;
  return page.locator(`[data-window="${appId}"] iframe`).last().contentFrame();
}
