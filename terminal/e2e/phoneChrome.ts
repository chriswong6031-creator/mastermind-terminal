import { expect, type Page } from "@playwright/test";

// Shared helpers for the phone chart chrome (R2). Not a spec file — Playwright's default
// testMatch only collects *.spec.ts, so this module is imported, never run.

/** Mirrors app/globals.css and lib/useMediaQuery.ts (PHONE_QUERY). */
export const PHONE_MAX = 640;

export const isPhoneViewport = (page: Page) => (page.viewportSize()?.width ?? 1440) <= PHONE_MAX;

/**
 * Opens the Indicator Library through whichever entry point the viewport ships: the chart
 * toolbar's "+ Indicators" button on tablet/desktop, and the roller strip's ••• → Indicators
 * tile on the phone, where R2.2 replaced the toolbar row with the Analysis hub.
 */
export async function openIndicatorLibrary(page: Page) {
  if (isPhoneViewport(page)) {
    await page.getByTestId("roller-more").click();
    await page.getByTestId("hub-tile-indicators").click();
    return;
  }
  const trigger = page.locator(".indicator-library-trigger");
  await expect(trigger).toBeVisible();
  await trigger.scrollIntoViewIfNeeded();
  await trigger.click();
}
