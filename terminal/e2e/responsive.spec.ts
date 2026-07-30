import { expect, test } from "@playwright/test";

test("the canonical Terminal shell works at its supported responsive widths", async ({ page }, testInfo) => {
  await page.goto("/terminal?symbol=NVDA");

  await expect(page.locator(".workspace")).toBeVisible();
  await expect(page.locator(".chart-body")).toBeVisible();

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
  const settingsDialog = page.getByRole("dialog", { name: "Terminal" });
  await expect(settingsDialog).toBeVisible();
  await expect(settingsDialog.getByRole("tab", { name: "Terminal" })).toHaveAttribute("aria-selected", "true");
  await page.screenshot({
    path: testInfo.outputPath(`${testInfo.project.name}-terminal-settings.png`),
    fullPage: false,
  });
  await page.keyboard.press("Escape");
  await expect(settingsDialog).toBeHidden();

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

test("a Pro-equivalent entitlement can add every premium suite", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "One viewport is sufficient for the shared entitlement contract.");

  await page.goto("/terminal?symbol=NVDA");
  await page.getByRole("button", { name: "Indicators", exact: true }).click();

  const modal = page.locator(".imodal");
  await expect(modal).toBeVisible();
  await expect(modal.locator(".li-lock")).toHaveCount(0);

  const structure = modal.locator(".li").filter({ hasText: "Structure Core" });
  await structure.click();
  await expect(structure).toHaveClass(/\bon\b/);
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
  await page.goto("/terminal?symbol=COST");
  await expect(page.locator(".workspace")).toBeVisible();

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

  const dialog = page.getByRole("dialog", {
    name: zh ? "研究台与黄金神谕" : "Research Desk and Golden Oracle",
  });
  await expect(dialog).toBeVisible();
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
