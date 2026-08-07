import { expect, test, type Page } from "@playwright/test";
import {
  DEFAULT_CHART_RIGHT_OFFSET,
  DEFAULT_CHART_VIEW_BARS,
} from "@/lib/chart-engine/viewReset";

type ChartViewState = {
  rowCount: number;
  timeframe: string;
  visibleRange: { from: number; to: number } | null;
  priceAutoScale: boolean | null;
  lastBarX: number | null;
  priceTagLeft: number | null;
};

async function chartViewState(page: Page): Promise<ChartViewState | null> {
  return page.evaluate(() => (window as Window & {
    __mmChartAxisOpts?: () => ChartViewState | null;
  }).__mmChartAxisOpts?.() ?? null);
}

async function expectNormalizedView(page: Page) {
  await expect.poll(async () => {
    const state = await chartViewState(page);
    if (!state?.visibleRange || state.rowCount <= DEFAULT_CHART_VIEW_BARS) return null;
    return {
      autoScale: state.priceAutoScale,
      from: Math.round(state.visibleRange.from),
      to: Math.round(state.visibleRange.to),
    };
  }, { timeout: 15_000 }).toEqual({
    autoScale: true,
    from: (await chartViewState(page))!.rowCount - DEFAULT_CHART_VIEW_BARS,
    to: (await chartViewState(page))!.rowCount - 1 + DEFAULT_CHART_RIGHT_OFFSET,
  });
}

test("New chart tickers reserve space between the latest candle and symbol tag", async ({ page }) => {
  await page.goto("/terminal?symbol=AAPL");
  await expect(page.locator(".chart-wrap canvas").first()).toBeVisible({ timeout: 45_000 });

  await expect.poll(async () => {
    const state = await chartViewState(page);
    if (state?.lastBarX == null || state.priceTagLeft == null) return null;
    return Math.round(state.priceTagLeft - state.lastBarX);
  }, { timeout: 45_000 }).toBeGreaterThanOrEqual(12);
});

test("Reset chart view restores the recent weekly window", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "The context-menu reset gesture is desktop-only.");

  await page.goto("/terminal?symbol=NVDA");
  await expect(page.locator(".chart-wrap canvas").first()).toBeVisible({ timeout: 45_000 });
  await expect.poll(async () => (await chartViewState(page))?.rowCount ?? 0, { timeout: 45_000 })
    .toBeGreaterThan(DEFAULT_CHART_VIEW_BARS);

  // Match the reported long-history weekly failure, where fitContent used to
  // crush every available candle into the width of the chart.
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent("mm:set-tf", { detail: { tf: "W" } }));
  });
  await expect.poll(async () => {
    const state = await chartViewState(page);
    return state?.timeframe === "W" ? state.rowCount : 0;
  }, { timeout: 45_000 }).toBeGreaterThan(DEFAULT_CHART_VIEW_BARS);

  const chart = page.locator(".chart-wrap").first();
  const box = await chart.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box!.x + box!.width * 0.6, box!.y + box!.height * 0.45, { button: "right" });
  const reset = page.locator('.ctx-menu [data-a="reset"]');
  await expect(reset).toBeVisible();
  await reset.click();
  await expectNormalizedView(page);

  // The advertised keyboard equivalent must share the same normalization path.
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expectNormalizedView(page);
});
