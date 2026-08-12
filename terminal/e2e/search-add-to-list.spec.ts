import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { isolateWatchlistStore } from "./watchlistStore";

// Operator report (2026-08-05): a one-hit search for 明阳电气 showed a sliver of a panel behind the
// result row and the + button appeared to do nothing. With two or more watchlists, + opens the
// add-to-list picker — which was an absolute child of the row, so it sat inside BOTH `.sres`
// (overflow:auto, barely taller than the single row) and `.smodal` (overflow:hidden). 8px of a
// 123px popover showed; the list menu the add depends on was invisible, so nothing could be added.
const LISTS = {
  lists: {
    Default: [{ symbol: "NVDA", section: "EQUITIES" }],
    China: [{ symbol: "600519.SS", section: "EQUITIES" }],
  },
  active: "Default",
  meta: {},
};

async function openSearchWithTwoLists(page: Page, query: string, testInfo: TestInfo, baseURL?: string) {
  // Since W1b the seeded "China" list migrates to the server on mount, so this spec needs its own
  // fixture store (see e2e/watchlistStore.ts) to stay deterministic under the parallel matrix.
  await isolateWatchlistStore(page, testInfo, baseURL);
  // Seeded before any app code runs: TerminalShell persists its own list state on mount, so a seed
  // written after the first load races that write and loses.
  await page.addInitScript((seed) => localStorage.setItem("mm.wls", JSON.stringify(seed)), LISTS);
  await page.goto("/terminal?symbol=NVDA");
  await expect(page.locator(".mm-ptag")).toBeVisible({ timeout: 60_000 });
  await page.locator(".pair").first().click();
  await page.locator(".sh input").click();
  await page.keyboard.type(query);
  await expect(page.locator(".sres .r").first()).toBeVisible({ timeout: 20_000 });
}

test("the add-to-list picker is fully visible on a one-result search", async ({ page, baseURL }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "The picker is a pointer affordance; the phone sheet has its own layout.");

  await openSearchWithTwoLists(page, "AMD", testInfo, baseURL);
  expect(await page.locator(".sres .r").count()).toBe(1);   // the one-row shape that did the clipping

  await page.locator(".sres .r .add").first().click();
  const pick = page.locator(".s-pick");
  await expect(pick).toBeVisible();

  // Visible in the VIEWPORT and actually hit-testable — a clipped popover still reports a box.
  const state = await page.evaluate(() => {
    const el = document.querySelector<HTMLElement>(".s-pick")!;
    const r = el.getBoundingClientRect();
    const centre = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2);
    return {
      onScreen: r.top >= 0 && r.bottom <= window.innerHeight && r.left >= 0 && r.right <= window.innerWidth,
      hitsPicker: !!centre?.closest(".s-pick"),
      rows: el.querySelectorAll(".s-pick-row").length,
      height: Math.round(r.height),
    };
  });
  expect(state.onScreen).toBe(true);
  expect(state.hitsPicker).toBe(true);        // the assertion the old markup failed
  expect(state.rows).toBeGreaterThanOrEqual(3);   // two lists + "New watchlist…"

  // …and picking a list actually adds the symbol to it.
  await page.locator(".s-pick-row", { hasText: "China" }).click();
  await expect.poll(async () => page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem("mm.wls") || "{}");
    return (saved.lists?.China ?? []).map((r: { symbol: string }) => r.symbol);
  }), { timeout: 10_000 }).toContain("AMD");
});

test("scrolling the result list closes the picker instead of stranding it", async ({ page, baseURL }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Pointer affordance; desktop is where the popover lives.");

  await openSearchWithTwoLists(page, "A", testInfo, baseURL);                  // many hits → a scrollable result list
  await page.locator(".sres .r .add").first().click();
  await expect(page.locator(".s-pick")).toBeVisible();
  // The popover is anchored to the row's viewport rect, so a scroll would leave it floating.
  await page.locator(".sres").evaluate((el) => { el.scrollTop += 120; el.dispatchEvent(new Event("scroll", { bubbles: false })); });
  await expect(page.locator(".s-pick")).toHaveCount(0);
});
