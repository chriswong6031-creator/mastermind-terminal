import { test, expect } from "@playwright/test";

// Native shell mode (?shell=app): the WebView surface the installable apps load.
// Chrome (topbar, mobile bar, nav rail, watchlist rail, movers ticker) must be gone,
// the chart must fill the single grid cell, and the window.__mmShell bridge must
// drive symbol/timeframe through the existing product seams.
// Runs in every viewport project (desktop / tablet / mobile) like responsive.spec.ts.

const SHELL_URL = "/terminal?symbol=NVDA&shell=app";
const TRAY_URL = "/terminal?symbol=NVDA&shell=app&tray=1";
const DOSSIER_URL = "/terminal?symbol=NVDA&shell=app&dossier=1";
const WEB_URL = "/terminal?symbol=NVDA";

test.describe("native shell mode", () => {
  test("chart-only chrome, working bridge, no overflow", async ({ page }) => {
    await page.goto(SHELL_URL);

    // Marker the deploy verification greps for (SSR'd, since shellMode is a server prop).
    // D0 added a SECOND marker on <html> (pre-paint, so CSS-variable rethemes are visible to
    // ChartPanel.readTokens) — the SSR'd .app marker is asserted explicitly here.
    await expect(page.locator('.app[data-shell="app"]')).toHaveCount(1);
    await expect(page.locator('html[data-shell="app"]')).toHaveCount(1);

    // Global chrome is absent from the DOM entirely (not merely display:none).
    await expect(page.locator("header.topbar")).toHaveCount(0);
    await expect(page.locator(".mobilebar")).toHaveCount(0);
    await expect(page.locator(".m-symbar")).toHaveCount(0);
    await expect(page.locator("nav.appnav")).toHaveCount(0);
    await expect(page.locator("aside.rail")).toHaveCount(0);
    await expect(page.locator(".ticker")).toHaveCount(0);

    // The chart itself still mounts and renders.
    await expect(page.locator(".workspace canvas").first()).toBeVisible({ timeout: 45_000 });

    // The native roller strip owns interval switching — the toolbar TF quick tray is hidden.
    await expect(page.locator(".chart-tabs .tftray")).toBeHidden();

    // Drawing tools cede chart real estate in shell mode; the native pencil re-enables
    // them via setDrawTools → the .shell-draw class.
    await expect(page.locator(".ds-dock")).toBeHidden();
    await expect(page.locator(".ds-favorites")).toBeHidden();
    await page.waitForFunction(() => (window as any).__mmShell?.version === 1);
    await page.evaluate(() => (window as any).__mmShell.setDrawTools(true));
    await expect(page.locator(".app.shell-draw")).toHaveCount(1);
    await page.evaluate(() => (window as any).__mmShell.setDrawTools(false));
    await expect(page.locator(".app.shell-draw")).toHaveCount(0);

    // The chart fills the frame — the mobile 46–80svh cap must not apply in shell mode
    // (a shell WebView has no scrolling page below the chart).
    // Raised 0.8 → 0.97 by the TV chart-surface parity wave: D1 floats the toolbar row onto the
    // canvas and D8 floats the frame bar, returning 72.3pt (~8.7%) of chart height to the plot.
    const chartFill = await page.evaluate(() => {
      const body = document.querySelector(".chart-body");
      return body ? body.getBoundingClientRect().height / window.innerHeight : 0;
    });
    expect(chartFill).toBeGreaterThan(0.97);

    // No horizontal document overflow at any project viewport.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);

    // Bridge installed with the contract surface.
    await page.waitForFunction(() => (window as any).__mmShell?.version === 1);
    const tfs = await page.evaluate(() => {
      // ready() already posted; re-derive the advertised list from the API for the assertion.
      const api = (window as any).__mmShell;
      return { hasGetState: typeof api.getState === "function", sym: api.getState().sym };
    });
    expect(tfs.hasGetState).toBe(true);
    expect(tfs.sym).toBe("NVDA");

    // Native → web commands ride the existing seams and update live state.
    await page.evaluate(() => (window as any).__mmShell.setSymbol("AAPL"));
    await page.waitForFunction(() => (window as any).__mmShell.getState().sym === "AAPL");
    await page.evaluate(() => (window as any).__mmShell.setTimeframe("D"));
    await page.waitForFunction(() => (window as any).__mmShell.getState().tf === "D");
  });

  test("shell tray=1 keeps the TF tray for the embedded preview chart", async ({ page }) => {
    await page.goto(TRAY_URL);
    // .app carries the SSR'd marker; <html> carries D0's pre-paint twin.
    await expect(page.locator('.app[data-tray="1"]')).toHaveCount(1);
    await expect(page.locator('html[data-tray="1"]')).toHaveCount(1);
    await expect(page.locator(".chart-tabs .tftray")).toBeVisible();
    // Drawing tools stay hidden even with the tray enabled.
    await expect(page.locator(".ds-favorites")).toBeHidden();
  });

  test("embed widget hdr=0 hides the quote line, keeps range tabs", async ({ page }) => {
    await page.goto("/embed/chart?symbol=NVDA&hdr=0");
    await expect(page.locator(".embed-ranges")).toBeVisible();
    await expect(page.locator(".embed-head-quote")).toBeHidden();
    // Without the param the quote line stays (dossier iframes unchanged).
    await page.goto("/embed/chart?symbol=NVDA");
    await expect(page.locator(".embed-head-quote")).toBeVisible();
  });

  // ── TV symbol-sheet mini chart (docs/tv-parity/spec-symbol-detail.md §2B) ──────────
  test("embed clean=1 is candles-only with TV chips; fs=1 adds the fullscreen affordance", async ({ page }) => {
    await page.goto("/embed/chart?symbol=NVDA&clean=1&fs=1&hdr=0");

    // Root marker — every clean-mode CSS rule hangs off it.
    await expect(page.locator('.embed-root[data-clean="1"]')).toHaveCount(1);
    // Candles only: no SMA series ⇒ no SMA legend to drive them.
    await expect(page.locator(".embed-legend")).toHaveCount(0);
    // The range row survives and gains the ⤢ square (a browser tap is a silent no-op).
    await expect(page.locator(".embed-ranges")).toBeVisible();
    const fs = page.locator(".embed-fs");
    await expect(fs).toBeVisible();
    const fsBox = await fs.boundingBox();
    expect(fsBox!.width).toBeGreaterThanOrEqual(30);
    expect(fsBox!.height).toBeGreaterThanOrEqual(30);
    await fs.click(); // must not throw / navigate without a native host
    await expect(page.locator('.embed-root[data-clean="1"]')).toHaveCount(1);

    // Chips wear the measured TV capsule treatment (selected #2E2E2E on #DBDBDB).
    const active = page.locator(".embed-chip.is-active").first();
    const chip = await active.evaluate((el) => {
      const s = getComputedStyle(el);
      return { bg: s.backgroundColor, color: s.color, weight: s.fontWeight, size: parseFloat(s.fontSize) };
    });
    expect(chip.bg).toBe("rgb(46, 46, 46)");
    expect(chip.color).toBe("rgb(219, 219, 219)");
    expect(Number(chip.weight)).toBeGreaterThanOrEqual(600);
    expect(chip.size).toBeGreaterThanOrEqual(13);
    expect(chip.size).toBeLessThanOrEqual(14);
    const idle = await page.locator(".embed-chip:not(.is-active)").first().evaluate((el) => {
      const s = getComputedStyle(el);
      return { bg: s.backgroundColor, color: s.color };
    });
    expect(idle.bg).toBe("rgba(0, 0, 0, 0)");
    expect(idle.color).toBe("rgb(140, 140, 140)");

    // Web parity: without ?clean the widget is untouched — SMA legend back, no fs button,
    // no marker, and the chips keep their house styling.
    await page.goto("/embed/chart?symbol=NVDA");
    await expect(page.locator("[data-clean]")).toHaveCount(0);
    await expect(page.locator(".embed-fs")).toHaveCount(0);
    await expect(page.locator(".embed-legend")).toBeVisible({ timeout: 30_000 });
    const webChip = await page.locator(".embed-chip.is-active").first().evaluate((el) => {
      const s = getComputedStyle(el);
      return { color: s.color, size: parseFloat(s.fontSize) };
    });
    expect(webChip.size).toBeCloseTo(11, 0);
    expect(webChip.color).not.toBe("rgb(219, 219, 219)");
  });

  // ── dossier mode: the detail rail is the whole page, no chart workspace ────────────
  test("shell dossier=1 renders the detail rail as the only content", async ({ page }) => {
    await page.goto(DOSSIER_URL);

    await expect(page.locator('[data-dossier="1"]')).toHaveCount(1);
    // The chart workspace is absent from the DOM entirely — the native sheet owns the chart.
    await expect(page.locator(".workspace")).toHaveCount(0);
    // …and the rail, which plain shell mode drops, is here and visible.
    const rail = page.locator("aside.rail");
    await expect(rail).toBeVisible();
    await expect(page.locator(".detail-board")).toBeVisible();
    // Watchlist board + resizer stay out at every viewport (the native list owns them).
    await expect(page.locator(".rail .wl-board")).toBeHidden();
    await expect(page.locator(".rail-resizer")).toHaveCount(0);
    // Still no global web chrome.
    await expect(page.locator("header.topbar")).toHaveCount(0);
    await expect(page.locator(".mobilebar")).toHaveCount(0);
    await expect(page.locator(".ticker")).toHaveCount(0);

    // The rail is ordinary full-width block flow, not a fixed-width grid column.
    const geom = await page.evaluate(() => {
      const r = document.querySelector("aside.rail") as HTMLElement;
      const s = getComputedStyle(r);
      return { display: s.display, w: r.getBoundingClientRect().width, vw: window.innerWidth };
    });
    expect(geom.display).toBe("block");
    expect(geom.w).toBeCloseTo(geom.vw, 0);

    // The page scrolls naturally: nothing traps the dossier in an inner scroller, and the
    // document is at least a full viewport tall (min-height:100svh, no 100svh LOCK).
    const scroll = await page.evaluate(() => ({
      rail: getComputedStyle(document.querySelector("aside.rail")!).overflow,
      inner: getComputedStyle(document.querySelector(".detail-scroll")!).overflow,
      docH: document.documentElement.scrollHeight,
      vh: window.innerHeight,
    }));
    expect(scroll.rail).toBe("visible");
    expect(scroll.inner).toBe("visible");
    expect(scroll.docH).toBeGreaterThanOrEqual(scroll.vh);
    // …with no horizontal document overflow at any project viewport.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);

    // The bridge still installs and answers without a chart on the page.
    await page.waitForFunction(() => (window as any).__mmShell?.version === 1);
    expect(await page.evaluate(() => (window as any).__mmShell.getState().sym)).toBe("NVDA");

    // Scope law: dossier is inert without the param — plain shell keeps chart-only chrome.
    await page.goto(SHELL_URL);
    await expect(page.locator("[data-dossier]")).toHaveCount(0);
    await expect(page.locator("aside.rail")).toHaveCount(0);
    await expect(page.locator(".workspace")).toHaveCount(1);
    // …and the browser web app never sees it either.
    await page.goto(WEB_URL);
    await expect(page.locator("[data-dossier]")).toHaveCount(0);
    await expect(page.locator(".workspace")).toHaveCount(1);
    await expect(page.locator("aside.rail")).toHaveCount(1);
  });

  test("normal mode is untouched", async ({ page }) => {
    await page.goto("/terminal?symbol=NVDA");
    // Chrome present in the DOM (viewport CSS decides visibility)…
    await expect(page.locator(".mobilebar")).toHaveCount(1);
    await expect(page.locator("nav.appnav")).toHaveCount(1);
    await expect(page.locator('[data-shell="app"]')).toHaveCount(0);
    // …and no bridge is installed outside shell mode.
    const hasBridge = await page.evaluate(() => "__mmShell" in window && (window as any).__mmShell != null);
    expect(hasBridge).toBe(false);
  });
});

// ── TV chart-surface parity (docs/tv-parity CHART_SURFACE_DELTA_SPEC, D0–D12) ──────────
// Every rule under test is scoped to html[data-shell="app"]; the final test re-asserts the
// scope law (the browser web app must be inert to all of it).
test.describe("TV chart-surface parity (shell)", () => {
  const chartReady = async (page: import("@playwright/test").Page) => {
    await expect(page.locator(".workspace canvas").first()).toBeVisible({ timeout: 45_000 });
  };

  // The production CSS pipeline minifies custom-property VALUES (rgba(255,255,255,.055) ships as
  // #ffffff0e), so a raw getPropertyValue string comparison is a build-detail assertion. Resolve
  // the token through a probe element instead and compare the actual rendered color.
  const resolveToken = (page: import("@playwright/test").Page, name: string) =>
    page.evaluate((n) => {
      const d = document.createElement("div");
      d.style.color = `var(${n})`;
      document.body.appendChild(d);
      const c = getComputedStyle(d).color;
      d.remove();
      const m = c.match(/[\d.]+/g)!.map(Number);
      return { r: m[0], g: m[1], b: m[2], a: m.length > 3 ? m[3] : 1 };
    }, name);

  // A. Root marker + token plumbing (guards D0/D6 — the silent-failure mode).
  test("A · root marker is set pre-paint and the chart tokens are retuned", async ({ page }) => {
    await page.goto(SHELL_URL);
    await expect(page.locator("html[data-shell='app']")).toHaveCount(1);
    const tok = await page.evaluate(() => {
      const g = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
      return { up: g("--up"), down: g("--down"), axis: g("--chart-axis-text") };
    });
    expect(tok.up).toBe("#089981");
    expect(tok.down).toBe("#f23645");
    expect(tok.axis).toBe("#b1b5be");
    const grid = await resolveToken(page, "--chart-grid");
    expect([grid.r, grid.g, grid.b]).toEqual([255, 255, 255]);
    expect(grid.a).toBeCloseTo(0.055, 2);
    // web must NOT be retouched
    await page.goto(WEB_URL);
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--up").trim())).toBe("#26c281");
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--chart-axis-text").trim())).toBe("#717a8e");
    const webGrid = await resolveToken(page, "--chart-grid");
    expect([webGrid.r, webGrid.g, webGrid.b]).toEqual([255, 255, 255]);
    expect(webGrid.a).toBeCloseTo(0.04, 2);
  });

  // B. Toolbar row is gone from the flow, controls survive (D1).
  test("B · the web toolbar row leaves the flow, its controls float on the canvas", async ({ page }) => {
    await page.goto(SHELL_URL);
    await chartReady(page);
    const tabs = page.locator(".chart-tabs");
    expect(await tabs.evaluate((el) => getComputedStyle(el).position)).toBe("absolute");
    await expect(page.locator(".chart-tabs .ct")).toBeHidden();
    await expect(page.locator(".chart-tabs .indicator-library-trigger")).toBeVisible();
    // no chart height is consumed above the canvas
    const wrapTop = await page.locator(".chart-wrap").first().evaluate((el) => el.getBoundingClientRect().top);
    expect(wrapTop).toBeLessThanOrEqual(2);
    // + Indicators is the app's ONLY indicator-management entry — it must still open the library.
    await page.locator(".chart-tabs .indicator-library-trigger").click();
    await expect(page.locator("#indicator-library-dialog")).toBeVisible();
  });

  // C. Chart reclaims both bands (D1 + D8).
  test("C · the chart reclaims the toolbar and range bands", async ({ page }) => {
    await page.goto(SHELL_URL);
    await chartReady(page);
    const fill = await page.evaluate(() => {
      const b = document.querySelector(".chart-body")!.getBoundingClientRect();
      return b.height / window.innerHeight;
    });
    expect(fill).toBeGreaterThan(0.97);
    expect(await page.locator(".chart-frame-bar").evaluate((el) => getComputedStyle(el).position)).toBe("absolute");
    await expect(page.locator(".cfb-left")).toBeHidden();
    await expect(page.locator(".cfb-clock")).toBeHidden();
    await expect(page.locator(".cfb-gear")).toBeVisible();
  });

  // D. Header is two rows, nothing clips (D2).
  test("D · identity/quote header stacks into two rows and never clips", async ({ page }) => {
    await page.goto(SHELL_URL);
    await chartReady(page);
    const col = page.locator(".statusline > span").first();
    expect(await col.evaluate((el) => getComputedStyle(el).flexDirection)).toBe("column");
    await expect(page.locator(".status-ohlc")).toBeHidden();
    await expect(page.locator(".status-last")).toBeVisible();
    const nameSize = await page.locator(".status-symbol-name").evaluate((el) => getComputedStyle(el).fontSize);
    expect(parseFloat(nameSize)).toBeCloseTo(17, 0);
    // no element in the header may cross the viewport edge
    const rightMost = await page.evaluate(() => Math.max(
      ...[...document.querySelectorAll(".statusline *")].map((e) => e.getBoundingClientRect().right)));
    expect(rightMost).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
  });

  // E. Legend chip + rows (D3 + D4).
  test("E · legend chip is an outlined ghost pill and the rows lose their plate", async ({ page }) => {
    await page.goto(SHELL_URL);
    await chartReady(page);
    const chip = page.locator(".lg-collapse").first();
    await expect(chip).toBeVisible();
    const cs = await chip.evaluate((el) => {
      const s = getComputedStyle(el);
      return { bg: s.backgroundColor, bw: s.borderTopWidth, bc: s.borderTopColor, h: s.height, top: el.getBoundingClientRect().top };
    });
    expect(cs.bg).toBe("rgba(0, 0, 0, 0)");
    expect(cs.bw).toBe("1px");
    expect(cs.bc).toBe("rgb(61, 61, 61)");
    expect(parseFloat(cs.h)).toBeCloseTo(26, 0);
    expect(cs.top).toBeGreaterThan(50);            // clears the two-row header
    const row = page.locator(".lg-row").first();
    if (!(await row.isVisible())) await chip.click();   // expand when the legend starts collapsed
    await expect(row).toBeVisible();
    // plate killed despite the inline style attribute
    expect(await row.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
    expect(await page.locator(".lg-name").first().evaluate((el) => getComputedStyle(el).color)).toBe("rgb(177, 181, 190)");
  });

  // F. Axis chips carry no series-name pill (D5).
  test("F · axis value pills carry no series-name chip", async ({ page }) => {
    await page.goto(SHELL_URL);
    await chartReady(page);
    // LWC renders axis labels on canvas — assert at the option layer via the dev-only hook.
    await expect.poll(
      async () => (await page.evaluate(() => (window as any).__mmChartSeriesTitles?.() ?? [])).length,
      { timeout: 45_000 },
    ).toBeGreaterThan(0);
    const titles: string[] = await page.evaluate(() => (window as any).__mmChartSeriesTitles());
    expect(titles.every((t) => t === "")).toBe(true);
    // …and the same hook proves the web app still ships its titles (the assertion is not vacuous).
    await page.goto(WEB_URL);
    await chartReady(page);
    await expect.poll(
      async () => (await page.evaluate(() => (window as any).__mmChartSeriesTitles?.() ?? [])).filter((t: string) => t !== "").length,
      { timeout: 45_000 },
    ).toBeGreaterThan(0);
  });

  // G. Price badge is single-line (D9).
  test("G · the last-price axis badge is a single line", async ({ page }) => {
    await page.goto(SHELL_URL);
    await chartReady(page);
    const tag = page.locator(".mm-ptag");
    await expect(tag).toBeVisible({ timeout: 45_000 });
    await expect(page.locator(".mm-ptag-cd")).toBeHidden();
    const tagH = await tag.evaluate((el) => el.getBoundingClientRect().height);
    expect(tagH).toBeGreaterThan(0);
    expect(tagH).toBeLessThanOrEqual(20);          // TV measures 17pt
  });

  // H. Tray mode: no crowding, no duplicate identity (D11).
  test("H · tray mode fits every control and drops the duplicated identity", async ({ page }) => {
    await page.goto(TRAY_URL);
    await chartReady(page);
    await expect(page.locator(".chart-tabs .tftray")).toBeVisible();
    await expect(page.locator(".statusline > span").first()).toBeHidden();
    // every toolbar control is inside the viewport — nothing clipped, no scroll needed
    const overflowPx = await page.locator(".chart-tabs").evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(overflowPx).toBeLessThanOrEqual(0);
    const vw = await page.evaluate(() => window.innerWidth);
    for (const sel of [".chart-tabs .indicator-library-trigger", ".chart-tabs .tbtn.dtm"]) {
      const r = await page.locator(sel).evaluate((el) => el.getBoundingClientRect().right);
      expect(r).toBeLessThanOrEqual(vw);
    }
  });

  // I. Web-parity guard (the scope law).
  test("I · every parity rule is inert without ?shell=app", async ({ page }) => {
    await page.goto(WEB_URL);
    await chartReady(page);
    expect(await page.locator(".chart-tabs").evaluate((el) => getComputedStyle(el).position)).not.toBe("absolute");
    await expect(page.locator(".chart-tabs .ct")).toBeVisible();
    await expect(page.locator(".cfb-left")).toBeVisible();
    await expect(page.locator(".status-last")).toBeHidden();
    await expect(page.locator(".chart-frame-bar")).toBeVisible();
    expect(await page.locator(".chart-frame-bar").evaluate((el) => getComputedStyle(el).position)).toBe("relative");
    const chip = page.locator(".lg-collapse").first();
    expect(await chip.evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe("1px");
    expect(await chip.evaluate((el) => getComputedStyle(el).borderTopColor)).toBe("rgba(0, 0, 0, 0)");
    // D12's quieter pane separator must not reach the web app either
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--pane-sep").trim())).toBe("#39404d");
  });
});
