import { expect, test } from "@playwright/test";

const LOCAL_LISTS = {
  lists: {
    Default: [{ symbol: "AAPL", section: "Core" }],
    Swing: [{ symbol: "MSFT", section: "Tactical" }],
    Empty: [],
  },
  active: "Swing",
  meta: {},
};

const MANIFEST = {
  symbols: {
    NVDA: { name: "NVIDIA", zh: "英伟达", col: "#76b900", last: 182.4, chg: 1.2, verdict: "BUY", wr: 0.66, pf: 1.8, cagr: 0.24, regimeBull: true },
    AAPL: { name: "Apple", zh: "苹果", col: "#8e8e93", last: 228.1, chg: -0.4, verdict: "HOLD", wr: 0.58, pf: 1.4, cagr: 0.16, regimeBull: true },
    MSFT: { name: "Microsoft", zh: "微软", col: "#00a4ef", last: 511.8, chg: 0.7, verdict: "REBUY", wr: 0.63, pf: 1.7, cagr: 0.2, regimeBull: true },
    QQQ: { name: "Invesco QQQ", zh: "纳指100ETF", col: "#2962ff", last: 576.3, chg: -0.2, verdict: "WATCH", wr: 0.55, pf: 1.3, cagr: 0.13, regimeBull: false },
  },
};

test("Portfolio switches every existing watchlist without losing empty/deleted-list truth", async ({ page }, testInfo) => {
  const zh = testInfo.project.name === "tablet";
  await page.addInitScript(({ stored, useZh }) => {
    localStorage.setItem("mm.wls", JSON.stringify(stored));
    localStorage.setItem("mm.lang", useZh ? "zh" : "en");
    document.documentElement.setAttribute("data-lang", useZh ? "zh" : "en");
    document.documentElement.setAttribute("lang", useZh ? "zh-CN" : "en");
  }, { stored: LOCAL_LISTS, useZh: zh });
  await page.route("**/data/manifest.json", (route) => route.fulfill({ json: MANIFEST }));
  await page.route("**/api/portfolio-brief", (route) => route.fulfill({
    status: 403,
    contentType: "application/json",
    body: JSON.stringify({ error: "fixture entitlement" }),
  }));

  await page.goto("/portfolio");
  const portfolio = page.locator("[data-portfolio-watchlists='r5-v1']");
  await expect(portfolio).toBeVisible();
  await expect(portfolio).toHaveAttribute("data-selected-watchlist", "Swing");
  await expect(page.locator(".portfolio-wl-label")).toHaveText(zh ? "自选列表" : "Watchlists");

  const tabs = page.getByRole("tablist", { name: zh ? "投资组合自选列表" : "Portfolio watchlists" });
  await expect(tabs.getByRole("tab")).toHaveCount(4);
  await expect(tabs.getByRole("tab", { name: /Swing/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".ptable tbody .tk")).toHaveText(["MSFT"]);
  await page.screenshot({
    path: testInfo.outputPath(`${testInfo.project.name}-portfolio-watchlists-initial-${zh ? "zh" : "en"}.png`),
    fullPage: false,
  });

  // The same-name local Default keeps local order and receives the missing
  // server member; server-only Income remains a separate list.
  await tabs.getByRole("tab", { name: /Default/ }).click();
  await expect(page.locator(".ptable tbody .tk")).toHaveText(["AAPL", "NVDA"]);
  await tabs.getByRole("tab", { name: /Income/ }).click();
  await expect(page.locator(".ptable tbody .tk")).toHaveText(["QQQ"]);

  // Empty is a real selectable list, never replaced with synthetic holdings.
  await tabs.getByRole("tab", { name: /Empty/ }).click();
  await expect(portfolio).toHaveAttribute("data-selected-watchlist", "Empty");
  await expect(page.locator(".kpi").first().locator("b")).toHaveText("0");
  await expect(page.locator(".empty-row")).toContainText(
    zh ? "该自选列表为空。可从图表中添加标的。" : "This watchlist is empty. Add symbols from the chart.",
  );
  await page.screenshot({
    path: testInfo.outputPath(`${testInfo.project.name}-portfolio-watchlists-empty-${zh ? "zh" : "en"}.png`),
    fullPage: false,
  });

  // If the currently viewed local list is deleted elsewhere, storage truth is
  // re-read and selection fails closed to the first surviving valid list.
  await tabs.getByRole("tab", { name: /Swing/ }).click();
  await page.evaluate(() => {
    const next = JSON.stringify({
      lists: { Default: [{ symbol: "AAPL", section: "Core" }] },
      active: "Deleted",
      meta: {},
    });
    localStorage.setItem("mm.wls", next);
    window.dispatchEvent(new StorageEvent("storage", {
      key: "mm.wls",
      newValue: next,
      storageArea: localStorage,
      url: window.location.href,
    }));
  });
  await expect(tabs.getByRole("tab")).toHaveCount(2);
  await expect(tabs.getByRole("tab", { name: /Swing/ })).toHaveCount(0);
  await expect(portfolio).toHaveAttribute("data-selected-watchlist", "Default");

  // WAI-ARIA tab keyboard movement follows the surviving list order.
  const defaultTab = tabs.getByRole("tab", { name: /Default/ });
  await defaultTab.focus();
  await page.keyboard.press("ArrowRight");
  await expect(tabs.getByRole("tab", { name: /Income/ })).toHaveAttribute("aria-selected", "true");
  await expect(tabs.getByRole("tab", { name: /Income/ })).toBeFocused();

  const responsive = await page.evaluate(() => {
    const strip = document.querySelector<HTMLElement>(".portfolio-wl-tabs");
    const pill = document.querySelector<HTMLElement>(".portfolio-wl-pill");
    const stripStyle = strip ? getComputedStyle(strip) : null;
    return {
      viewport: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      overflowX: stripStyle?.overflowX,
      touchAction: stripStyle?.touchAction,
      pillHeight: pill?.getBoundingClientRect().height ?? 0,
    };
  });
  expect(responsive.documentWidth).toBeLessThanOrEqual(responsive.viewport + 1);
  if (testInfo.project.name === "mobile") {
    expect(responsive.overflowX).toBe("auto");
    expect(responsive.touchAction).toBe("pan-x");
    expect(responsive.pillHeight).toBeGreaterThanOrEqual(44);
  }

  await page.screenshot({
    path: testInfo.outputPath(`${testInfo.project.name}-portfolio-watchlists-fallback-${zh ? "zh" : "en"}.png`),
    fullPage: false,
  });
});
