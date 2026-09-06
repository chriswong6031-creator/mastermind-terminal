import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { join } from "node:path";
import { isolateWatchlistStore } from "./watchlistStore";

// B-F08-4 evidence generator (packet-required, ad-hoc — not part of test:e2e:responsive).
// OPT-IN via TERMINAL_CROPS=1. Positions come from real POSTs through /api/portfolio; the
// per-ticker artifact reads go through STOCKDATA_BASE (set by the invoking shell) so the
// gap states (missing/locked) are real transport outcomes, not mocked JSON.
test.skip(!process.env.TERMINAL_CROPS, "Crop generator — set TERMINAL_CROPS=1 to write PR artifacts.");
test.setTimeout(120_000);

const OUT = join(process.cwd(), "docs", "pr-crops", "b-f08-4-risk");
const MODE = process.env.CROPS_MODE || "mixed";

const MANIFEST = { symbols: {
  NVDA: { name: "NVIDIA", zh: "英伟达", col: "#76b900", last: 175, chg: 1.2 },
  AAPL: { name: "Apple", zh: "苹果", col: "#8e8e93", last: 228.1, chg: -0.4 },
  GLD: { name: "SPDR Gold Shares", zh: "SPDR黄金ETF", col: "#e8b339", last: 318.4, chg: 0.6 },
  TLT: { name: "iShares 20+ Treasury", zh: "20年期以上美债ETF", col: "#4d82ff", last: 89.2, chg: -0.3 },
}};
const QUOTES = { quotes: {
  NVDA: { last: 180.2, chg: 2.5 }, AAPL: { last: 231.4, chg: -0.9 },
  GLD: { last: 320.1, chg: 0.7 }, TLT: { last: 89.5, chg: 0.1 },
}};

const shot = (page: Page, name: string, testInfo: TestInfo, lang = "en") =>
  page.screenshot({ path: join(OUT, `${name}-${lang}-${testInfo.project.name}-${MODE}.png`), fullPage: false });

async function prepare(page: Page, testInfo: TestInfo, baseURL: string | undefined, zh = false) {
  await isolateWatchlistStore(page, testInfo, baseURL);
  await page.addInitScript((useZh) => {
    localStorage.setItem("mm.lang", useZh ? "zh" : "en");
    document.documentElement.setAttribute("data-lang", useZh ? "zh" : "en");
    document.documentElement.setAttribute("lang", useZh ? "zh-CN" : "en");
  }, zh);
  await page.route("**/data/manifest.json", (route) => route.fulfill({ json: MANIFEST }));
  await page.route("**/api/quote**", (route) => route.fulfill({ json: QUOTES }));
  await page.route("**/api/portfolio-brief", (route) => route.fulfill({ status: 404, json: {} }));
}

async function seedBook(page: Page) {
  const rows = [
    { ticker: "NVDA", shares: "120", entryPrice: "138.40", entryDate: "2026-01-05" },
    { ticker: "AAPL", shares: "60", entryPrice: "244.10", entryDate: "2026-03-18" },
    { ticker: "GLD", shares: "40", entryPrice: "296.00", entryDate: "2025-11-02" },
    { ticker: "TLT", shares: "150", entryPrice: "94.30", entryDate: "2026-02-11" },
  ];
  for (const row of rows) {
    const r = await page.request.post("/api/portfolio", { data: { action: "create", ...row } });
    expect(r.ok()).toBe(true);
  }
}

test("risk readout — mixed/outage book, EN", async ({ page, baseURL }, testInfo) => {
  await prepare(page, testInfo, baseURL, false);
  await seedBook(page);
  await page.goto("/portfolio");
  await expect(page.getByTestId("portfolio-shape")).toBeVisible({ timeout: 20_000 });
  await shot(page, "risk-book", testInfo, "en");
  if (MODE === "mixed") {
    const gaps = page.getByTestId("shape-gaps");
    if (await gaps.count()) {
      await gaps.locator("summary").focus();
      await shot(page, "risk-gaps-focus", testInfo, "en");
    }
  }
});

test("risk readout — mixed/outage book, ZH", async ({ page, baseURL }, testInfo) => {
  await prepare(page, testInfo, baseURL, true);
  await seedBook(page);
  await page.goto("/portfolio");
  await expect(page.getByTestId("portfolio-shape")).toBeVisible({ timeout: 20_000 });
  await shot(page, "risk-book", testInfo, "zh");
});

test("risk readout — empty book renders nothing", async ({ page, baseURL }, testInfo) => {
  test.skip(MODE !== "mixed", "Empty-book crop only needed once.");
  await prepare(page, testInfo, baseURL, false);
  await page.goto("/portfolio");
  await expect(page.locator(".pf-empty")).toBeVisible();
  await expect(page.getByTestId("portfolio-shape")).toHaveCount(0);
  await shot(page, "risk-empty", testInfo);
});
