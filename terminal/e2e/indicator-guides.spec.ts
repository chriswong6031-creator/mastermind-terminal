import { expect, test, type Page } from "@playwright/test";

async function armTerminalVisualReady(page: Page) {
  await page.addInitScript(() => {
    const readyWindow = window as Window & { __mmGuideVisualReady?: boolean };
    readyWindow.__mmGuideVisualReady = false;
    window.addEventListener("mm:terminal-visual-ready", () => {
      readyWindow.__mmGuideVisualReady = true;
    }, { once: true });
  });
}

async function waitForTerminalVisualReady(page: Page) {
  await expect.poll(
    () => page.evaluate(() =>
      Boolean((window as Window & { __mmGuideVisualReady?: boolean }).__mmGuideVisualReady)),
    { message: "the interactive Terminal should finish hydrating", timeout: 15_000 },
  ).toBe(true);
}

async function openIndicatorLibrary(page: Page) {
  await armTerminalVisualReady(page);
  await page.goto("/terminal?symbol=NVDA");
  await expect(page.locator(".workspace")).toBeVisible();
  await expect(page.locator(".chart-wrap canvas").first()).toBeVisible();
  await waitForTerminalVisualReady(page);

  const trigger = page.locator(".indicator-library-trigger");
  await expect(trigger).toBeVisible();
  await trigger.scrollIntoViewIfNeeded();
  await trigger.click();

  const library = page.locator(".imodal-library");
  await expect(library).toBeVisible({ timeout: 10_000 });
  return { library, trigger };
}

test("module switches and the 31-module Guide Center are accessible and responsive", async ({ page }, testInfo) => {
  const { library } = await openIndicatorLibrary(page);

  await library.getByRole("button", { name: /Trend Waves/ }).click();

  // Candle Painter is the suite's free module, so this contract remains testable for guests too.
  const moduleSwitch = library.getByRole("switch", { name: "Candle Painter", exact: true });
  await expect(moduleSwitch).toBeVisible();
  await expect(moduleSwitch.locator(".im-state-switch")).toHaveCount(1);
  await expect(moduleSwitch.locator("input[type=checkbox]")).toHaveCount(0);

  const initialState = await moduleSwitch.getAttribute("aria-checked");
  expect(initialState === "true" || initialState === "false").toBe(true);
  const nextState = initialState === "true" ? "false" : "true";

  await moduleSwitch.focus();
  await moduleSwitch.press("Space");
  await expect(moduleSwitch).toHaveAttribute("aria-checked", nextState);
  await expect(moduleSwitch).toHaveAccessibleName("Candle Painter");
  await expect.poll(() =>
    moduleSwitch.locator(".im-state-switch").evaluate((element) => element.classList.contains("on")),
  ).toBe(nextState === "true");

  const touchTarget = await moduleSwitch.boundingBox();
  expect(touchTarget?.height ?? 0).toBeGreaterThanOrEqual(44);

  // Restore the initial chart state so this test leaves persistence deterministic.
  await moduleSwitch.press("Space");
  await expect(moduleSwitch).toHaveAttribute("aria-checked", initialState!);

  const guideTrigger = library.getByRole("button", { name: "Guide: Trend Engine" });
  await guideTrigger.click();

  const guide = page.locator(".gp-center");
  await expect(guide).toBeVisible({ timeout: 10_000 });
  await expect(page.locator(".scrim.is-suspended")).toHaveAttribute("aria-hidden", "true");
  await expect(guide.getByRole("heading", { level: 1, name: "Trend Engine" })).toBeVisible();
  await expect(guide.getByRole("img", { name: /Manage the full trade path/ })).toBeVisible();
  await expect(guide.getByRole("list", { name: "Legend" })).toBeVisible();
  await expect(guide.getByLabel("At a glance")).toBeVisible();
  await expect(guide.getByLabel("Current settings schema")).toBeVisible();
  await expect(guide.locator(".gp-event-list code")).toHaveText([
    "te_flip",
    "te_power",
    "te_tp_hit",
  ]);

  const guideSearch = guide.getByRole("searchbox", { name: "Search guides" });
  await guideSearch.fill("Flow Band");
  await guideSearch.press("Escape");
  await expect(guideSearch).toHaveValue("");
  await expect(guideSearch).toBeFocused();
  await expect(guide).toBeVisible();

  await guideSearch.fill("Flow Band");
  const clearGuideSearch = guide.getByRole("button", { name: "Clear guide search" });
  if (testInfo.project.name !== "desktop") {
    const clearBox = await clearGuideSearch.boundingBox();
    expect(Math.round(clearBox?.width ?? 0)).toBeGreaterThanOrEqual(44);
    expect(Math.round(clearBox?.height ?? 0)).toBeGreaterThanOrEqual(44);
  }
  await expect(guide.locator(".gp-library-modules").getByRole("button", { name: /Flow Band/ })).toBeVisible();
  await guide.locator(".gp-library-modules").getByRole("button", { name: /Flow Band/ }).click();

  await expect(guide.getByRole("heading", { level: 1, name: "Flow Band" })).toBeVisible();
  await expect(guide.getByRole("img", { name: /Read direction and participation together/ })).toBeVisible();
  await clearGuideSearch.click();
  await expect(guideSearch).toHaveValue("");
  await expect(guideSearch).toBeFocused();

  const chartAction = guide.locator(".gp-chart-action:not(.upgrade)");
  const chartActionWasOn = await chartAction.getAttribute("aria-pressed") === "true";
  await chartAction.click();
  await expect(chartAction).toHaveAttribute("aria-pressed", String(!chartActionWasOn));
  await chartAction.click();
  await expect(chartAction).toHaveAttribute("aria-pressed", String(chartActionWasOn));

  const visibleToc = guide.locator(".gp-toc:visible, .gp-mobile-toc:visible");
  await visibleToc.getByRole("button", { name: /Settings$/ }).click();
  await expect.poll(
    () => guide.locator(".gp-scroll").evaluate((element) => element.scrollTop),
    { message: "the guide TOC should navigate its article" },
  ).toBeGreaterThan(0);
  await expect(guide.locator(".gp-section-settings")).toBeVisible();

  const viewportFit = await guide.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      documentWidth: document.documentElement.scrollWidth,
    };
  });
  expect(viewportFit.left).toBeGreaterThanOrEqual(-1);
  expect(viewportFit.right).toBeLessThanOrEqual(viewportFit.viewportWidth + 1);
  expect(viewportFit.top).toBeGreaterThanOrEqual(-1);
  expect(viewportFit.bottom).toBeLessThanOrEqual(viewportFit.viewportHeight + 1);
  expect(viewportFit.documentWidth).toBeLessThanOrEqual(viewportFit.viewportWidth + 1);

  await guide.screenshot({
    path: testInfo.outputPath(`${testInfo.project.name}-indicator-guide-center.png`),
  });

  // The dialog traps keyboard focus and returns it to the Guide action on close.
  await guide.focus();
  await page.keyboard.press("Tab");
  await expect.poll(() =>
    guide.evaluate((element) => element.contains(document.activeElement)),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(guide).toBeHidden();
  await expect(guideTrigger).toBeFocused();
  await expect(library).toBeVisible();

  await guideTrigger.click();
  await guide.getByRole("button", { name: "Configure" }).click();
  const settings = page.locator(".ind-set");
  await expect(settings).toBeVisible();
  await expect(settings).toBeFocused();
  await expect(settings.locator("#indicator-settings-title")).toHaveText("Trend Engine");
  await page.keyboard.press("Escape");
  await expect(settings).toBeHidden();
});

test("a locked search result remains keyboard reachable through its guide action", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "The keyboard result fallback is viewport-independent.");
  await page.route("**/api/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ tier: "free", features: [], status: "none" }),
    });
  });

  const { library } = await openIndicatorLibrary(page);
  const search = library.getByRole("searchbox", { name: "Search indicators" });
  await search.fill("TP1");
  await expect(library.locator("[data-im-search-result]").first()).toContainText("Trend Engine");

  await search.press("ArrowDown");
  const lockedGuide = library.getByRole("button", { name: "Guide: Trend Engine" });
  await expect(lockedGuide).toBeFocused();
  await page.keyboard.press("Enter");

  const guide = page.getByRole("dialog", { name: "Trend Engine" });
  await expect(guide).toBeVisible();
  await expect(guide.getByRole("heading", { level: 1, name: "Trend Engine" })).toBeVisible();
});

test("indicator controls and guides honor reduced motion", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "The reduced-motion CSS contract is shared by every viewport.");
  await page.emulateMedia({ reducedMotion: "reduce" });
  const { library } = await openIndicatorLibrary(page);

  const volumeSwitch = library.getByRole("switch", { name: "Volume", exact: true });
  await expect(volumeSwitch).toBeVisible();
  await expect.poll(() =>
    volumeSwitch.locator(".im-state-switch-knob").evaluate(
      (element) => getComputedStyle(element).transitionDuration,
    ),
  ).toBe("0s");

  await library.getByRole("button", { name: /Trend Waves/ }).click();
  await library.getByRole("button", { name: "Guide: Trend Engine" }).click();
  const guide = page.locator(".gp-center");
  await expect(guide).toBeVisible({ timeout: 10_000 });
  await expect.poll(() =>
    guide.evaluate((element) => getComputedStyle(element).animationName),
  ).toBe("none");
  await expect.poll(() =>
    guide.locator(".gp-scroll").evaluate((element) => getComputedStyle(element).scrollBehavior),
  ).toBe("auto");
});
