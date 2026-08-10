import { expect, test } from "@playwright/test";

const CATEGORY_IDS = [
  "command",
  "flow",
  "exposure",
  "structure",
  "volatility",
  "statistics",
  "prophet",
] as const;

test("seven-category Options IA stays addressable, honest, and contained", async ({ page }, testInfo) => {
  const zh = testInfo.project.name === "tablet";
  if (zh) {
    await page.addInitScript(() => {
      localStorage.setItem("mm.lang", "zh");
      document.documentElement.setAttribute("data-lang", "zh");
      document.documentElement.setAttribute("lang", "zh-CN");
    });
  }

  await page.goto("/options?tab=tape");
  const workspace = page.locator('[data-options-ia="seven-category-stage-a"]');
  await expect(workspace).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("tablist", { name: zh ? "期权类别" : "Options categories" })).toBeVisible();
  await expect(page.getByRole("tablist", { name: zh ? "期权子视图" : "Options views" })).toBeVisible();

  for (const category of CATEGORY_IDS) {
    await expect(page.locator(`#wtab-cat-${category}`)).toHaveCount(1);
  }
  await expect(page.locator("#wtab-cat-flow")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#wtab-tape")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#wtab-0dte")).toBeVisible();
  await expect(page.locator("#wtab-largest")).toBeVisible();
  await expect(page.locator("#wtab-vol")).toBeVisible();
  await expect(page.locator("#wtab-surface")).toBeVisible();

  // A category selects its deterministic home and exposes only its owned views.
  await page.locator("#wtab-cat-exposure").click();
  await expect(page).toHaveURL(/\/options\?tab=gex$/);
  await expect(page.locator("#wtab-gex")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#wtab-positioning")).toBeVisible();
  await expect(page.locator("#wtab-levels")).toBeVisible();
  await expect(page.locator("#wtab-tape")).toHaveCount(0);

  await page.screenshot({
    path: testInfo.outputPath(`${testInfo.project.name}-options-seven-category-exposure.png`),
    fullPage: false,
  });

  // Statistics is a real IA destination, but it cannot imply an unbuilt feed.
  await page.locator("#wtab-cat-statistics").click();
  await expect(page).toHaveURL(/\/options\?tab=statistics$/);
  await expect(page.locator('[data-options-ia-gate="statistics-r3"]')).toContainText(
    zh ? "不使用合成数值" : "no synthetic values",
  );
  const statisticsGate = page.locator('[data-options-ia-state="statistics-pending"]');
  await expect(statisticsGate).toBeVisible();
  await expect(statisticsGate).toContainText(zh ? "当前不显示数值" : "No values shown");

  await page.screenshot({
    path: testInfo.outputPath(`${testInfo.project.name}-options-statistics-gate.png`),
    fullPage: false,
  });

  // #380/#382 remain the same pane-level contracts after navigation through the IA.
  await page.locator("#wtab-cat-flow").click();
  await expect(page).toHaveURL(/\/options\?tab=tape$/);
  await expect(page.locator('[data-options-export="tape-csv-v1"]')).toHaveAttribute(
    "data-export-contract",
    "terminal.options_tape_csv/v1",
  );

  // The two remaining derived Flow blind spots share one immutable, display-only
  // event contract. A feed event can coalesce multiple prints, so the public UI
  // must never relabel the largest-event board as an individual-trade ranking.
  await page.locator("#wtab-0dte").click();
  await expect(page).toHaveURL(/\/options\?tab=0dte$/);
  const zeroDteBoard = page.locator('[data-options-flow-board="0dte"]');
  await expect(zeroDteBoard).toBeVisible();
  await expect(zeroDteBoard).toHaveAttribute("data-options-flow-contract", "live_flow.feed/v1");
  await expect(zeroDteBoard).toHaveAttribute("data-options-flow-authority", "display_only");
  await expect(zeroDteBoard).toContainText(zh ? "0DTE 事件看板" : "0DTE Event Dashboard");
  await expect(zeroDteBoard.locator(".options-flow-board-receipt").nth(1).locator("strong")).toHaveText("2");
  const zeroDteRows = testInfo.project.name === "mobile"
    ? zeroDteBoard.locator(".options-flow-board-card")
    : zeroDteBoard.locator(".options-flow-board-table tbody tr");
  await expect(zeroDteRows).toHaveCount(2);
  await page.screenshot({
    path: testInfo.outputPath(`${testInfo.project.name}-options-0dte-board.png`),
    fullPage: false,
  });

  const tickerSearch = zeroDteBoard.getByPlaceholder(zh ? "搜索代码…" : "Search ticker…");
  await tickerSearch.fill("SPY");
  await expect(zeroDteBoard.locator(".options-flow-board-receipt").nth(1).locator("strong")).toHaveText("1");
  await tickerSearch.fill("");

  await page.locator("#wtab-largest").click();
  await expect(page).toHaveURL(/\/options\?tab=largest$/);
  const largestBoard = page.locator('[data-options-flow-board="largest-events"]');
  await expect(largestBoard).toBeVisible();
  await expect(largestBoard).toContainText(zh ? "并非单笔成交排名" : "not an individual-trade ranking");
  await expect(largestBoard.locator(".options-flow-board-receipt").nth(1).locator("strong")).toHaveText("12");
  const largestRows = testInfo.project.name === "mobile"
    ? largestBoard.locator(".options-flow-board-card")
    : largestBoard.locator(".options-flow-board-table tbody tr");
  await expect(largestRows).toHaveCount(12);
  await expect(largestRows.first()).toContainText("GLD");
  await expect(largestRows.first()).toContainText("$2.60M");
  const boardContainment = await page.evaluate(() => ({
    viewport: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    resultsOverflow: getComputedStyle(
      document.querySelector<HTMLElement>(".options-flow-board-results")!,
    ).overflowX,
  }));
  expect(boardContainment.documentWidth).toBeLessThanOrEqual(boardContainment.viewport + 1);
  expect(boardContainment.resultsOverflow).toBe("auto");
  await page.screenshot({
    path: testInfo.outputPath(`${testInfo.project.name}-options-largest-events-board.png`),
    fullPage: false,
  });

  await page.locator("#wtab-vol").click();
  await expect(page).toHaveURL(/\/options\?tab=vol$/);
  await expect(page.locator('[data-options-export="screener-csv-v1"]')).toHaveAttribute(
    "data-export-contract",
    "terminal.options_screener_csv/v1",
  );

  const containment = await page.evaluate(() => {
    const categoryRail = document.querySelector<HTMLElement>(".options-category-tabs");
    const viewRail = document.querySelector<HTMLElement>(".options-view-tabs");
    return {
      viewport: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      categoryOverflow: categoryRail ? getComputedStyle(categoryRail).overflowX : "missing",
      viewOverflow: viewRail ? getComputedStyle(viewRail).overflowX : "missing",
    };
  });
  expect(containment.documentWidth).toBeLessThanOrEqual(containment.viewport + 1);
  expect(containment.categoryOverflow).toBe("auto");
  expect(containment.viewOverflow).toBe("auto");
});
