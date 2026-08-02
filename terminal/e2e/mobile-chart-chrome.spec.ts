import { expect, test, type Page } from "@playwright/test";
import { DRAWING_TOOL_REGISTRY } from "../lib/drawingTools";

// Phone chart chrome (R2.1–R2.4): the bottom roller strip, the TV-anatomy Drawings sheet and the
// Analysis hub replace the phone's top toolbar row and its floating drawing dock. Everything here
// is gated on the PHONE breakpoint (≤640px, app/globals.css + lib/useMediaQuery.ts) — the last
// test proves the tablet and desktop projects are inert to all of it.

const PHONE_MAX = 640;
const STRIP_H = 51.7;

const phone = (page: Page) => (page.viewportSize()?.width ?? 1440) <= PHONE_MAX;

async function openTerminal(page: Page) {
  await page.addInitScript(() => {
    const ready = window as Window & { __mmPhoneReady?: boolean };
    ready.__mmPhoneReady = false;
    window.addEventListener("mm:terminal-visual-ready", () => { ready.__mmPhoneReady = true; }, { once: true });
  });
  await page.goto("/terminal?symbol=NVDA");
  await expect(page.locator(".chart-wrap canvas").first()).toBeVisible();
  await expect.poll(
    () => page.evaluate(() => Boolean((window as Window & { __mmPhoneReady?: boolean }).__mmPhoneReady)),
    { message: "the interactive Terminal should finish hydrating", timeout: 20_000 },
  ).toBe(true);
}

/** Pointer drags through dispatchEvent: deterministic in headless Chromium, and it is the same
 *  primary-pointer shape the components' capture handlers expect. */
async function pointerDrag(page: Page, target: string, from: { x: number; y: number }, dy: number, dx = 0) {
  const base = { pointerId: 11, pointerType: "touch", isPrimary: true, button: 0, buttons: 1 };
  const locator = page.locator(target);
  await locator.dispatchEvent("pointerdown", { ...base, clientX: from.x, clientY: from.y });
  for (const step of [0.35, 0.7, 1]) {
    await locator.dispatchEvent("pointermove", {
      ...base, clientX: from.x + dx * step, clientY: from.y + dy * step,
    });
  }
  await locator.dispatchEvent("pointerup", {
    ...base, buttons: 0, clientX: from.x + dx, clientY: from.y + dy,
  });
}

test("phone: the roller strip replaces the top toolbar row and the floating dock", async ({ page }) => {
  test.skip(!phone(page), "Phone chrome only — the tablet keeps the toolbar row and the dock.");
  await openTerminal(page);

  // R2.2 / R2.1 — the row and the dock are gone; the strip owns symbol, interval and tools.
  await expect(page.locator(".chart-tabs")).toBeHidden();
  await expect(page.locator(".ds-dock")).toBeHidden();
  await expect(page.locator(".ds-favorites")).toBeHidden();

  const strip = page.getByTestId("roller-strip");
  await expect(strip).toBeVisible();
  const geom = await strip.evaluate((el) => {
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return {
      height: rect.height, bottom: rect.bottom, left: rect.left,
      vh: window.innerHeight, vw: window.innerWidth,
      background: style.backgroundColor, position: style.position, borderTop: style.borderTopWidth,
    };
  });
  expect(geom.position).toBe("fixed");
  expect(geom.height).toBeCloseTo(STRIP_H, 0);
  expect(geom.bottom).toBeCloseTo(geom.vh, 0);
  expect(geom.left).toBe(0);
  expect(geom.background).toBe("rgb(0, 0, 0)");
  expect(parseFloat(geom.borderTop)).toBeCloseTo(1, 1);

  // Measured wheel geometry: symbol ink from 13.3px, 83.4px wide; interval 54px.
  const wheels = await page.evaluate(() => {
    const sym = document.querySelector('[data-testid="roller-symbol"]')!.getBoundingClientRect();
    const int = document.querySelector('[data-testid="roller-interval"]')!.getBoundingClientRect();
    const label = getComputedStyle(document.querySelector(".mrs-wheel-item")!);
    return { symLeft: sym.left, symWidth: sym.width, intWidth: int.width, size: parseFloat(label.fontSize), weight: label.fontWeight };
  });
  expect(wheels.symLeft).toBeCloseTo(13.3, 0);
  expect(wheels.symWidth).toBeCloseTo(83.4, 0);
  expect(wheels.intWidth).toBeCloseTo(54, 0);
  expect(wheels.size).toBeCloseTo(17, 0);
  expect(Number(wheels.weight)).toBeGreaterThanOrEqual(700);

  // The wheels carry the live state: the charted symbol and the starred timeframes.
  await expect(page.getByTestId("roller-symbol")).toHaveAttribute("aria-valuetext", "NVDA");
  expect(await page.getByTestId("roller-interval").locator(".mrs-wheel-item").allTextContents())
    .toEqual(["D", "3D", "W", "1M"]);

  // C25: the cluster scrolls under a leading fade and the anchored wheels never move with it.
  const before = (await page.getByTestId("roller-symbol").boundingBox())!.x;
  const scrolled = await page.getByTestId("roller-cluster").evaluate((el) => {
    el.scrollLeft = el.scrollWidth;
    return { left: el.scrollLeft, overflow: getComputedStyle(el).overflowX, mask: getComputedStyle(el).maskImage };
  });
  expect(scrolled.overflow).toBe("auto");
  expect(scrolled.mask).toContain("gradient");
  expect((await page.getByTestId("roller-symbol").boundingBox())!.x).toBeCloseTo(before, 1);

  // Every cluster control is a ≥44px touch target even though the ink box is TV's 28px.
  const targets = await page.locator(".mrs-ic").evaluateAll((elements) => elements.map((el) => {
    const box = el.getBoundingClientRect();
    const hit = getComputedStyle(el, "::before");
    return { w: box.width + 2 * Math.abs(parseFloat(hit.left)), h: box.height + 2 * Math.abs(parseFloat(hit.top)) };
  }));
  expect(targets.length).toBe(5);
  for (const target of targets) expect(target.h).toBeGreaterThanOrEqual(44);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("phone: rolling the interval wheel commits the timeframe live", async ({ page }) => {
  test.skip(!phone(page), "The wheels exist only on the phone strip.");
  await openTerminal(page);

  const wheel = page.getByTestId("roller-interval");
  await expect(wheel).toHaveAttribute("aria-valuetext", "3D");
  const box = (await wheel.boundingBox())!;
  // One detent DOWN the wheel is the PREVIOUS favourite — the value commits per step, not on release.
  await pointerDrag(page, '[data-testid="roller-interval"]', { x: box.x + box.width / 2, y: box.y + box.height / 2 }, 23);
  await expect(wheel).toHaveAttribute("aria-valuetext", "D");
});

test("phone: the pencil opens the TV Drawings sheet and a tile arms the tool", async ({ page }) => {
  test.skip(!phone(page), "The Drawings sheet is the phone replacement for the dock.");
  await openTerminal(page);

  await page.getByTestId("roller-draw").click();
  const sheet = page.getByRole("dialog", { name: "Drawings" });
  await expect(sheet).toBeVisible();
  // Anatomy: title + circled close, search pill, five category pills, 3-column tile grid.
  await expect(sheet.locator(".msheet-title")).toHaveText("Drawings");
  await expect(page.getByTestId("drawings-sheet-close")).toBeVisible();
  await expect(page.getByTestId("drawings-sheet-search")).toBeVisible();
  await expect(sheet.locator(".mdraw-cat")).toHaveCount(5);
  expect(await sheet.locator(".mdraw-grid").evaluate((el) =>
    getComputedStyle(el).gridTemplateColumns.split(" ").length)).toBe(3);
  const sheetHeight = await sheet.evaluate((el) => el.getBoundingClientRect().height / window.innerHeight);
  expect(sheetHeight).toBeGreaterThan(0.8);

  // Content is OUR registry, mapped into TV's taxonomy — no invented tiles, nothing dropped.
  const lines = DRAWING_TOOL_REGISTRY.find((group) => group.id === "lines")!.tools.map((tool) => tool.id);
  expect(await sheet.locator(".mdraw-tile").evaluateAll((elements) =>
    elements.map((el) => el.getAttribute("data-tool-id")))).toEqual(lines);
  await page.getByTestId("drawings-cat-patterns").click();
  const patterns = DRAWING_TOOL_REGISTRY.find((group) => group.id === "patterns")!.tools.map((tool) => tool.id);
  expect(await sheet.locator(".mdraw-tile").evaluateAll((elements) =>
    elements.map((el) => el.getAttribute("data-tool-id")))).toEqual(patterns);

  // Search filters the tiles live, across every tab.
  await page.getByTestId("drawings-sheet-search").fill("horizontal ray");
  await expect(sheet.locator(".mdraw-tile")).toHaveCount(1);
  await expect(page.getByTestId("drawings-tile-horizontalray")).toBeVisible();
  await page.getByTestId("drawings-sheet-search").fill("");

  // Selecting a tile arms the tool through the dock's own path, closes the sheet, records a recent.
  await page.getByTestId("drawings-cat-trendlines").click();
  await page.getByTestId("drawings-tile-trendline").click();
  await expect(sheet).toBeHidden();
  await expect(page.getByTestId("drawing-group-lines-main")).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("mm.drawRecents") || "[]")))
    .toEqual(["trendline"]);

  // …and that recent is what the Favorites tab shows on the next presentation.
  await page.getByTestId("roller-draw").click();
  await page.getByTestId("drawings-cat-favorites").click();
  await expect(page.getByTestId("drawings-tile-trendline")).toBeVisible();
  await expect(sheet.locator(".mdraw-tile")).toHaveCount(1);
  await page.getByTestId("drawings-sheet-close").click();
  await expect(sheet).toBeHidden();
});

test("phone: ••• opens the analysis hub at 60% and drags to full", async ({ page }) => {
  test.skip(!phone(page), "The hub is the phone's replacement for the toolbar controls.");
  await openTerminal(page);

  // The badge rides the ••• until the hub has been opened once.
  await expect(page.getByTestId("roller-more-badge")).toBeVisible();
  await page.getByTestId("roller-more").click();
  const hub = page.getByTestId("analysis-hub");
  await expect(hub).toBeVisible();
  await expect(hub).toHaveAttribute("data-detent", "half");
  expect(await page.evaluate(() => localStorage.getItem("mm.hubSeen"))).toBe("1");
  await expect(page.getByTestId("roller-more-badge")).toHaveCount(0);

  const ratio = async () => hub.evaluate((el) => el.getBoundingClientRect().height / window.innerHeight);
  expect(await ratio()).toBeCloseTo(0.6, 1);
  // No broker CTA anywhere in the hub — ours never sells an execution venue.
  await expect(hub.getByText(/broker/i)).toHaveCount(0);

  // Dragging the grabber up expands to full; dragging it back down returns to 60%.
  const grip = (await hub.locator(".mhub-grip").boundingBox())!;
  await pointerDrag(page, '[data-testid="analysis-hub"]', { x: grip.x + grip.width / 2, y: grip.y + 2 }, -260);
  await expect(hub).toHaveAttribute("data-detent", "full");
  expect(await ratio()).toBeGreaterThan(0.9);
  const gripFull = (await hub.locator(".mhub-grip").boundingBox())!;
  await pointerDrag(page, '[data-testid="analysis-hub"]', { x: gripFull.x + gripFull.width / 2, y: gripFull.y + 2 }, 240);
  await expect(hub).toHaveAttribute("data-detent", "half");

  // Indicators is REAL: the hub dismisses and the web's own library opens.
  await page.getByTestId("hub-tile-indicators").click();
  await expect(hub).toHaveCount(0);
  await expect(page.locator("#indicator-library-dialog")).toBeVisible();
  await page.keyboard.press("Escape");

  // …so is Compare.
  await page.getByTestId("roller-more").click();
  await page.getByTestId("hub-tile-compare").click();
  await expect(page.locator(".smodal-cmp")).toBeVisible();
  await page.keyboard.press("Escape");

  // The ghosts are marked, not silently dead.
  await page.getByTestId("roller-more").click();
  await expect(page.getByTestId("hub-tile-objectTree")).toHaveAttribute("aria-disabled", "true");
  await expect(page.getByTestId("hub-tile-objectTree")).toContainText("Not in this alpha");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("analysis-hub")).toHaveCount(0);
});

test("phone: the fold sits under the oracle cards and the strip survives the expanded chart", async ({ page }) => {
  test.skip(!phone(page), "The fold rule is a phone-viewport contract.");
  await openTerminal(page);

  // R2.3 — at rest the GOLDEN ORACLE / RESEARCH DESK row is visible above the strip and TREND
  // is below the fold, so the chart keeps the tallest possible band.
  const fold = await page.evaluate(() => window.innerHeight - 51.7);
  const signals = (await page.locator(".detail-scroll .sig-btn").boundingBox())!;
  expect(signals.y + signals.height).toBeLessThanOrEqual(fold + 1);
  const trend = (await page.locator(".detail-scroll .trend-row").first().boundingBox())!;
  expect(trend.y).toBeGreaterThanOrEqual(fold - 1);

  // The strip persists in the expanded chart, and the chart stops short of it rather than
  // hiding its own time axis underneath.
  await page.locator(".chart-fs-float").click();
  await expect(page.locator(".app.fs")).toHaveCount(1);
  await expect(page.getByTestId("roller-strip")).toBeVisible();
  const clearance = await page.evaluate(() => {
    const workspace = document.querySelector(".workspace")!.getBoundingClientRect();
    const strip = document.querySelector('[data-testid="roller-strip"]')!.getBoundingClientRect();
    return strip.top - workspace.bottom;
  });
  expect(clearance).toBeGreaterThanOrEqual(-1);
});

test("tablet and desktop never see the phone chrome", async ({ page }) => {
  test.skip(phone(page), "This is the scope law for the wider projects.");
  await openTerminal(page);

  await expect(page.getByTestId("roller-strip")).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "Drawings" })).toHaveCount(0);
  await expect(page.getByTestId("analysis-hub")).toHaveCount(0);
  // …and the surfaces the phone replaced are exactly where they were.
  await expect(page.locator(".chart-tabs")).toBeVisible();
  await expect(page.locator(".tfbtn-edit")).toBeVisible();
  await expect(page.locator(".indicator-library-trigger")).toBeVisible();
  await expect(page.getByTestId("drawing-toolbar")).toBeVisible();
  expect(await page.evaluate(() => getComputedStyle(document.querySelector(".app")!).paddingBottom))
    .toBe("0px");
});
