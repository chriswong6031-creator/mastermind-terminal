import { test, expect } from "@playwright/test";

// Native shell mode (?shell=app): the WebView surface the installable apps load.
// Chrome (topbar, mobile bar, nav rail, watchlist rail, movers ticker) must be gone,
// the chart must fill the single grid cell, and the window.__mmShell bridge must
// drive symbol/timeframe through the existing product seams.
// Runs in every viewport project (desktop / tablet / mobile) like responsive.spec.ts.

const SHELL_URL = "/terminal?symbol=NVDA&shell=app";

test.describe("native shell mode", () => {
  test("chart-only chrome, working bridge, no overflow", async ({ page }) => {
    await page.goto(SHELL_URL);

    // Marker the deploy verification greps for (SSR'd, since shellMode is a server prop).
    await expect(page.locator('[data-shell="app"]')).toHaveCount(1);

    // Global chrome is absent from the DOM entirely (not merely display:none).
    await expect(page.locator("header.topbar")).toHaveCount(0);
    await expect(page.locator(".mobilebar")).toHaveCount(0);
    await expect(page.locator(".m-symbar")).toHaveCount(0);
    await expect(page.locator("nav.appnav")).toHaveCount(0);
    await expect(page.locator("aside.rail")).toHaveCount(0);
    await expect(page.locator(".ticker")).toHaveCount(0);

    // The chart itself still mounts and renders.
    await expect(page.locator(".workspace canvas").first()).toBeVisible({ timeout: 45_000 });

    // No horizontal document overflow at any project viewport.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);

    // Bridge installed with the contract surface.
    await page.waitForFunction(() => (window as any).__mmShell?.version === 1);
    const tfs = await page.evaluate(() => {
      // ready() already posted; re-derive the advertised list from the API for the assertion.
      const api = (window as any).__mmShell;
      return { hasGetState: typeof api.getState === "function", sym: api.getState().sym };
    });
    expect(tfs.hasGetState).toBe(true);
    expect(tfs.sym).toBe("NVDA");

    // Native → web commands ride the existing seams and update live state.
    await page.evaluate(() => (window as any).__mmShell.setSymbol("AAPL"));
    await page.waitForFunction(() => (window as any).__mmShell.getState().sym === "AAPL");
    await page.evaluate(() => (window as any).__mmShell.setTimeframe("D"));
    await page.waitForFunction(() => (window as any).__mmShell.getState().tf === "D");
  });

  test("normal mode is untouched", async ({ page }) => {
    await page.goto("/terminal?symbol=NVDA");
    // Chrome present in the DOM (viewport CSS decides visibility)…
    await expect(page.locator(".mobilebar")).toHaveCount(1);
    await expect(page.locator("nav.appnav")).toHaveCount(1);
    await expect(page.locator('[data-shell="app"]')).toHaveCount(0);
    // …and no bridge is installed outside shell mode.
    const hasBridge = await page.evaluate(() => "__mmShell" in window && (window as any).__mmShell != null);
    expect(hasBridge).toBe(false);
  });
});
