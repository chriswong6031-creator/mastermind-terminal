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
  await armTerminalVisualReady(page);
  await page.goto("/terminal?symbol=NVDA");

  await expect(page.locator(".workspace")).toBeVisible();
  await expect(page.locator(".chart-body")).toBeVisible();
  // The shell is server-rendered before React attaches toolbar/settings handlers.
  await expect(page.locator(".chart-wrap canvas").first()).toBeVisible();
  await waitForTerminalVisualReady(page);

  const desktop = testInfo.project.name === "desktop";
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
  const reapplyStructure = structurePreset.getByRole("button", { name: /Reapply recommended/ });
  await expect(reapplyStructure).toBeEnabled();
  await reapplyStructure.click();
  await modal.locator(".im-nav-item").filter({ hasText: "Structure Core" }).click();
  await expect(modal.locator(".imod-row.on")).toHaveCount(3);

  await modal.getByRole("button", { name: "Systems & Presets" }).click();
  const trendPreset = modal.locator(".ipreset-row").filter({ hasText: "Trend Waves" });
  await trendPreset.getByRole("button", { name: /Add recommended/ }).click();
  await expect(trendPreset.getByRole("button", { name: /Reapply recommended/ })).toBeEnabled();
});

test("Seasonal read stays useful in chart and table views at every supported width", async ({ page }, testInfo) => {
  const now = new Date();
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
    buckets: [],
  });
  const baseline = [
    interval(3, 25, "bull", 6.4, 0.74, 78),
    interval(34, 51, "bear", -2.1, 0.37, 55),
    interval(67, 104, "bull", 9.2, 0.78, 83),
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
    forward_buckets: [],
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
