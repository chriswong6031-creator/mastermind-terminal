import { expect, test, type Locator, type Page } from "@playwright/test";

// Allows this suite to target an already-running same-worktree server when another
// local Next process owns the shared dev lock. The repository Playwright config
// remains the default in CI and normal `npm run test:e2e:responsive` runs.
const externalViewportMatch = process.env.DRAWING_E2E_VIEWPORT?.match(/^(\d+)x(\d+)$/);
if (process.env.DRAWING_E2E_BASE_URL || externalViewportMatch) {
  test.use({
    ...(process.env.DRAWING_E2E_BASE_URL
      ? { baseURL: process.env.DRAWING_E2E_BASE_URL }
      : {}),
    ...(externalViewportMatch
      ? {
          viewport: {
            width: Number(externalViewportMatch[1]),
            height: Number(externalViewportMatch[2]),
          },
        }
      : {}),
  });
}

const TOOL_GROUPS = {
  lines: [
    "trendline",
    "ray",
    "extendedline",
    "hline",
    "horizontalray",
    "vline",
    "crossline",
    "arrow",
    "channel",
  ],
  fibonacci: ["fib"],
  shapes: ["rect", "ellipse", "triangle", "path"],
  patterns: ["xabcd"],
  annotation: ["text"],
  measurement: ["measure", "pricerange", "daterange"],
  forecasting: ["longposition", "shortposition"],
} as const;

const CHART_TYPES = [
  "Candles",
  "Hollow candles",
  "Heikin Ashi",
  "Bars",
  "Line",
  "Line with markers",
  "Step line",
  "Area",
  "Baseline",
] as const;

type DrawingSavePayload = {
  drawings?: Array<{ id?: string; kind?: string; color?: string; points?: unknown[] }>;
};

async function openTerminal(
  page: Page,
  options: { drawings?: unknown[]; onPut?: (payload: DrawingSavePayload) => void } = {},
) {
  await page.route("**/api/drawings**", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ drawings: options.drawings ?? [] }),
      });
      return;
    }
    try { options.onPut?.(route.request().postDataJSON()); } catch {}
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });
  await page.addInitScript(() => {
    localStorage.removeItem("mm.ct");
    localStorage.removeItem("mm.draw");
    localStorage.removeItem("mm.drawing.preferences");
    const readyWindow = window as Window & { __mmDrawingSystemReady?: boolean };
    readyWindow.__mmDrawingSystemReady = false;
    window.addEventListener("mm:terminal-visual-ready", () => {
      readyWindow.__mmDrawingSystemReady = true;
    }, { once: true });
  });
  await page.goto("/terminal?symbol=NVDA");
  await expect(page.locator(".chart-wrap canvas").first()).toBeVisible();
  await expect.poll(
    () => page.evaluate(() =>
      Boolean((window as Window & { __mmDrawingSystemReady?: boolean }).__mmDrawingSystemReady)),
    { message: "the interactive Terminal should finish hydrating", timeout: 15_000 },
  ).toBe(true);
  await expect(page.locator(".pane.on .drawing-layer")).toBeVisible();
}

async function selectMagnet(page: Page, mode: "off" | "weak" | "strong") {
  const trigger = page.getByTestId("drawing-magnet-trigger");
  await trigger.click();
  const menu = page.getByTestId("drawing-magnet-menu");
  await expect(menu).toBeVisible();
  await menu.getByTestId(`drawing-magnet-${mode}`).click();
  await expect(menu).toBeHidden();
  await expect(trigger).toHaveAttribute("data-magnet-mode", mode);
}

function chartTypeButton(catalog: Locator, name: string): Locator {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return catalog.getByRole("button", { name: new RegExp(`^${escapedName}(?: ✓)?$`) });
}

async function dragDrawing(
  page: Page,
  layer: Locator,
  start: { x: number; y: number },
  end: { x: number; y: number },
) {
  const box = await layer.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width * start.x, box!.y + box!.height * start.y);
  await page.mouse.down();
  await page.mouse.move(
    box!.x + box!.width * end.x,
    box!.y + box!.height * end.y,
    { steps: 8 },
  );
  await page.mouse.up();
}

test("drawing registry and precision controls stay complete at every responsive width", async ({ page }) => {
  await openTerminal(page);

  const toolbar = page.getByTestId("drawing-toolbar");
  await expect(toolbar).toBeVisible();
  await expect(toolbar).toHaveAttribute("role", "toolbar");
  await expect(toolbar).toHaveAttribute("aria-label", "Drawing tools");

  for (const [group, expectedTools] of Object.entries(TOOL_GROUPS)) {
    const trigger = page.getByTestId(`drawing-group-${group}-menu-trigger`);
    await trigger.click();
    const menu = page.getByTestId(`drawing-group-${group}-menu`);
    await expect(menu).toBeVisible();
    await expect(menu).toHaveAttribute("role", "menu");
    await expect.poll(
      () => menu.locator("[data-tool-id]").evaluateAll((elements) =>
        elements.map((element) => element.getAttribute("data-tool-id"))),
      { message: `${group} should expose the canonical drawing registry in order` },
    ).toEqual([...expectedTools]);
    if (group === "lines" && page.viewportSize()?.width === 390) {
      const fit = await menu.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return {
          isDockSibling: element.parentElement?.classList.contains("chart-body") === true
            && !document.querySelector("[data-testid='drawing-toolbar']")?.contains(element),
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
        };
      });
      expect(fit.isDockSibling).toBe(true);
      expect(fit.left).toBeGreaterThanOrEqual(0);
      expect(fit.top).toBeGreaterThanOrEqual(0);
      expect(fit.right).toBeLessThanOrEqual(fit.viewportWidth);
      expect(fit.bottom).toBeLessThanOrEqual(fit.viewportHeight);
    }
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(trigger).toBeFocused();
  }

  const magnetTrigger = page.getByTestId("drawing-magnet-trigger");
  await expect(magnetTrigger).toHaveAttribute("data-magnet-mode", "off");
  await selectMagnet(page, "weak");
  await selectMagnet(page, "strong");
  await selectMagnet(page, "off");

  const lineTool = page.getByTestId("drawing-group-lines-main");
  await lineTool.click();
  await expect(lineTool).toHaveAttribute("data-tool-id", "trendline");
  await expect(lineTool).toHaveAttribute("aria-pressed", "true");

  const palette = page.getByTestId("drawing-style-palette");
  await expect(palette).toBeVisible();
  if ((page.viewportSize()?.width ?? 1440) <= 860) {
    const linesTrigger = page.getByTestId("drawing-group-lines-menu-trigger");
    const linesMenu = page.getByTestId("drawing-group-lines-menu");
    const nextLogicalControl = page.getByTestId("drawing-group-fibonacci-main");

    await linesTrigger.click();
    await expect(linesMenu).toBeVisible();
    await expect(page.getByTestId("drawing-tool-trendline")).toBeFocused();
    expect(await linesMenu.evaluate((element) =>
      !document.querySelector("[data-testid='drawing-toolbar']")?.contains(element))).toBe(true);
    await expect(palette).toHaveAttribute("inert", "");
    await expect(palette).toHaveAttribute("aria-hidden", "true");

    await page.keyboard.press("Tab");
    await expect(linesMenu).toBeHidden();
    await expect(nextLogicalControl).toBeFocused();
    await expect(palette).not.toHaveAttribute("inert", "");
    await expect(palette).not.toHaveAttribute("aria-hidden", "true");

    await linesTrigger.click();
    await expect(linesMenu).toBeVisible();
    await expect(page.getByTestId("drawing-tool-trendline")).toBeFocused();
    await expect(palette).toHaveAttribute("inert", "");
    await expect(palette).toHaveAttribute("aria-hidden", "true");

    await page.keyboard.press("Shift+Tab");
    await expect(linesMenu).toBeHidden();
    await expect(lineTool).toBeFocused();
    await expect(palette).not.toHaveAttribute("inert", "");
    await expect(palette).not.toHaveAttribute("aria-hidden", "true");
  }
  if (page.viewportSize()?.width === 390) {
    const fit = await palette.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        isDockSibling: element.parentElement?.classList.contains("chart-body") === true
          && !document.querySelector("[data-testid='drawing-toolbar']")?.contains(element),
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      };
    });
    expect(fit.isDockSibling).toBe(true);
    expect(fit.left).toBeGreaterThanOrEqual(0);
    expect(fit.top).toBeGreaterThanOrEqual(0);
    expect(fit.right).toBeLessThanOrEqual(fit.viewportWidth);
    expect(fit.bottom).toBeLessThanOrEqual(fit.viewportHeight);
  }
  const red = page.getByTestId("drawing-style-color-2");
  const wide = page.getByTestId("drawing-style-width-4");
  const dotted = page.getByTestId("drawing-style-dash-dotted");
  await red.click();
  await wide.click();
  await dotted.click();
  await expect(red).toHaveAttribute("aria-pressed", "true");
  await expect(wide).toHaveAttribute("aria-pressed", "true");
  await expect(dotted).toHaveAttribute("aria-pressed", "true");

  await page.getByTestId("drawing-tool-cursor").click();
  await expect(page.getByTestId("drawing-tool-cursor")).toHaveAttribute("aria-pressed", "true");
  await expect(palette).toBeHidden();
});

test("chart-type catalog exposes and applies the new line and area families", async ({ page }) => {
  await openTerminal(page);

  const popover = page.locator(".chart-type-pop");
  const host = page.locator(".pophost").filter({ has: popover });
  const trigger = host.locator(":scope > button.tbtn");
  await trigger.click();

  const desktop = (page.viewportSize()?.width ?? 1440) > 860;
  const catalog = desktop
    ? popover
    : page.getByRole("dialog", { name: "Chart type" });
  await expect(catalog).toBeVisible();
  for (const chartType of CHART_TYPES) {
    await expect(chartTypeButton(catalog, chartType)).toBeVisible();
  }

  await chartTypeButton(catalog, "Line with markers").click();
  await expect(catalog).toBeHidden();
  await expect(trigger).toContainText("Line with markers");
  await expect(page.locator(".chart-wrap canvas").first()).toBeVisible();

  await trigger.click();
  const reopenedCatalog = desktop
    ? popover
    : page.getByRole("dialog", { name: "Chart type" });
  await expect(reopenedCatalog).toBeVisible();
  await chartTypeButton(reopenedCatalog, "Baseline").click();
  await expect(reopenedCatalog).toBeHidden();
  await expect(trigger).toContainText("Baseline");
  await expect(page.locator(".chart-wrap canvas").first()).toBeVisible();
});

test("drawing lifecycle supports one-shot, sticky, history, visibility, and scoped clear", async ({ page }) => {
  test.skip(
    (page.viewportSize()?.width ?? 1440) <= 860,
    "Pointer lifecycle is covered once on the stable desktop canvas.",
  );
  await openTerminal(page);

  const layer = page.locator(".pane.on .drawing-layer");
  const trendlines = layer.locator('g[data-drawing-kind="trendline"]');
  const lineTool = page.getByTestId("drawing-group-lines-main");
  const cursor = page.getByTestId("drawing-tool-cursor");
  const sticky = page.getByTestId("drawing-sticky-toggle");

  // Secondary mouse input must never create or consume a one-shot tool.
  await page.getByTestId("drawing-group-lines-menu-trigger").click();
  await page.getByTestId("drawing-tool-hline").click();
  await expect(lineTool).toHaveAttribute("data-tool-id", "hline");
  await expect(lineTool).toHaveAttribute("aria-pressed", "true");
  const rightClickBox = await layer.boundingBox();
  expect(rightClickBox).not.toBeNull();
  await layer.dispatchEvent("pointerdown", {
    bubbles: true,
    cancelable: true,
    composed: true,
    pointerId: 73,
    pointerType: "mouse",
    isPrimary: true,
    button: 2,
    buttons: 2,
    clientX: rightClickBox!.x + rightClickBox!.width * 0.5,
    clientY: rightClickBox!.y + rightClickBox!.height * 0.5,
  });
  await expect(layer.locator('g[data-drawing-kind="hline"]')).toHaveCount(0);
  await expect(lineTool).toHaveAttribute("aria-pressed", "true");
  await cursor.click();
  await page.getByTestId("drawing-group-lines-menu-trigger").click();
  await page.getByTestId("drawing-tool-trendline").press("Enter");
  await expect(lineTool).toHaveAttribute("data-tool-id", "trendline");

  await expect(trendlines).toHaveCount(0);
  await lineTool.click();
  await page.getByTestId("drawing-style-color-2").click();
  await page.getByTestId("drawing-style-width-4").click();
  await page.getByTestId("drawing-style-dash-dotted").click();
  await dragDrawing(page, layer, { x: 0.24, y: 0.34 }, { x: 0.58, y: 0.56 });

  await expect(trendlines).toHaveCount(1);
  await expect(cursor).toHaveAttribute("aria-pressed", "true");
  await expect(lineTool).toHaveAttribute("aria-pressed", "false");
  await expect(sticky).toHaveAttribute("data-sticky", "false");

  const trendline = trendlines.first();
  const visibleStroke = trendline.locator('line:not([stroke="transparent"])').first();
  await expect(visibleStroke).toHaveAttribute("stroke", "#f0566b");
  await expect(visibleStroke).toHaveAttribute("stroke-dasharray", "2 4");
  await expect.poll(
    () => visibleStroke.getAttribute("stroke-width").then((width) => Number(width)),
  ).toBeGreaterThanOrEqual(4);

  const selectionToolbar = page.getByRole("toolbar", { name: "Selected drawing properties" });
  await expect(selectionToolbar).toBeVisible();
  await expect(selectionToolbar.locator("[data-custom-color]")).toBeVisible();
  await expect(selectionToolbar.locator("[data-lock]")).toBeVisible();
  await expect(selectionToolbar.locator("[data-duplicate]")).toBeVisible();
  await expect(selectionToolbar.locator("[data-settings]")).toBeVisible();
  await selectionToolbar.locator("[data-settings]").click();
  await expect(selectionToolbar.locator(".draw-settings")).toBeVisible();
  await selectionToolbar.locator("[data-settings]").click();
  await expect(selectionToolbar.locator(".draw-settings")).toBeHidden();

  const hitStroke = trendline.locator('line[stroke="transparent"]').first();
  const lineGeometry = () => visibleStroke.evaluate((element) =>
    ["x1", "y1", "x2", "y2"].map((attribute) => element.getAttribute(attribute)).join(","));
  const geometryBeforeCancel = await lineGeometry();
  const dragOrigin = await hitStroke.evaluate((element) => {
    const line = element as SVGLineElement;
    const svgRect = line.ownerSVGElement!.getBoundingClientRect();
    const x1 = Number(line.getAttribute("x1"));
    const y1 = Number(line.getAttribute("y1"));
    const x2 = Number(line.getAttribute("x2"));
    const y2 = Number(line.getAttribute("y2"));
    return {
      x: svgRect.left + (x1 + x2) / 2,
      y: svgRect.top + (y1 + y2) / 2,
    };
  });
  const cancelPointerId = 91;
  await hitStroke.dispatchEvent("pointerdown", {
    bubbles: true,
    cancelable: true,
    composed: true,
    pointerId: cancelPointerId,
    pointerType: "mouse",
    isPrimary: true,
    button: 0,
    buttons: 1,
    clientX: dragOrigin.x,
    clientY: dragOrigin.y,
  });
  await page.evaluate(({ pointerId, x, y }) => {
    window.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId,
      pointerType: "mouse",
      isPrimary: true,
      button: 0,
      buttons: 1,
      clientX: x + 84,
      clientY: y + 36,
    }));
  }, { pointerId: cancelPointerId, ...dragOrigin });
  await expect.poll(lineGeometry, {
    message: "a selected drawing should preview its translated geometry during drag",
  }).not.toBe(geometryBeforeCancel);
  await page.evaluate(({ pointerId, x, y }) => {
    window.dispatchEvent(new PointerEvent("pointercancel", {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId,
      pointerType: "mouse",
      isPrimary: true,
      button: 0,
      buttons: 0,
      clientX: x + 84,
      clientY: y + 36,
    }));
  }, { pointerId: cancelPointerId, ...dragOrigin });
  await expect.poll(lineGeometry, {
    message: "pointercancel should restore the selected drawing's committed geometry",
  }).toBe(geometryBeforeCancel);

  const undo = page.getByTestId("drawing-undo");
  const redo = page.getByTestId("drawing-redo");
  await expect(undo).toBeEnabled();
  // A single undo must remove the original creation. If pointercancel had committed
  // the translated state, this undo would merely restore the original geometry.
  await undo.click();
  await expect(trendlines).toHaveCount(0);
  await expect(redo).toBeEnabled();
  await redo.click();
  await expect(trendlines).toHaveCount(1);

  const visibility = page.getByTestId("drawing-visibility-toggle");
  await visibility.click();
  await expect(visibility).toHaveAttribute("data-drawings-visible", "false");
  await expect(trendlines).toHaveCount(0);
  await visibility.click();
  await expect(visibility).toHaveAttribute("data-drawings-visible", "true");
  await expect(trendlines).toHaveCount(1);

  await lineTool.dblclick();
  await expect(sticky).toHaveAttribute("data-sticky", "true");
  await expect(lineTool).toHaveAttribute("aria-pressed", "true");
  await dragDrawing(page, layer, { x: 0.32, y: 0.62 }, { x: 0.69, y: 0.40 });
  await expect(trendlines).toHaveCount(2);
  await expect(lineTool).toHaveAttribute("aria-pressed", "true");
  await cursor.click();

  const shapesTrigger = page.getByTestId("drawing-group-shapes-menu-trigger");
  await shapesTrigger.click();
  const shapesMenu = page.getByTestId("drawing-group-shapes-menu");
  await expect(shapesMenu).toBeVisible();
  await page.getByTestId("drawing-tool-triangle").press("Enter");
  await expect(shapesMenu).toBeHidden();
  const shapeTool = page.getByTestId("drawing-group-shapes-main");
  await expect(shapeTool).toHaveAttribute("data-tool-id", "triangle");
  await expect(shapeTool).toHaveAttribute("aria-pressed", "true");

  const layerBox = await layer.boundingBox();
  expect(layerBox).not.toBeNull();
  await page.mouse.click(
    layerBox!.x + layerBox!.width * 0.42,
    layerBox!.y + layerBox!.height * 0.32,
  );
  await page.mouse.move(
    layerBox!.x + layerBox!.width * 0.57,
    layerBox!.y + layerBox!.height * 0.48,
  );
  const trianglePreview = layer.locator('g[data-id="_p"][data-drawing-kind="triangle"]');
  const committedTriangles = layer.locator(
    'g[data-drawing-kind="triangle"]:not([data-id="_p"])',
  );
  await expect(trianglePreview).toHaveCount(1);
  await expect(committedTriangles).toHaveCount(0);

  await lineTool.click();
  await expect(lineTool).toHaveAttribute("aria-pressed", "true");
  await expect(trianglePreview).toHaveCount(0);
  await expect(committedTriangles).toHaveCount(0);
  await cursor.click();

  const detect = page.getByRole("button", { name: /^Detect/ });
  await detect.click();
  await page.locator(".pop.show .menu-row").filter({ hasText: "Auto Fibonacci" }).click();
  const detectedFib = layer.locator('g[data-drawing-kind="fib"]');
  await expect(detectedFib).toHaveCount(1);

  const clearTrigger = page.getByTestId("drawing-clear-trigger");
  await clearTrigger.click();
  await page.getByTestId("drawing-clear-user").click();
  await expect(trendlines).toHaveCount(0);
  await expect(detectedFib).toHaveCount(1);

  await clearTrigger.click();
  await page.getByTestId("drawing-clear-detected").click();
  await expect(detectedFib).toHaveCount(0);
});

test("flagship geometry, editing, and path limits survive adversarial interaction", async ({ page }) => {
  test.skip(
    (page.viewportSize()?.width ?? 1440) <= 860,
    "Dense pointer geometry is exercised once on the stable desktop canvas.",
  );
  const saves: DrawingSavePayload[] = [];
  await openTerminal(page, {
    drawings: [
      { id: "vertical-contract", kind: "extendedline", source: "user", points: [{ t: "2026-06-12", p: 196 }, { t: "2026-06-12", p: 208 }], color: "#4d82ff", width: 2, dash: "solid" },
      { id: "text-contract", kind: "text", source: "user", points: [{ t: "2026-06-15", p: 204 }], color: "#4d82ff", text: "EDITME", fontSize: 16 },
      { id: "rigid-contract", kind: "trendline", source: "user", points: [{ t: "2026-06-18", p: 198 }, { t: "2026-06-25", p: 207 }], color: "#26c281", width: 2, dash: "solid" },
      { id: "fib-contract", kind: "fib", source: "user", points: [{ t: "2026-05-20", p: 176 }, { t: "2026-06-17", p: 210 }], color: "#4d82ff", width: 1.5, dash: "solid", fillOpacity: 0.07 },
    ],
    onPut: (payload) => saves.push(payload),
  });

  const layer = page.locator(".pane.on .drawing-layer");
  const layerBox = await layer.boundingBox();
  expect(layerBox).not.toBeNull();

  const vertical = layer.locator('g[data-id="vertical-contract"] line:not([stroke="transparent"])').first();
  // A mathematically vertical SVG line has a zero-width bounding box, so
  // Playwright correctly considers it non-visible even while it is rendered.
  await expect(vertical).toHaveCount(1);
  const verticalExtent = await vertical.evaluate((node) => {
    const line = node as SVGLineElement;
    return {
      y1: Number(line.getAttribute("y1")),
      y2: Number(line.getAttribute("y2")),
      height: line.ownerSVGElement!.getBoundingClientRect().height,
    };
  });
  expect(Math.min(verticalExtent.y1, verticalExtent.y2)).toBeCloseTo(0, 1);
  expect(Math.max(verticalExtent.y1, verticalExtent.y2)).toBeCloseTo(verticalExtent.height, 1);

  const text = layer.locator('g[data-id="text-contract"] text');
  await text.dblclick();
  await expect(page.locator(".text-edit")).toBeVisible();
  await page.locator(".text-edit").press("Escape");

  const fib = layer.locator('g[data-id="fib-contract"]');
  const fibHit = fib.locator('line:not([stroke="transparent"])').first();
  await fibHit.dispatchEvent("pointerdown", { bubbles: true, pointerId: 201, pointerType: "mouse", isPrimary: true, button: 0, buttons: 1, clientX: 240, clientY: 240 });
  await fibHit.dispatchEvent("pointerup", { bubbles: true, pointerId: 201, pointerType: "mouse", isPrimary: true, button: 0, buttons: 0, clientX: 240, clientY: 240 });
  const inspector = page.getByRole("toolbar", { name: "Selected drawing properties" });
  await expect(inspector).toBeVisible();
  await expect(inspector).toHaveAttribute("data-drawing-id", "fib-contract");
  await inspector.locator('[data-w="4"]').click();
  await inspector.locator('[data-dash="dotted"]').click();
  const fibLevel = fib.locator("line").first();
  await expect(fibLevel).toHaveAttribute("stroke-dasharray", "2 4");
  await expect.poll(() => fibLevel.getAttribute("stroke-width").then(Number)).toBeGreaterThanOrEqual(4);
  const fill = inspector.locator('[data-fill-opacity="1"]');
  await fill.evaluate((input: HTMLInputElement) => {
    input.value = "30";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(fib.locator("rect").first()).toHaveAttribute("fill-opacity", "0.3");

  const customColor = inspector.locator('[data-custom-color="1"]');
  await customColor.evaluate((input: HTMLInputElement) => {
    input.value = "#ff00ff";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  // A live language/quote rerender between native input and change must not
  // replace the inspector's draft with the last committed prop snapshot.
  await page.evaluate(() => {
    document.documentElement.setAttribute("data-lang", "zh");
    window.dispatchEvent(new CustomEvent("mm:lang"));
  });
  await page.waitForTimeout(100);
  await expect.poll(() => customColor.evaluate((input) => input.isConnected)).toBe(true);
  await customColor.dispatchEvent("change");
  await expect.poll(
    () => saves.some((payload) => payload.drawings?.some((drawing) => drawing.id === "fib-contract" && drawing.color === "#ff00ff")),
    { timeout: 5_000, message: "the custom color should reach durable persistence" },
  ).toBe(true);
  await page.evaluate(() => {
    document.documentElement.setAttribute("data-lang", "en");
    window.dispatchEvent(new CustomEvent("mm:lang"));
  });

  const rigid = layer.locator('g[data-id="rigid-contract"]');
  const rigidLine = rigid.locator('line:not([stroke="transparent"])').first();
  const rigidHit = rigid.locator('line[stroke="transparent"]').first();
  const span = () => rigidLine.evaluate((line) => Math.abs(Number(line.getAttribute("x2")) - Number(line.getAttribute("x1"))));
  const midpoint = () => rigidLine.evaluate((line) => (Number(line.getAttribute("x2")) + Number(line.getAttribute("x1"))) / 2);
  const spanBefore = await span();
  const midpointBefore = await midpoint();
  const rigidOrigin = await rigidHit.evaluate((node) => {
    const line = node as SVGLineElement;
    const svgRect = line.ownerSVGElement!.getBoundingClientRect();
    return {
      x: svgRect.left + (Number(line.getAttribute("x1")) + Number(line.getAttribute("x2"))) / 2,
      y: svgRect.top + (Number(line.getAttribute("y1")) + Number(line.getAttribute("y2"))) / 2,
    };
  });
  await rigidHit.dispatchEvent("pointerdown", { bubbles: true, pointerId: 301, pointerType: "mouse", isPrimary: true, button: 0, buttons: 1, clientX: rigidOrigin.x, clientY: rigidOrigin.y });
  await page.evaluate(({ x, y }) => window.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 301, pointerType: "mouse", isPrimary: true, button: 0, buttons: 1, clientX: x + 500, clientY: y })), rigidOrigin);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("mm:lang")));
  await page.waitForTimeout(50);
  await page.evaluate(({ x, y }) => window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 301, pointerType: "mouse", isPrimary: true, button: 0, buttons: 0, clientX: x + 500, clientY: y })), rigidOrigin);
  await expect.poll(span).toBeCloseTo(spanBefore, 0);
  await expect.poll(() => midpoint().then((value) => Math.abs(value - midpointBefore))).toBeGreaterThan(2);

  await page.getByTestId("drawing-group-shapes-menu-trigger").click();
  await page.getByTestId("drawing-tool-path").press("Enter");
  await page.mouse.move(layerBox!.x + layerBox!.width * .15, layerBox!.y + layerBox!.height * .35);
  await page.mouse.down();
  await page.mouse.move(layerBox!.x + layerBox!.width * .82, layerBox!.y + layerBox!.height * .62, { steps: 100 });
  await page.mouse.up();
  const path = layer.locator('g[data-drawing-kind="path"]').last();
  await expect(path).toBeVisible();
  await expect(path.locator("polyline")).toHaveCount(2);
  await expect(path.locator('line[data-segment="1"]')).toHaveCount(0);
  await expect.poll(
    () => saves.flatMap((payload) => payload.drawings ?? []).find((drawing) => drawing.kind === "path")?.points?.length ?? 0,
    { timeout: 5_000, message: "a dense path should persist within the registry/API limit" },
  ).toBeGreaterThan(1);
  const savedPath = saves.flatMap((payload) => payload.drawings ?? []).find((drawing) => drawing.kind === "path");
  expect(savedPath?.points?.length).toBeLessThanOrEqual(64);

  await page.getByTestId("drawing-group-shapes-menu-trigger").click();
  await page.getByTestId("drawing-tool-triangle").press("Enter");
  const triangleTool = page.getByTestId("drawing-group-shapes-main");
  const point = (x: number, y: number) => ({ clientX: layerBox!.x + layerBox!.width * x, clientY: layerBox!.y + layerBox!.height * y });
  const canceledFirst = point(.25, .25);
  await layer.dispatchEvent("pointerdown", { bubbles: true, pointerId: 401, pointerType: "touch", isPrimary: true, button: 0, buttons: 1, ...canceledFirst });
  await layer.dispatchEvent("pointercancel", { bubbles: true, pointerId: 401, pointerType: "touch", isPrimary: true, button: 0, buttons: 0, ...canceledFirst });
  await expect(layer.locator('g[data-id="_p"][data-drawing-kind="triangle"]')).toHaveCount(0);
  await page.mouse.click(point(.32, .32).clientX, point(.32, .32).clientY);
  await page.mouse.click(point(.48, .46).clientX, point(.48, .46).clientY);
  const canceledFinal = point(.65, .30);
  await layer.dispatchEvent("pointerdown", { bubbles: true, pointerId: 402, pointerType: "touch", isPrimary: true, button: 0, buttons: 1, ...canceledFinal });
  await layer.dispatchEvent("pointercancel", { bubbles: true, pointerId: 402, pointerType: "touch", isPrimary: true, button: 0, buttons: 0, ...canceledFinal });
  await expect(layer.locator('g[data-drawing-kind="triangle"]:not([data-id="_p"])')).toHaveCount(0);
  await expect(triangleTool).toHaveAttribute("aria-pressed", "true");
});

test("dense collections save beyond Chromium's keepalive request quota", async ({ page }) => {
  test.skip(
    (page.viewportSize()?.width ?? 1440) <= 860,
    "The persistence transport boundary only needs one stable desktop proof.",
  );
  const densePaths = Array.from({ length: 32 }, (_, drawingIndex) => ({
    id: `dense-path-${drawingIndex}`,
    kind: "path",
    source: "user",
    color: "#4d82ff",
    width: 2.5,
    dash: "dotted",
    points: Array.from({ length: 64 }, (_, pointIndex) => ({
      t: `2026-${String(1 + Math.floor(pointIndex / 28)).padStart(2, "0")}-${String(1 + (pointIndex % 28)).padStart(2, "0")}`,
      p: 150.123456789 + drawingIndex * 0.137 + pointIndex * 0.019,
    })),
  }));
  const saves: DrawingSavePayload[] = [];
  await openTerminal(page, { drawings: densePaths, onPut: (payload) => saves.push(payload) });

  await page.getByTestId("drawing-group-lines-menu-trigger").click();
  await page.getByTestId("drawing-tool-hline").press("Enter");
  const layer = page.locator(".pane.on .drawing-layer");
  const box = await layer.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box!.x + box!.width * 0.55, box!.y + box!.height * 0.45);

  await expect.poll(() => saves.length, {
    timeout: 5_000,
    message: "a payload above the browser keepalive quota should reach the API",
  }).toBeGreaterThan(0);
  expect(JSON.stringify(saves.at(-1)).length).toBeGreaterThan(65_536);
});

test("the drawing cap rejects object 501 without evicting object 1", async ({ page }) => {
  test.skip(
    (page.viewportSize()?.width ?? 1440) <= 860,
    "The collection ceiling only needs one stable desktop proof.",
  );
  const drawings = Array.from({ length: 500 }, (_, index) => ({
    id: `limit-line-${index}`,
    kind: "hline",
    source: "user",
    points: [{ t: "2026-06-12", p: 80 + index * 0.2 }],
    color: "#4d82ff",
    width: 1.5,
    dash: "solid",
  }));
  const saves: DrawingSavePayload[] = [];
  await openTerminal(page, { drawings, onPut: (payload) => saves.push(payload) });

  await page.getByTestId("drawing-group-lines-menu-trigger").click();
  await page.getByTestId("drawing-tool-hline").press("Enter");
  const layer = page.locator(".pane.on .drawing-layer");
  const box = await layer.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box!.x + box!.width * 0.55, box!.y + box!.height * 0.45);

  await expect(page.locator('.undo-toast[role="alert"]').filter({ hasText: "500 drawing limit reached" })).toBeVisible();
  await expect(layer.locator('g[data-id="limit-line-0"]')).toHaveCount(1);
  await expect(layer.locator('g[data-drawing-kind="hline"]:not([data-id="_p"])')).toHaveCount(500);
  await page.waitForTimeout(800);
  expect(saves).toHaveLength(0);
});

test("account drawing loads fail closed and retry without issuing a destructive save", async ({ page }) => {
  let getCount = 0;
  let putCount = 0;
  await page.route("**/api/drawings**", async (route) => {
    if (route.request().method() === "GET") {
      getCount += 1;
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ drawings: [], error: "fixture outage" }),
      });
      return;
    }
    putCount += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });
  await page.addInitScript(() => {
    localStorage.removeItem("mm.draw");
    localStorage.removeItem("mm.drawing.preferences");
  });
  await page.goto("/terminal?symbol=NVDA");
  await expect(page.locator(".chart-wrap canvas").first()).toBeVisible();

  const lineTool = page.getByTestId("drawing-group-lines-main");
  await lineTool.click();
  await expect(lineTool).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByText(/Saved drawings could not be loaded/)).toContainText("Drawing changes are paused");

  await expect.poll(() => getCount, {
    message: "a failed authoritative drawing load should retry",
    timeout: 5_000,
  }).toBeGreaterThanOrEqual(2);
  await page.waitForTimeout(750);
  expect(putCount).toBe(0);
});
