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
