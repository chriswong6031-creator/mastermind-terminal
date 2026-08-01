import { expect, test, type Page } from "@playwright/test";

async function armTerminalVisualReady(page: Page) {
  await page.addInitScript(() => {
    const readyWindow = window as Window & { __mmResponsiveVisualReady?: boolean };
    readyWindow.__mmResponsiveVisualReady = false;
    window.addEventListener("mm:terminal-visual-ready", () => {
      readyWindow.__mmResponsiveVisualReady = true;
    }, { once: true });
  });
}

async function waitForTerminalVisualReady(page: Page) {
  await expect.poll(
    () => page.evaluate(() =>
      Boolean((window as Window & { __mmResponsiveVisualReady?: boolean }).__mmResponsiveVisualReady)),
    { message: "the interactive Terminal should finish hydrating", timeout: 15_000 },
  ).toBe(true);
}

test("the canonical Terminal shell works at its supported responsive widths", async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    localStorage.setItem("mm.set", JSON.stringify({
      tableView: true,
      cols: { last: true, changePct: true, change: false, volume: false, ext: true },
      disp: "symbol",
      logo: false,
      colW: {},
    }));
    localStorage.removeItem("mm.setVersion");
  });
  await armTerminalVisualReady(page);
  await page.goto("/terminal?symbol=NVDA");

  await expect(page.locator(".workspace")).toBeVisible();
  await expect(page.locator(".chart-body")).toBeVisible();
  // The shell is server-rendered before React attaches toolbar/settings handlers.
  await expect(page.locator(".chart-wrap canvas").first()).toBeVisible();
  await waitForTerminalVisualReady(page);

  const desktop = testInfo.project.name === "desktop";
  const logos = page.locator(".wl-row .asset-logo");
  await expect.poll(() => logos.count()).toBeGreaterThan(0);
  if (desktop) await expect(logos.first()).toBeVisible();
  await expect.poll(() => page.evaluate(() =>
    localStorage.getItem("mm.setVersion"))).toBe("1");
  const migrated = await page.evaluate(() => ({
    version: localStorage.getItem("mm.setVersion"),
    settings: JSON.parse(localStorage.getItem("mm.set") || "{}"),
  }));
  expect(migrated.version).toBe("1");
  expect(migrated.settings.logo).toBe(true);
  if (desktop) {
    await expect(page.locator(".topbar")).toBeVisible();
    await expect(page.locator(".mobilebar")).toBeHidden();
    await expect(page.locator(".m-symbar")).toBeHidden();
  } else {
    await expect(page.locator(".topbar")).toBeHidden();
    await expect(page.locator(".mobilebar")).toBeVisible();
    await expect(page.locator(".m-symbar")).toContainText("NVDA");

    await page.getByRole("button", { name: "Menu" }).click();
    await expect(page.locator(".m-drawer.open")).toBeVisible();
    await page.mouse.click((page.viewportSize()?.width ?? 390) - 8, 100);
    await expect(page.locator(".m-drawer.open")).toBeHidden();

    await page.locator(".tfbtn-edit").click();
    await expect(page.locator(".msheet")).toBeVisible();
    await expect(page.locator(".msheet-row").filter({ hasText: /^4h/ })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator(".msheet")).toBeHidden();
  }

  const settingsButton = desktop
    ? page.locator(".topbar button.avatar")
    : page.locator(".mobilebar button.avatar");
  await settingsButton.click();
  const settingsDialog = page.locator(".acs-card");
  await expect(settingsDialog).toBeVisible({ timeout: 10_000 });
  await expect(settingsDialog).toHaveAttribute("role", "dialog");
  await expect(settingsDialog).toHaveAttribute("aria-label", "Terminal");
  await expect(settingsDialog.getByRole("tab", { name: "Terminal" })).toHaveAttribute("aria-selected", "true");
  if (testInfo.project.name === "mobile") {
    const settingsTabs = settingsDialog.locator(".acs-nav");
    const tabStrip = await settingsTabs.evaluate((el) => {
      const css = getComputedStyle(el);
      return {
        clientWidth: el.clientWidth,
        scrollWidth: el.scrollWidth,
        overflowX: css.overflowX,
        touchAction: css.touchAction,
      };
    });
    expect(tabStrip.scrollWidth).toBeGreaterThan(tabStrip.clientWidth);
    expect(tabStrip.overflowX).toBe("auto");
    expect(tabStrip.touchAction).toBe("pan-x");
    await settingsTabs.evaluate((el) => el.scrollTo({ left: el.scrollWidth }));
    await expect.poll(() => settingsTabs.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  }
  await page.screenshot({
    path: testInfo.outputPath(`${testInfo.project.name}-terminal-settings.png`),
    fullPage: false,
  });
  await page.keyboard.press("Escape");
  await expect(settingsDialog).toBeHidden();

  if (!desktop) {
    // Tapping the mobile ticker is navigation into the watchlist hub, not an implicit search.
    await page.locator(".m-symbar").click();
    const searchHub = page.locator(".smodal-hub");
    const searchInput = searchHub.getByPlaceholder("Symbol, ISIN, or CUSIP");
    const viewToggle = searchHub.locator(".sh-view-toggle");
    await expect(searchHub.locator(".s-home")).toBeVisible();
    await expect(searchInput).not.toBeFocused();
    await expect(viewToggle).toHaveText("Recent");
    await searchHub.screenshot({
      path: testInfo.outputPath(`${testInfo.project.name}-search-watchlist.png`),
    });

    // The explicit action can show Recent without summoning the keyboard. NVDA arrived through the
    // route (the same path Macro Dashboard uses), so it must be recorded as viewed without a search.
    // The inverse action restores the active watchlist; focusing the field is the keyboard path.
    await viewToggle.click();
    await expect(searchHub.locator(".s-home")).toHaveCount(0);
    await expect(searchInput).not.toBeFocused();
    await expect(viewToggle).toHaveText("Watchlist");
    await expect(searchHub.locator(".sres-section-hd")).toHaveText("Recently viewed");
    await expect(searchHub.locator(".sres .r").first().locator(".tk")).toHaveText("NVDA");
    await searchHub.screenshot({
      path: testInfo.outputPath(`${testInfo.project.name}-search-recent.png`),
    });
    await viewToggle.click();
    await expect(searchHub.locator(".s-home")).toBeVisible();
    await searchInput.click();
    await expect(searchInput).toBeFocused();
    await expect(searchHub.locator(".s-home")).toHaveCount(0);
    await expect(viewToggle).toHaveText("Watchlist");
    // Typing a symbol is not a view. Leaving without opening AAPL must not add it to Recent.
    await searchInput.fill("AAPL");
    await expect(searchHub.locator(".sres .r").first().locator(".tk")).toHaveText("AAPL");
    await searchHub.locator(".smodal-title-bar .esc").click();
    await expect(searchHub).toBeHidden();
    await page.locator(".m-symbar").click();
    await searchHub.locator(".sh-view-toggle").click();
    await expect(searchHub.locator(".sres .tk")).toHaveText(["NVDA"]);
    await searchHub.locator(".smodal-title-bar .esc").click();
    await expect(searchHub).toBeHidden();
  }

  const overflow = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(overflow.document).toBeLessThanOrEqual(overflow.viewport + 1);

  await page.screenshot({
    path: testInfo.outputPath(`${testInfo.project.name}-responsive.png`),
    fullPage: false,
  });
});

test("Discover loads company logos in symbol rows", async ({ page }, testInfo) => {
  const logoRequests: string[] = [];
  await page.route("https://img.logo.dev/**", async (route) => {
    const url = route.request().url();
    logoRequests.push(url);
    if (url.includes("/ticker/MU?")) {
      await route.fulfill({ status: 404 });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#2962ff"/><path d="M18 46 32 15l14 31-14-8z" fill="white"/></svg>',
    });
  });

  await page.goto("/discover");

  const rows = page.locator("table.scr2 tbody tr").filter({ has: page.locator(".sym-cell") });
  await expect(rows.first()).toBeVisible();
  const logos = rows.locator(".asset-logo");
  await expect(logos.first()).toBeVisible();
  await expect(logos.first().locator("img")).toBeVisible();
  await expect.poll(() => logoRequests.length).toBeGreaterThan(0);
  await expect(logos.first().locator("img")).toHaveAttribute("src", /https:\/\/img\.logo\.dev\/name\/Micron%20Technology/);

  const iconSize = await logos.first().evaluate((el) => {
    const box = el.getBoundingClientRect();
    return { width: box.width, height: box.height };
  });
  expect(iconSize).toEqual({ width: 24, height: 24 });
  const overflow = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(overflow.document).toBeLessThanOrEqual(overflow.viewport + 1);

  await page.screenshot({
    path: testInfo.outputPath(`${testInfo.project.name}-discover-logos.png`),
    fullPage: false,
  });
});

test("regular-session performance stays primary while extended pricing is separate", async ({ page }, testInfo) => {
  const regularClose = 390.54;
  const previousClose = 393.33;
  const regularChange = ((regularClose - previousClose) / previousClose) * 100;

  await page.route("**/api/quote?**", async (route) => {
    const url = new URL(route.request().url());
    const syms = (url.searchParams.get("syms") || "NVDA").split(",");
    const quotes = Object.fromEntries(syms.map((sym) => [sym, sym === "NVDA" ? {
      sym,
      last: 421.14,           // deliberately contaminated raw feed value
      chg: 7.84,
      close: regularClose,
      prevClose: previousClose,
      regularPrice: regularClose,
      regularChg: regularChange,
      basis: "DELAYED_15M",
      marketSession: "post",
      extPrice: 421.14,
      extChg: 7.84,
      extTs: 1_785_533_400,
      extSession: "post",
    } : null]));
    await route.fulfill({ json: { quotes } });
  });
  await page.route("**/api/ext-quote?**", async (route) => {
    await route.fulfill({ json: { quotes: {
      NVDA: { extPrice: 421.14, extChg: 7.84, extTs: 1_785_533_400, extSession: "post" },
    } } });
  });

  await armTerminalVisualReady(page);
  await page.goto("/terminal?symbol=NVDA");
  await waitForTerminalVisualReady(page);

  if (testInfo.project.name === "desktop") {
    await expect(page.locator(".detail-hd .px")).toContainText("390.54");
    await expect(page.locator(".detail-hd .px")).toContainText("-0.71%");
    await expect(page.locator(".detail-hd .ah-block")).toContainText("421.14");
    await expect(page.locator(".detail-hd .ah-block")).toContainText("+7.84%");
  } else {
    const regular = page.locator('[data-quote-lane="regular"]');
    const extended = page.locator('[data-quote-lane="extended"]');
    await expect(regular).toContainText("390.54");
    await expect(regular).toContainText("-0.71%");
    await expect(extended).toContainText("After hours");
    await expect(extended).toContainText("421.14");
    await expect(extended).toContainText("+7.84%");
  }
});

test("Prophet fills its Options workspace at every supported width", async ({ page }, testInfo) => {
  const zh = testInfo.project.name === "tablet";
  if (zh) {
    await page.addInitScript(() => {
      localStorage.setItem("mm.lang", "zh");
      document.documentElement.setAttribute("data-lang", "zh");
      document.documentElement.setAttribute("lang", "zh-CN");
    });
  }
  await page.goto("/options?tab=prophet");

  const prophet = page.locator(".obs-prophet");
  await expect(prophet).toBeVisible({ timeout: 15_000 });
  await expect(prophet.locator(".obs-prophet-title-row h2")).toHaveText(zh ? "预言台" : "Prophet");
  await expect(prophet.locator(".obs-prophet-title-row")).toContainText(
    zh ? "Mastermind 因子引擎" : "Mastermind factor engine",
  );
  await expect(prophet.locator(".obs-prophet-signal").first()).toBeVisible();
  await expect(prophet.locator(".obs-prophet-geometry")).toBeVisible();
  await expect(prophet.locator(".obs-prophet-confidence .obs-ring")).toBeVisible();
  await expect(prophet.locator(".obs-prophet-stage")).toHaveCount(0);

  const readLayout = () => prophet.evaluate((root) => {
    const host = root.parentElement;
    const grid = root.querySelector<HTMLElement>(".obs-prophet-grid");
    if (!host || !grid) throw new Error("Prophet layout host is unavailable");
    const rootRect = root.getBoundingClientRect();
    const hostRect = host.getBoundingClientRect();
    return {
      rootWidth: rootRect.width,
      hostWidth: hostRect.width,
      unusedRight: hostRect.right - rootRect.right,
      gridDisplay: getComputedStyle(grid).display,
      gridColumns: getComputedStyle(grid).gridTemplateColumns.split(" ").length,
    };
  });

  const layout = await readLayout();
  expect(layout.rootWidth).toBeGreaterThanOrEqual(layout.hostWidth - 1);
  expect(layout.unusedRight).toBeLessThanOrEqual(1);
  if (testInfo.project.name === "mobile") {
    expect(layout.gridDisplay).toBe("flex");
  } else {
    expect(layout.gridDisplay).toBe("grid");
    expect(layout.gridColumns).toBe(testInfo.project.name === "desktop" ? 3 : 2);
  }

  const composition = await prophet.evaluate((root) => {
    const rect = (selector: string) => {
      const el = root.querySelector<HTMLElement>(selector);
      if (!el) throw new Error(`Missing Prophet pane: ${selector}`);
      const box = el.getBoundingClientRect();
      return { left: box.left, top: box.top, width: box.width, height: box.height };
    };
    return {
      left: rect(".obs-prophet-left"),
      center: rect(".obs-prophet-center"),
      right: rect(".obs-prophet-right"),
      signal: rect(".obs-prophet-signal"),
      geometry: rect(".obs-prophet-geometry"),
    };
  });
  // Regression receipt for the pre-v2 composition: readable ledger rows, a compact
  // horizontal geometry card, and the confidence ring all survive the responsive shell.
  expect(composition.signal.height).toBeGreaterThanOrEqual(58);
  expect(composition.geometry.height).toBeLessThan(280);
  if (testInfo.project.name === "desktop") {
    expect(Math.abs(composition.left.top - composition.center.top)).toBeLessThanOrEqual(1);
    expect(Math.abs(composition.center.top - composition.right.top)).toBeLessThanOrEqual(1);
    expect(composition.center.width).toBeGreaterThan(composition.left.width);
  } else if (testInfo.project.name === "tablet") {
    expect(Math.abs(composition.left.top - composition.center.top)).toBeLessThanOrEqual(1);
    expect(composition.right.top).toBeGreaterThan(composition.center.top);
  } else {
    expect(composition.center.top).toBeGreaterThan(composition.left.top);
    expect(composition.right.top).toBeGreaterThan(composition.center.top);
  }

  await page.screenshot({
    path: testInfo.outputPath(`${testInfo.project.name}-prophet.png`),
    fullPage: false,
  });

  if (testInfo.project.name === "desktop") {
    // The July 28 restyle dropped the old grid root's full-width sizing. At widths above
    // the dossier's max-content size, Prophet then stopped around 1520px and left a large
    // dead strip on the right. Exercise the width from the operator's report explicitly.
    await page.setViewportSize({ width: 1904, height: 1198 });
    const wideLayout = await readLayout();
    expect(wideLayout.rootWidth).toBeGreaterThanOrEqual(wideLayout.hostWidth - 1);
    expect(wideLayout.unusedRight).toBeLessThanOrEqual(1);
    expect(wideLayout.gridColumns).toBe(3);
    await page.screenshot({
      path: testInfo.outputPath("wide-desktop-prophet.png"),
      fullPage: false,
    });
  }

  // The compact rail still carries the v2 honesty guard. LRN's structural stop
  // exceeds both audit thresholds, so its projected targets must be de-emphasized
  // and explicitly labeled as geometry rather than forecasts.
  await prophet.locator(".obs-prophet-signal").filter({ hasText: "LRN" }).click();
  await expect(prophet.locator(".obs-prophet-geometry .obs-note")).toContainText(
    zh ? "结构过宽" : "Wide geometry",
  );
  if (testInfo.project.name === "desktop") {
    await page.screenshot({
      path: testInfo.outputPath("desktop-prophet-wide-geometry.png"),
      fullPage: false,
    });
  }

  const overflow = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(overflow.document).toBeLessThanOrEqual(overflow.viewport + 1);
});

test("Intraday Surface separates session, observed frames, and candle interval at every supported width", async ({ page }, testInfo) => {
  const candleResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === "/api/intraday" &&
      url.searchParams.get("sym") === "SPY" &&
      url.searchParams.has("date");
  });
  await page.goto("/options?tab=surface");

  await expect(page.getByText("Intraday Flow Surface", { exact: true })).toBeVisible({ timeout: 15_000 });
  const candleInterval = page.getByRole("group", { name: "Candle interval" });
  await expect(candleInterval).toBeVisible();
  await expect(candleInterval).toContainText("Candles");

  const candleResponse = await candleResponsePromise;
  expect(candleResponse.ok()).toBe(true);
  const requestedDate = new URL(candleResponse.url()).searchParams.get("date");
  expect(requestedDate).toBe("2026-07-06");
  const candlePayload = await candleResponse.json() as {
    session_date?: string;
    bars?: [number, number, number, number, number, number][];
  };
  expect(candlePayload.session_date).toBe(requestedDate);
  expect(candlePayload.bars?.length).toBeGreaterThan(0);
  const dayStart = Date.UTC(2026, 6, 6) / 1000;
  expect(candlePayload.bars?.every((bar) => bar[0] >= dayStart && bar[0] < dayStart + 86_400)).toBe(true);

  const contractStrip = page.locator(".obs-surf-data-strip");
  await expect(contractStrip).toContainText("Session");
  await expect(contractStrip).toContainText("2026-07-06");
  await expect(contractStrip).toContainText("78 observed frames");
  await expect(contractStrip).toContainText("~5m observed");
  await expect(contractStrip).toContainText("Price");
  await expect(contractStrip).toContainText("5m candles");
  await expect(contractStrip).toContainText("Observed only · no interpolation");

  const timeWindow = page.getByRole("group", { name: "Chart time window" });
  await expect(timeWindow).toBeVisible();
  await expect(timeWindow.locator("button").filter({ hasText: "Surface window" })).toHaveAttribute("aria-pressed", "true");
  await expect(timeWindow.locator("button").filter({ hasText: "Full session" })).toHaveAttribute("aria-pressed", "false");

  const frameRail = page.locator(".obs-surf-frame-rail");
  await expect(frameRail).toHaveAttribute("role", "slider");
  await expect(frameRail).toHaveAttribute("aria-valuemax", "78");
  await expect(page.locator(".obs-surf-frame-dot")).toHaveCount(78);
  const chartBox = await page.locator(".obs-surf-chart-area").boundingBox();
  expect(chartBox?.width ?? 0).toBeGreaterThan(300);

  const overflow = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(overflow.document).toBeLessThanOrEqual(overflow.viewport + 1);
  await page.screenshot({
    path: testInfo.outputPath(`${testInfo.project.name}-flow-surface.png`),
    fullPage: false,
  });
});

test("PRISM defaults to the full strike window at every supported width", async ({ page }, testInfo) => {
  await page.goto("/options?tab=prism");

  const range40 = page.getByRole("button", { name: "±40", exact: true });
  await expect(range40).toBeVisible({ timeout: 15_000 });
  await expect(range40).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "±10", exact: true })).toHaveAttribute("aria-pressed", "false");

  const matrix = page.locator("table").filter({
    has: page.getByRole("columnheader", { name: "Strike", exact: true }),
  });
  await expect(matrix).toBeVisible();
  await expect.poll(() => matrix.locator("tbody > tr").count()).toBeGreaterThanOrEqual(40);

  const overflow = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(overflow.document).toBeLessThanOrEqual(overflow.viewport + 1);
  await page.screenshot({
    path: testInfo.outputPath(`${testInfo.project.name}-prism-full-strikes.png`),
    fullPage: false,
  });
});

test("a Pro-equivalent entitlement can discover all premium modules and add a suite preset", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "One viewport is sufficient for the shared entitlement contract.");

  await armTerminalVisualReady(page);
  await page.goto("/terminal?symbol=NVDA");
  // The toolbar is present in the server-rendered shell before React attaches its handlers.
  // Waiting for the imperative chart canvas prevents a fast/parallel run from clicking pre-hydration.
  await expect(page.locator(".chart-wrap canvas").first()).toBeVisible();
  await waitForTerminalVisualReady(page);
  await page.getByRole("button", { name: "Indicators", exact: true }).click();

  const modal = page.locator(".imodal");
  await expect(modal).toBeVisible({ timeout: 10_000 });
  await expect(modal.locator(".imod-row")).toHaveCount(31);
  await expect(modal.locator(".imod-row.locked")).toHaveCount(0);

  const marketStructure = modal.locator(".imod-row").filter({ hasText: "Market Structure" });
  await marketStructure.locator(".imod-main").click();
  await expect(marketStructure).toHaveClass(/\bon\b/);

  await modal.getByRole("button", { name: "Systems & Presets" }).click();
  const structurePreset = modal.locator(".ipreset-row").filter({ hasText: "Structure Core" });
  await expect(structurePreset.getByRole("button", { name: "Current: Structure Focus" })).toBeDisabled();
  await structurePreset.getByRole("button", { name: "Apply: Structure Workflow" }).click();
  await modal.locator(".im-nav-item").filter({ hasText: "Structure Core" }).click();
  await expect(modal.locator(".imod-row.on")).toHaveCount(3);

  await modal.getByRole("button", { name: "Systems & Presets" }).click();
  await structurePreset.getByRole("button", { name: "Apply: Complete Structure Research" }).click();
  await modal.locator(".im-nav-item").filter({ hasText: "Structure Core" }).click();
  await expect(modal.locator(".imod-row.on")).toHaveCount(9);

  await modal.getByRole("button", { name: "Systems & Presets" }).click();
  await structurePreset.getByRole("button", { name: "Apply: Structure Focus" }).click();
  await modal.locator(".im-nav-item").filter({ hasText: "Structure Core" }).click();
  await expect(modal.locator(".imod-row.on")).toHaveCount(1);

  await modal.getByRole("button", { name: "Systems & Presets" }).click();
  const trendPreset = modal.locator(".ipreset-row").filter({ hasText: "Trend Waves" });
  await trendPreset.getByRole("button", { name: "Add: Candle State" }).click();
  await expect(trendPreset.getByRole("button", { name: "Current: Candle State" })).toBeDisabled();
});

test("Seasonal read stays useful in chart and table views at every supported width", async ({ page }, testInfo) => {
  const now = new Date();
  const crowdedBucketLabels = ["Oct H2", "Nov H1", "Nov H2", "Dec H1", "Dec H2"];
  const iso = (days: number) => {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };
  const interval = (
    start: number,
    end: number,
    dir: "bull" | "bear",
    move: number,
    winRate: number,
    score: number,
    buckets: string[] = [],
  ) => ({
    dir,
    start: iso(start),
    end: iso(end),
    expected_move: move,
    typical_move: move * 0.82,
    win_rate: winRate,
    n: 27,
    n_eff: 27,
    lo: dir === "bull" ? -2.8 : -5.6,
    hi: dir === "bull" ? 8.9 : 3.1,
    stability: 0.85,
    evidence_score: score,
    confidence: score >= 70 ? "high" : score >= 48 ? "medium" : "low",
    buckets,
  });
  const baseline = [
    interval(3, 25, "bull", 6.4, 0.74, 78),
    interval(34, 51, "bear", -2.1, 0.37, 55),
    interval(67, 104, "bull", 9.2, 0.78, 83, crowdedBucketLabels),
    interval(126, 148, "bull", 3.0, 0.67, 52),
  ];
  const artifact = {
    schema: "mastermind.seasonal_outlook/v1",
    symbol: "NVDA",
    as_of: iso(0),
    is_display_only: true,
    engine_version: "0.2.0",
    regime_table_version: "2026.1",
    disclaimer: "Historical research only.",
    mode: "baseline_fallback",
    default_view: "baseline",
    n_eff: 10.7,
    n_eff_note: "Effective analog count.",
    relaxed_filters: [],
    current_year: {
      year: now.getUTCFullYear(),
      cycle_pos: "midterm",
      rate_dir: "holding",
      is_recession: false,
      whipsaw: false,
      flags: [],
      anomaly_flags: [],
      provisional: true,
    },
    history: {
      first_year: 1999,
      last_date: iso(0),
      complete_years: 27,
      coverage: "deep",
    },
    validation: {
      loyo_years: 27,
      n_predictions: 612,
      regime_hit: 0.56,
      baseline_hit: 0.56,
      skill: -0.003,
      skill_ci_lo: -0.028,
      skill_ci_hi: 0.021,
      n_blocks: 7,
      regime_better_years: 8,
      baseline_better_years: 9,
      tied_years: 10,
      verdict: "no_edge",
    },
    analogs: [2010, 2014, 2002, 2006, 2018, 2011, 2012, 2013, 2015, 2019].map((year, i) => ({
      year,
      weight: 1 - i * 0.07,
      cycle_pos: "midterm",
      rate_dir: "holding",
      is_recession: false,
      whipsaw: false,
      flags: [],
      provisional: false,
    })),
    forward_buckets: crowdedBucketLabels.map((label, index) => ({
      start: iso(67 + index * 7),
      end: iso(73 + index * 7),
      label,
      baseline: {
        dir: "bull",
        mean: 2.4 + index,
        median: 2.1 + index,
        win_rate: 0.67,
        n: 27,
        lo: -4.2,
        hi: 9.8,
        confidence: "high",
      },
      regime: {
        dir: "bull",
        mean: 2.1 + index,
        median: 1.8 + index,
        win_rate: 0.64,
        n: 12,
        lo: -4.8,
        hi: 9.1,
        confidence: "medium",
      },
    })),
    intervals_baseline: baseline,
    intervals_regime: baseline.map((item) => ({
      ...item,
      expected_move: item.expected_move * 0.9,
      typical_move: item.typical_move * 0.9,
      evidence_score: Math.max(25, item.evidence_score - 18),
      confidence: "low",
      n_eff: 10.7,
    })),
    honest_read: "Baseline shown because the regime lens has no measurable edge.",
  };
  await page.route(/\/data\/NVDA\.seasonal\.json(?:\?.*)?$/, async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(artifact) });
  });

  await page.goto("/terminal?symbol=NVDA");
  await expect(page.locator(".workspace")).toBeVisible();
  const seasonal = page.locator(".fin-seas");
  await expect.poll(async () => {
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("mm:open-pane", { detail: "seasonals" }));
    });
    return seasonal.count();
  }, {
    // All three viewport projects run alongside the heavier chart suites. Give the dynamically
    // imported finance pane time to hydrate under that deliberate parallel load.
    timeout: 15_000,
  }).toBe(1);
  await expect(seasonal).toBeVisible();
  await expect(seasonal.locator(".fin-seas-chart svg")).toBeVisible();
  await expect(seasonal.locator(".fin-seas-chart svg")).not.toHaveAttribute("preserveAspectRatio", "none");
  await expect(seasonal.locator(".fin-yo-endlbl")).toHaveCount(0);
  await expect(seasonal.locator(".fin-adv-title")).toContainText("Seasonal read");
  await seasonal.locator(".fin-seas-chart").screenshot({
    path: testInfo.outputPath(`${testInfo.project.name}-seasonal-overlay.png`),
  });

  const typical = seasonal.locator(".fin-adv-typical-chart");
  const typicalPanel = typical.locator("xpath=..");
  await typical.scrollIntoViewIfNeeded();
  await expect(typical).toBeVisible();
  await expect(typicalPanel.locator(".fin-adv-monthpulse-cell")).toHaveCount(12);
  await typicalPanel.screenshot({
    path: testInfo.outputPath(`${testInfo.project.name}-seasonal-typical-path.png`),
  });

  const outlook = seasonal.locator(".fin-ro-panel");
  await outlook.scrollIntoViewIfNeeded();
  await expect(outlook.getByText("Baseline only", { exact: true })).toBeVisible();
  await expect(outlook.locator(".fin-ro-window")).toHaveCount(4);
  await outlook.screenshot({
    path: testInfo.outputPath(`${testInfo.project.name}-seasonal-forward-map.png`),
  });
  const crowdedBand = outlook.locator('.fin-ro-band[data-bucket-count="5"]');
  await expect(crowdedBand).toHaveCount(1);
  await crowdedBand.hover();
  const windowTip = page.getByRole("tooltip");
  await expect(windowTip).toBeVisible();
  await expect(windowTip.locator(".fin-tip-row")).toHaveCount(5);
  await expect(windowTip).toContainText("Support");
  await expect(windowTip).toContainText("Effective years");
  await expect(windowTip).not.toContainText("Oct H2");
  await page.screenshot({
    path: testInfo.outputPath(`${testInfo.project.name}-seasonal-forward-tooltip.png`),
  });
  await outlook.locator(".fin-ro-timeline-label").hover();
  await expect(windowTip).toHaveCount(0);

  await seasonal.getByRole("button", { name: "Table", exact: true }).click();
  await expect(seasonal.locator(".fin-seas-grid")).toBeVisible();
  await expect(seasonal.locator(".fin-adv-title")).toContainText("Seasonal read");
  await expect(seasonal.locator(".fin-ro-panel")).toBeVisible();

  const overflow = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(overflow.document).toBeLessThanOrEqual(overflow.viewport + 1);
});

test("Golden Oracle shows the session a 3D signal became knowable", async ({ page }, testInfo) => {
  // Exercise the bilingual branch at one supported width; the Terminal itself is dark-only.
  const zh = testInfo.project.name === "tablet";
  const costSlice = {
    indicator: {
      state: {
        position_hint: "long",
        last_signal: "BUY",
        last_scored_signal: "BUY",
        last_scored_ts: "2026-07-28",
        strong_bull: true,
        weeklyBull: true,
        above200: true,
      },
      signals: [{
        ts: "2026-07-24",
        known_ts: "2026-07-28",
        bar_index: 430,
        type: "BUY",
        price: 966.58,
        quality: "take",
        tier: "quality",
        score: 78,
      }],
      warnings: [],
    },
    backtest: {
      metrics: { n_trades: 10, win_rate: 0.3, profit_factor: 3.57, cagr: 0.078 },
    },
  };
  await page.route(/\/data\/COST\.slice\.json(?:\?.*)?$/, async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(costSlice) });
  });
  await armTerminalVisualReady(page);
  await page.goto("/terminal?symbol=COST");
  await expect(page.locator(".workspace")).toBeVisible();
  await waitForTerminalVisualReady(page);

  const signalButton = page.locator(".sig-btn");
  await signalButton.scrollIntoViewIfNeeded();
  if (zh) {
    // Switch through the real account-settings control so the LEX provider and persisted
    // preference take the same path they do for an operator.
    await page.locator(".mobilebar button.avatar").click();
    const settings = page.locator(".acs-card");
    await settings.getByRole("tab", { name: "Preferences" }).click();
    const zhButton = settings.getByRole("button", { name: "中文" });
    await zhButton.click();
    await expect(zhButton).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Escape");
    await expect(settings).toBeHidden();
    await signalButton.scrollIntoViewIfNeeded();
  }
  const expectedDate = zh ? "7月28日" : "Jul 28";

  await expect(signalButton.locator(".sig-btn-go .sig-btn-vd")).toHaveText(zh ? "买入" : "Buy");
  await expect(signalButton.locator(".sig-btn-go .sig-btn-sub")).toHaveText(expectedDate);
  await signalButton.click();

  const dialog = page.locator(".sd-scrim");
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("role", "dialog");
  await expect(dialog).toHaveAttribute(
    "aria-label",
    zh ? "研究台与黄金神谕" : "Research Desk and Golden Oracle",
  );
  await expect(dialog.locator(".sd-go .od-vsub")).toHaveText(expectedDate);

  const latest = dialog.locator(".sd-go .sd-sigrow").first();
  await latest.scrollIntoViewIfNeeded();
  await expect(latest.locator(".sd-sig-date")).toHaveText(
    zh ? "2026年7月28日" : "Jul 28, 2026",
  );
  await expect(latest).toHaveAttribute(
    "title",
    zh
      ? /确认于 2026年7月28日 · 3日K线始于 2026年7月24日/
      : /Confirmed Jul 28, 2026 · 3D bar opened Jul 24, 2026/,
  );
  await dialog.locator(".sd-go").screenshot({
    path: testInfo.outputPath(`${testInfo.project.name}-oracle-known-date.png`),
  });

  // The visible/actionable date changed, but chart navigation still targets the bar-open date.
  await page.evaluate(() => {
    (window as Window & { __oracleJumpTs?: string }).__oracleJumpTs = "";
    window.addEventListener("mm:chart-jump", (event) => {
      const detail = (event as CustomEvent<{ ts?: string }>).detail;
      (window as Window & { __oracleJumpTs?: string }).__oracleJumpTs = detail?.ts ?? "";
    }, { once: true });
  });
  await latest.click();
  await expect.poll(
    () => page.evaluate(() => (window as Window & { __oracleJumpTs?: string }).__oracleJumpTs),
  ).toBe("2026-07-24");
});

test("Exposure desk replays an archived session's full ladder at every supported width", async ({ page }, testInfo) => {
  await page.goto("/options?tab=gex");

  // Live desk up first: the ladder and the session dropdown (driven by the
  // gex_history dates.json index — R0.10) are both on screen, no archived chip yet.
  const picker = page.getByRole("combobox", { name: "Archived session" });
  await expect(picker).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("group", { name: "Strike range" })).toBeVisible();
  await expect(page.getByTestId("gex-archived-chip")).toHaveCount(0);

  // Pick an archived session → that session's FULL ladder, labelled as archived.
  await picker.selectOption("2026-07-02");
  const chip = page.getByTestId("gex-archived-chip");
  await expect(chip).toBeVisible();
  await expect(chip).toContainText("archived session · 2026-07-02");
  await expect(page.getByRole("group", { name: "Strike range" })).toBeVisible();
  // The replay withdraws the current-session rail and says so, instead of leaving
  // an empty column that reads as breakage.
  await expect(page.getByText("Archived session", { exact: true })).toBeVisible();

  // Conditional replay actions must not resize the history strip. The original
  // implementation added the button as another readout row and shifted the entire
  // ladder section whenever keyboard or pointer scrubbing entered a prior session.
  const historyCard = page.locator(".obs-gex-history");
  const latestHeight = await historyCard.evaluate((el) => el.getBoundingClientRect().height);

  // The scrubber probes a session the index does NOT list (2026-07-07 — the fixture's
  // deliberate accrual hole, the prod 07-18/07-20 class): honest missing-session state,
  // never a fabricated ladder.
  const scrubber = page.locator('svg[role="slider"]');
  await scrubber.focus();
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  const loadFullLadder = page.getByRole("button", { name: "Load full ladder" });
  await expect(loadFullLadder).toBeVisible();
  const replayHeight = await historyCard.evaluate((el) => el.getBoundingClientRect().height);
  expect(Math.abs(replayHeight - latestHeight)).toBeLessThanOrEqual(1);
  await loadFullLadder.click();
  await expect(chip).toContainText("archived session · 2026-07-07");
  const missing = page.getByTestId("gex-archived-missing");
  await expect(missing).toBeVisible();
  await expect(missing).toContainText("No archived snapshot for 2026-07-07");

  // Back to the live session: chip gone, live ladder back.
  await page.getByRole("button", { name: "Back to latest" }).first().click();
  await expect(page.getByTestId("gex-archived-chip")).toHaveCount(0);
  await expect(page.getByRole("group", { name: "Strike range" })).toBeVisible();

  const overflow = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(overflow.document).toBeLessThanOrEqual(overflow.viewport + 1);
  await page.screenshot({
    path: testInfo.outputPath(`${testInfo.project.name}-gex-archived-session.png`),
    fullPage: false,
  });
});
