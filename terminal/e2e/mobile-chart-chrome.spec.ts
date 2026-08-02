import { expect, test, type Page } from "@playwright/test";
import { DRAWING_TOOL_REGISTRY } from "../lib/drawingTools";

// Phone chart chrome (R2.1–R2.4): the bottom roller strip, the TV-anatomy Drawings sheet and the
// Analysis hub replace the phone's top toolbar row and its floating drawing dock. Everything here
// is gated on the PHONE breakpoint (≤640px, app/globals.css + lib/useMediaQuery.ts) — the last
// test proves the tablet and desktop projects are inert to all of it.

const PHONE_MAX = 640;
/** R2c: 46px, in flow at the foot of the chart column (was 51.7px pinned to the viewport). */
const STRIP_H = 46;

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
  // R2c — and the strip owns the interval alone: the in-chart range row is retired here, so the
  // phone never carries two interval controls.
  await expect(page.locator(".chart-frame-bar")).toBeHidden();

  const strip = page.getByTestId("roller-strip");
  await expect(strip).toBeVisible();
  const geom = await strip.evaluate((el) => {
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    const chart = document.querySelector(".chart-body")!.getBoundingClientRect();
    return {
      height: rect.height, top: rect.top, left: rect.left, width: rect.width,
      chartBottom: chart.bottom, vh: window.innerHeight, vw: window.innerWidth,
      background: style.backgroundColor, position: style.position, borderTop: style.borderTopWidth,
      appPadBottom: getComputedStyle(document.querySelector(".app")!).paddingBottom,
    };
  });
  // R2c — the strip rides at the FOOT OF THE CHART COLUMN, not pinned to the viewport: it takes
  // the seat the range row vacated, so the two read as one instrument.
  expect(geom.position).toBe("relative");
  expect(geom.top).toBeCloseTo(geom.chartBottom, 0);
  expect(geom.height).toBeCloseTo(STRIP_H, 0);
  expect(geom.left).toBe(0);
  expect(geom.width).toBeCloseTo(geom.vw, 0);
  expect(geom.background).toBe("rgb(0, 0, 0)");
  expect(parseFloat(geom.borderTop)).toBeCloseTo(1, 1);
  // Nothing is pinned any more, so the page owes the strip no reserved band.
  expect(parseFloat(geom.appPadBottom)).toBeCloseTo(0, 0);

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
  // Every presentation starts back at the 62% detent (geometry is its own test below).
  await expect(sheet).toHaveAttribute("data-detent", "initial");

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

test("phone: the Drawings sheet opens at 62% over a live chart and drags to full", async ({ page }) => {
  test.skip(!phone(page), "The Drawings sheet is the phone replacement for the dock.");
  await openTerminal(page);

  const SHEET = ".msheet.mdraw-sheet";
  await page.getByTestId("roller-draw").click();
  const sheet = page.locator(SHEET);
  await expect(sheet).toBeVisible();

  // TV presents Drawings at ~62% of the screen with the chart still drawing above it (IMG_2366);
  // apps/ios ships the same [.fraction(0.62), .large] pair.
  const ratio = () => sheet.evaluate((el) => el.getBoundingClientRect().height / window.innerHeight);
  await expect(sheet).toHaveAttribute("data-detent", "initial");
  expect(await ratio()).toBeCloseTo(0.62, 1);
  await expect(page.locator(".chart-wrap canvas").first()).toBeVisible();

  // …and the chart above stays CRISP: TV paints no dim and no blur over it at 62%. The scrim
  // element itself remains (it is the tap-outside dismiss target); only its paint is withheld
  // until the full detent.
  const scrimLook = () => page.locator(".msheet-scrim").evaluate((el) => {
    const cs = getComputedStyle(el);
    return { bg: cs.backgroundColor, blur: cs.backdropFilter };
  });
  expect(await scrimLook()).toEqual({ bg: "rgba(0, 0, 0, 0)", blur: "none" });

  // The tile grid scrolls INSIDE the sheet at both detents — the sheet never grows to fit it.
  await page.getByTestId("drawings-cat-tools").click();
  const gridScrolls = () => sheet.locator(".msheet-body")
    .evaluate((el) => el.scrollHeight > el.clientHeight + 1);
  expect(await gridScrolls()).toBe(true);

  // Both grips drag, and they keep working once the grid is scrolled — which it now is, because
  // focusing a category pill scrolls the body. A drag off the plain background is refused there,
  // exactly as it is on a scrolled hub.
  const GRABBER = `${SHEET} .msheet-handle-wrap`;
  const HEADER = `${SHEET} .msheet-title`;
  const drag = async (grip: string, dy: number) => {
    const box = (await page.locator(grip).boundingBox())!;
    await pointerDrag(page, grip, { x: box.x + box.width / 2, y: box.y + 2 }, dy);
  };

  // Grabber up expands to full…
  await drag(GRABBER, -260);
  await expect(sheet).toHaveAttribute("data-detent", "full");
  expect(await ratio()).toBeGreaterThan(0.9);
  expect(await gridScrolls()).toBe(true);
  // …where the dim (and only the dim — never a blur) arrives.
  await expect.poll(async () => (await scrimLook()).bg).toBe("rgba(5, 7, 11, 0.55)");

  // …header back down returns to 62%. The release point sits ~0.675 of the viewport and the
  // sheet ANIMATES to the detent from there, so poll for the resting height rather than racing
  // the 240ms snap.
  await drag(HEADER, 240);
  await expect(sheet).toHaveAttribute("data-detent", "initial");
  await expect.poll(ratio).toBeCloseTo(0.62, 1);
  await expect.poll(async () => (await scrimLook()).bg).toBe("rgba(0, 0, 0, 0)");

  // …and dragging down again from 62% dismisses.
  await drag(GRABBER, 200);
  await expect(sheet).toHaveCount(0);
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

  // Same scrim law as the Drawings sheet: the page above the half detent stays undimmed and
  // unblurred; the dim belongs to the full detent alone.
  const hubScrimLook = () => page.locator(".mhub-scrim").evaluate((el) => {
    const cs = getComputedStyle(el);
    return { bg: cs.backgroundColor, blur: cs.backdropFilter };
  });
  expect(await hubScrimLook()).toEqual({ bg: "rgba(0, 0, 0, 0)", blur: "none" });

  // Dragging the grabber up expands to full; dragging it back down returns to 60%.
  const grip = (await hub.locator(".mhub-grip").boundingBox())!;
  await pointerDrag(page, '[data-testid="analysis-hub"]', { x: grip.x + grip.width / 2, y: grip.y + 2 }, -260);
  await expect(hub).toHaveAttribute("data-detent", "full");
  expect(await ratio()).toBeGreaterThan(0.9);
  await expect.poll(async () => (await hubScrimLook()).bg).toBe("rgba(5, 7, 11, 0.55)");
  const gripFull = (await hub.locator(".mhub-grip").boundingBox())!;
  await pointerDrag(page, '[data-testid="analysis-hub"]', { x: gripFull.x + gripFull.width / 2, y: gripFull.y + 2 }, 240);
  await expect(hub).toHaveAttribute("data-detent", "half");
  await expect.poll(async () => (await hubScrimLook()).bg).toBe("rgba(0, 0, 0, 0)");

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

  // R2.3 — at rest the GOLDEN ORACLE / RESEARCH DESK row still clears the fold, so the chart
  // keeps the tallest band that leaves the verdicts readable without a scroll. R2c moved the
  // strip into the chart column, and the chart body gave up exactly its height, so the rail
  // below lands where it always did.
  const fold = await page.evaluate(() => window.innerHeight);
  const signals = (await page.locator(".detail-scroll .sig-btn").boundingBox())!;
  expect(signals.y + signals.height).toBeLessThanOrEqual(fold + 1);
  const trend = (await page.locator(".detail-scroll .trend-row").first().boundingBox())!;
  expect(trend.y).toBeGreaterThan(signals.y);

  // The strip persists in the expanded chart as the column's foot, and the canvas stops at its
  // top edge rather than hiding its own time axis underneath.
  await page.locator(".chart-fs-float").click();
  await expect(page.locator(".app.fs")).toHaveCount(1);
  await expect(page.getByTestId("roller-strip")).toBeVisible();
  const expanded = await page.evaluate(() => {
    const workspace = document.querySelector(".workspace")!.getBoundingClientRect();
    const body = document.querySelector(".chart-body")!.getBoundingClientRect();
    const strip = document.querySelector('[data-testid="roller-strip"]')!.getBoundingClientRect();
    return { chartToStrip: strip.top - body.bottom, stripToEdge: window.innerHeight - strip.bottom, filled: body.height / workspace.height };
  });
  expect(expanded.chartToStrip).toBeCloseTo(0, 0);
  expect(expanded.stripToEdge).toBeCloseTo(0, 0);
  // …and the expanded chart really does fill the workspace it was given.
  expect(expanded.filled).toBeGreaterThan(0.9);
});

test("phone: tapping the symbol wheel opens the ticker picker as a drawer", async ({ page }) => {
  test.skip(!phone(page), "R2c gives the phone the drawer; the tablet keeps the centred sheet.");
  await openTerminal(page);

  // TV's verb, and ours: the selected chamber IS the search button — there is no separate one.
  const wheel = (await page.getByTestId("roller-symbol").boundingBox())!;
  await page.touchscreen.tap(wheel.x + wheel.width / 2, wheel.y + wheel.height / 2);

  const drawer = page.locator(".msheet.msheet-search");
  await expect(drawer).toBeVisible();
  await expect(drawer).toHaveAttribute("data-detent", "initial");
  // The same 62% the Drawings sheet presents at — one drawer idiom on this phone…
  const ratio = () => drawer.evaluate((el) => el.getBoundingClientRect().height / window.innerHeight);
  expect(await ratio()).toBeCloseTo(0.62, 1);
  // …over a chart that stays live and undimmed beneath it.
  await expect(page.locator(".chart-wrap canvas").first()).toBeVisible();
  expect(await page.locator(".msheet-scrim").evaluate((el) => getComputedStyle(el).backgroundColor))
    .toBe("rgba(0, 0, 0, 0)");

  // Navigation, not a search: the field is present but was never focused, so no keyboard.
  await expect(drawer.getByPlaceholder("Symbol, ISIN, or CUSIP")).not.toBeFocused();
  await expect(drawer.locator(".s-home")).toBeVisible();

  // The BODY is the scroller, so a drag that starts on a row moves the sheet.
  const row = (await drawer.locator(".sres .r").first().boundingBox())!;
  await pointerDrag(page, ".msheet.msheet-search", { x: row.x + row.width * 0.4, y: row.y + 4 }, -240);
  await expect(drawer).toHaveAttribute("data-detent", "full");
  expect(await ratio()).toBeGreaterThan(0.9);

  // A short, quick flick down steps one detent back rather than needing a full-height drag.
  await pointerDrag(page, ".msheet.msheet-search", { x: 195, y: 120 }, 70);
  await expect(drawer).toHaveAttribute("data-detent", "initial");
  // The snap animates, and a drag reads the height it starts from — let it land first.
  await expect.poll(ratio).toBeCloseTo(0.62, 1);

  // …and the same short flick from the resting detent dismisses it.
  const GRABBER = ".msheet.msheet-search .msheet-handle-wrap";
  const grabber = (await page.locator(GRABBER).boundingBox())!;
  await pointerDrag(page, GRABBER, { x: grabber.x + grabber.width / 2, y: grabber.y + 2 }, 70);
  await expect(drawer).toHaveCount(0);

  // Picking a symbol from the drawer charts it and closes — the tap still lands even though the
  // row is also the drag surface.
  await page.touchscreen.tap(wheel.x + wheel.width / 2, wheel.y + wheel.height / 2);
  await expect(drawer).toBeVisible();
  await drawer.getByPlaceholder("Symbol, ISIN, or CUSIP").fill("AAPL");
  const hit = drawer.locator(".sres .r").first();
  await expect(hit.locator(".tk")).toHaveText("AAPL");
  await hit.click();
  await expect(drawer).toHaveCount(0);
  await expect(page.getByTestId("roller-symbol")).toHaveAttribute("aria-valuetext", "AAPL");
});

test("phone: the fullscreen control is the only expansion affordance", async ({ page }) => {
  test.skip(!phone(page), "R2c retires the per-pane strip on the phone only.");
  // `always` is the loudest the setting gets — if the per-pane maximize survives anywhere it
  // survives here, and a phone would then carry two expand buttons stacked over the canvas.
  await page.addInitScript(() => localStorage.setItem("mm.chartSettings", JSON.stringify({ paneButtons: "always" })));
  await openTerminal(page);

  await expect(page.locator(".chart-fs-float")).toBeVisible();
  const paneOps = page.locator(".pane-ops");
  for (let i = 0; i < await paneOps.count(); i += 1) await expect(paneOps.nth(i)).toBeHidden();

  // Double-tap remains the phone's maximize verb, so nothing was lost with the button: the price
  // pane swallows the sub-panes' band and a second double-tap hands it back.
  const priceBand = () => page.evaluate(() => Math.max(
    ...Array.from(document.querySelectorAll(".chart-wrap canvas")).map((c) => c.getBoundingClientRect().height)));
  const wrap = (await page.locator(".chart-wrap").first().boundingBox())!;
  const point = { x: wrap.x + wrap.width * 0.4, y: wrap.y + wrap.height * 0.3 };
  const doubleTap = async () => {
    await page.touchscreen.tap(point.x, point.y);
    await page.waitForTimeout(70);
    await page.touchscreen.tap(point.x, point.y);
  };
  const atRest = await priceBand();
  await doubleTap();
  await expect.poll(priceBand).toBeGreaterThan(atRest * 1.15);
  const maximized = await priceBand();
  await doubleTap();
  await expect.poll(priceBand).toBeLessThan(maximized * 0.85);
});

test("tablet and desktop never see the phone chrome", async ({ page }) => {
  test.skip(phone(page), "This is the scope law for the wider projects.");
  await openTerminal(page);
  // The range row and the per-pane controls are phone-only retirements.
  await expect(page.locator(".chart-frame-bar")).toBeVisible();

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
