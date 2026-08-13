import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { isolateWatchlistStore } from "./watchlistStore";

// W5 — `/portfolio` is the user's REAL portfolio (`portfolio_positions`).
//
// It replaces `portfolio-watchlists-responsive.spec.ts`, whose whole subject was the watchlist
// switcher this wave removed. What that spec proved about the viewport contract is re-proved here
// against the surface that actually ships.
//
// Every position below is created through the REAL route (`POST /api/portfolio` → lib/portfolio.ts
// → the fixture transport), and the page reads the SAME store server-side, so nothing here is a
// staged DOM: what the spec writes is what the product renders.
//
// Isolation: the fixture store is process-global and the matrix is fullyParallel across three
// viewport projects, so every test takes its own account-shaped world via `isolateWatchlistStore`
// (per-run nonce + repeatEachIndex + retry — W1b's F9 fix).

// Two multi-mount tests plus modal round-trips; the 30s default is a per-test budget, and the
// config's 120_000 is the webServer START timeout, not this one (W1b residual (b)).
test.setTimeout(120_000);

const MANIFEST = {
  symbols: {
    NVDA: { name: "NVIDIA", zh: "英伟达", col: "#76b900", last: 175, chg: 1.2 },
    AAPL: { name: "Apple", zh: "苹果", col: "#8e8e93", last: 228.1, chg: -0.4 },
    MSFT: { name: "Microsoft", zh: "微软", col: "#00a4ef", last: 511.8, chg: 0.7 },
  },
};

// NVDA quotes live (and differs from the manifest, so the test can tell which one won). AAPL has
// no live quote and falls back to the manifest. `ZZUNKNOWN` is in NEITHER — it must render dashes.
const QUOTES = { quotes: { NVDA: { last: 180, chg: 2.5 } } };

const BRIEF = {
  schema: "portfolio_brief.v1",
  asof: "2026-08-12",
  generated_at: "2026-08-12T06:37:00Z",
  stale: false,
  weighting: { mode: "cost_basis", label_en: "by cost basis", label_zh: "按成本权重" },
  book: { n: 2, covered: 2, uncovered: [] },
  headline: { en: "Your book is concentrated in semis.", zh: "你的账本集中在半导体。" },
  sections: [{
    key: "exposure",
    title_en: "Exposure",
    title_zh: "敞口",
    lines: [{ en: "Two names carry the book.", zh: "两只标的构成账本主体。" }],
  }],
};

type Draft = { ticker: string; shares?: string; entryPrice?: string; entryDate?: string; notes?: string };

/** Create a position through the product's own route, as the signed-in fixture user. */
async function seedPosition(page: Page, draft: Draft) {
  const response = await page.request.post("/api/portfolio", { data: { action: "create", ...draft } });
  expect(response.ok(), `seeding ${draft.ticker} failed: ${response.status()}`).toBe(true);
  return (await response.json()).position as { id: string; ticker: string };
}

async function readBook(page: Page) {
  const response = await page.request.get("/api/portfolio");
  expect(response.ok()).toBe(true);
  return (await response.json()).positions as { id: string; ticker: string; status: string; shares: number | null }[];
}

async function readWatchlists(page: Page) {
  const response = await page.request.get("/api/watchlist");
  expect(response.ok()).toBe(true);
  return (await response.json()).lists as { name: string; symbols: { symbol: string }[] }[];
}

/** Routes + language, installed before any navigation. */
async function prepare(page: Page, testInfo: TestInfo, baseURL: string | undefined, opts: { zh?: boolean; brief?: boolean } = {}) {
  await isolateWatchlistStore(page, testInfo, baseURL);
  await page.addInitScript((useZh) => {
    localStorage.setItem("mm.lang", useZh ? "zh" : "en");
    document.documentElement.setAttribute("data-lang", useZh ? "zh" : "en");
    document.documentElement.setAttribute("lang", useZh ? "zh-CN" : "en");
  }, !!opts.zh);
  await page.route("**/data/manifest.json", (route) => route.fulfill({ json: MANIFEST }));
  await page.route("**/api/quote**", (route) => route.fulfill({ json: QUOTES }));
  await page.route("**/api/portfolio-brief", (route) => (opts.brief
    ? route.fulfill({ json: BRIEF })
    : route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ tier: "free" }) })));
}

// The OPEN table specifically. `.panel .pf-table` alone also matches the closed section's
// table, so a row that merely MOVED between the two would read as if nothing happened.
const table = (page: Page) => page.getByTestId("portfolio-open").locator(".pf-table tbody");
const row = (page: Page, ticker: string) => page.getByTestId("portfolio-open").locator(`.pf-table tbody tr[data-ticker='${ticker}']`);

test("/portfolio renders positions only — no watchlist rows, no switcher, no Conviction Book", async ({ page, baseURL }, testInfo) => {
  await prepare(page, testInfo, baseURL);
  await seedPosition(page, { ticker: "NVDA", shares: "10", entryPrice: "150", entryDate: "2026-01-05" });
  await seedPosition(page, { ticker: "AAPL", shares: "4", entryPrice: "240" });

  await page.goto("/portfolio");
  const portfolio = page.locator("[data-portfolio='w5-positions']");
  await expect(portfolio).toBeVisible();

  // The book, and ONLY the book.
  await expect(table(page).locator("tr[data-ticker]")).toHaveCount(2);
  await expect(table(page).locator(".pf-tk")).toHaveText(["NVDA", "AAPL"]);

  // The watchlist store for this account is seeded with six symbols (lib/watchlistsFixtureDb.ts).
  // NOT ONE of them may reach this page — that conflation is the whole defect W5 closes. This is a
  // real check, not a vacuous one: the rows exist, and `readWatchlists` proves it below.
  const lists = await readWatchlists(page);
  const watched = lists.flatMap((list) => list.symbols.map((s) => s.symbol));
  expect(watched).toContain("MSFT");
  expect(watched.length).toBeGreaterThanOrEqual(6);
  for (const symbol of watched) {
    if (symbol === "NVDA" || symbol === "AAPL") continue;   // held AND watched is legal
    await expect(page.locator(`.pf-table tbody tr[data-ticker='${symbol}']`)).toHaveCount(0);   // open OR closed
  }
  await expect(page.locator("body")).not.toContainText("MSFT");

  // The switcher is gone, in every form it had.
  await expect(page.locator(".portfolio-wl-switch, .portfolio-wl-tabs, .portfolio-wl-pill")).toHaveCount(0);
  await expect(page.getByRole("tablist")).toHaveCount(0);

  // …and so is the name. Case-insensitive, over the whole rendered document.
  const text = await page.locator("body").innerText();
  expect(text.toLowerCase()).not.toContain("conviction");
  expect(text).not.toContain("信念账本");
  expect(text).not.toContain("Suggested tilt");
});

test("live values come from the quote hub, and an unresolved symbol dashes instead of guessing", async ({ page, baseURL }, testInfo) => {
  await prepare(page, testInfo, baseURL);
  await seedPosition(page, { ticker: "NVDA", shares: "10", entryPrice: "150" });     // live quote: 180
  await seedPosition(page, { ticker: "AAPL", shares: "2", entryPrice: "200" });      // manifest only: 228.1
  await seedPosition(page, { ticker: "ZZUNKNOWN", shares: "5", entryPrice: "10" });  // neither

  await page.goto("/portfolio");
  await expect(table(page).locator("tr[data-ticker]")).toHaveCount(3);

  // The LIVE quote wins over the nightly manifest (175 would be the manifest's answer).
  const nvda = row(page, "NVDA").locator("td");
  await expect.poll(async () => (await nvda.nth(4).innerText()).trim(), { timeout: 20_000 }).toBe("180.00");
  await expect(nvda.nth(5)).toHaveText("1,800.00");                 // 10 × 180
  await expect(nvda.nth(6)).toContainText("+20.00%");               // 150 → 180

  // Manifest fallback for a name the live batch did not answer for.
  await expect(row(page, "AAPL").locator("td").nth(4)).toHaveText("228.10");

  // No price anywhere → dashes, never a cost-basis stand-in and never a zero.
  const unknown = row(page, "ZZUNKNOWN").locator("td");
  await expect(unknown.nth(4)).toHaveText("—");
  await expect(unknown.nth(5)).toHaveText("—");
  await expect(unknown.nth(6)).toHaveText("—");

  // …and the page SAYS the total excludes it rather than quietly shrinking.
  const coverage = page.getByTestId("portfolio-coverage");
  await expect(coverage).toBeVisible();
  await expect(coverage).toContainText("2 of 3");
  await expect(coverage).toContainText("ZZUNKNOWN");

  await page.screenshot({
    path: testInfo.outputPath(`${testInfo.project.name}-portfolio-positions-live.png`),
    fullPage: false,
  });
});

test("an unsized position is a labelled state, not a broken row", async ({ page, baseURL }, testInfo) => {
  await prepare(page, testInfo, baseURL);
  await seedPosition(page, { ticker: "NVDA" });

  await page.goto("/portfolio");
  const cells = row(page, "NVDA").locator("td");
  await expect(row(page, "NVDA").locator(".pf-unsized")).toBeVisible();
  await expect(cells.nth(1)).toHaveText("—");     // shares
  await expect(cells.nth(5)).toHaveText("—");     // value: a price with no size buys nothing
  // Book value has nothing to sum, so it says so rather than printing 0.
  await expect(page.locator(".kpi").first().locator("b")).toHaveText("—");
});

test("add · edit · close · delete, all browser-driven, none of it touching the watchlist", async ({ page, baseURL }, testInfo) => {
  await prepare(page, testInfo, baseURL);
  await page.goto("/portfolio");

  const watchlistBefore = await readWatchlists(page);

  // ── empty state is an invitation, not a shrug ──
  await expect(page.locator(".pf-empty")).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath(`${testInfo.project.name}-portfolio-empty.png`),
    fullPage: false,
  });

  // ── ADD (gate B: no watchlist row may move) ──
  await page.locator(".pf-empty .pf-add-btn").click();
  const modal = page.getByRole("dialog");
  await expect(modal).toBeVisible();
  await modal.locator("input[name='ticker']").fill("nvda");
  await modal.locator("input[name='shares']").fill("10");
  await modal.locator("input[name='entryPrice']").fill("150");
  await page.screenshot({
    path: testInfo.outputPath(`${testInfo.project.name}-portfolio-add-modal.png`),
    fullPage: false,
  });
  await modal.getByRole("button", { name: /Save position|保存持仓/ }).click();
  await expect(modal).toHaveCount(0);
  await expect(row(page, "NVDA")).toBeVisible();
  expect(await readWatchlists(page)).toEqual(watchlistBefore);           // gate B

  // ── EDIT: a patch changes what it names and nothing else ──
  await row(page, "NVDA").getByRole("button", { name: /^(Edit|编辑) NVDA$/ }).click();
  const edit = page.getByRole("dialog");
  await edit.locator("input[name='shares']").fill("25");
  await edit.getByRole("button", { name: /Save position|保存持仓/ }).click();
  await expect(edit).toHaveCount(0);
  await expect(row(page, "NVDA").locator("td").nth(1)).toHaveText("25");
  await expect(row(page, "NVDA").locator("td").nth(2)).toHaveText("150.00");   // entry price untouched

  // ── CLOSE (gate D: watchlist membership survives) ──
  await page.request.post("/api/watchlist", { data: { action: "add", symbols: ["NVDA"], section: "Equities" } });
  await page.reload();
  await row(page, "NVDA").getByRole("button", { name: /^(Close|平仓) NVDA$/ }).click();
  await expect(page.getByTestId("portfolio-closed")).toBeVisible();
  await expect(table(page).locator("tr[data-ticker]")).toHaveCount(0);            // out of OPEN
  const closedRow = page.locator(".pf-closed tr[data-ticker='NVDA']");
  await expect(closedRow).toHaveAttribute("data-status", "closed");
  const afterClose = await readWatchlists(page);
  expect(afterClose.flatMap((l) => l.symbols.map((s) => s.symbol))).toContain("NVDA");   // gate D
  const closedBook = await readBook(page);
  expect(closedBook.map((p) => [p.ticker, p.status, p.shares])).toEqual([["NVDA", "closed", 25]]);

  // ── DELETE: two-step, and the watchlist row still survives (gate C's mirror) ──
  await page.getByTestId("portfolio-closed").locator("summary").click();
  await closedRow.getByRole("button", { name: /^(Delete|删除) NVDA$/ }).click();
  await closedRow.locator(".pf-confirm").getByRole("button", { name: /^(Delete|删除)$/ }).click();
  await expect.poll(async () => (await readBook(page)).length, { timeout: 15_000 }).toBe(0);
  expect((await readWatchlists(page)).flatMap((l) => l.symbols.map((s) => s.symbol))).toContain("NVDA");

  // ── gate A: a watchlist add moves no position ──
  await seedPosition(page, { ticker: "AAPL", shares: "3" });
  const bookBefore = await readBook(page);
  await page.request.post("/api/watchlist", { data: { action: "add", symbols: ["TSLA"], section: "Equities" } });
  expect(await readBook(page)).toEqual(bookBefore);
});

test("the brief states which names it is reading, and flags a population it did not read", async ({ page, baseURL }, testInfo) => {
  await prepare(page, testInfo, baseURL, { brief: true });
  // BRIEF.book.n is 2 — seed exactly two so the disclosure agrees first.
  await seedPosition(page, { ticker: "NVDA", shares: "10", entryPrice: "150" });
  await seedPosition(page, { ticker: "AAPL", shares: "4", entryPrice: "240" });

  await page.goto("/portfolio");
  const disclosure = page.getByTestId("brief-population");
  await expect(disclosure).toBeVisible({ timeout: 20_000 });
  await expect(disclosure).toContainText("2");
  await expect(disclosure.locator(".pbrief-population-gap")).toHaveCount(0);

  // A third position makes the page's population provably different from the desk's — and the
  // panel must SAY so rather than let two numbers sit next to each other pretending to agree.
  await seedPosition(page, { ticker: "MSFT", shares: "1" });
  await page.reload();
  await expect(disclosure.locator(".pbrief-population-gap")).toBeVisible({ timeout: 20_000 });
  await expect(disclosure).toContainText("3");
  await expect(disclosure.locator(".pbrief-population-gap")).toContainText("2");

  await page.screenshot({
    path: testInfo.outputPath(`${testInfo.project.name}-portfolio-population-disclosure.png`),
    fullPage: false,
  });
});

test("the page holds its shape at this viewport, in zh", async ({ page, baseURL }, testInfo) => {
  await prepare(page, testInfo, baseURL, { zh: true });
  await seedPosition(page, { ticker: "NVDA", shares: "10", entryPrice: "150", entryDate: "2026-01-05" });
  await seedPosition(page, { ticker: "ZZUNKNOWN", shares: "5" });

  await page.goto("/portfolio");
  await expect(page.locator("[data-portfolio='w5-positions']")).toBeVisible();
  // zh must be the whole surface, not a half-translated one.
  await expect(page.locator(".pg-head h2")).toHaveText("投资组合");
  await expect(page.locator(".pf-add-btn").first()).toContainText("添加持仓");
  await expect(page.locator(".panel .ph").first()).toContainText("在持仓位");
  await expect(page.locator("body")).not.toContainText("Open positions");

  const shape = await page.evaluate(() => ({
    viewport: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    // The table scrolls INSIDE its own container; the page never does.
    scrollerOverflowX: getComputedStyle(document.querySelector(".tbl-scroll")!).overflowX,
    addButtonHeight: document.querySelector<HTMLElement>(".pf-add-btn")!.getBoundingClientRect().height,
  }));
  expect(shape.documentWidth).toBeLessThanOrEqual(shape.viewport + 1);
  expect(shape.scrollerOverflowX).toBe("auto");
  expect(shape.addButtonHeight).toBeGreaterThanOrEqual(32);

  // EVERY viewport must keep the row controls reachable. The responsive column plan this table
  // inherited was written for the retired 9-column Conviction Book and, applied by position, hid
  // the actions column at 390px — a phone user could see their book and change nothing in it.
  // Asserted here so it cannot come back silently.
  for (const name of [/^编辑 NVDA$/, /^平仓 NVDA$/, /^删除 NVDA$/]) {
    const control = row(page, "NVDA").getByRole("button", { name });
    await expect(control).toBeVisible();
    const box = await control.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(0);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(26);
  }
  // …and the symbol stays legible next to them, never squeezed out by the controls.
  await expect(row(page, "NVDA").locator(".pf-tk")).toBeVisible();

  await page.screenshot({
    path: testInfo.outputPath(`${testInfo.project.name}-portfolio-zh.png`),
    fullPage: false,
  });
});
