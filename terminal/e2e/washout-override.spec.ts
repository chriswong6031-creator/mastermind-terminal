import { test, expect, type Page } from "@playwright/test";

// Hydration gate, same shape as responsive.spec.ts (the helpers are per-spec there).
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

// Washout override candidate — the display class on a REFUSED entry.
//
// Ratified 2026-08-10 at the 25% notch (Macro Dashboard
// research/BLOCKED_ENTRY_RATIFICATION_PACKET_2026-08-10.md §2/§4; prereg §5/§7). A
// `regime_blocked` ⊘ whose thematic-basket peers sat ≥25% below their 252d highs the day it
// fired is promoted VISUALLY — amber marker, one disclosure line on the amber card — and in
// no other way. The entry mask, the keeper verdict, the tier, the score and the backtest are
// untouched, and this suite exists to keep it that way: every assertion below is either
// "the refusal still reads as a refusal" or "the disclosure says the honest thing".
//
// Live in-cohort exemplar the fixture is shaped on: UEC 2026-08-03, `uranium_miners`
// peer-dd −38.8%, admitted at every threshold on both the study and production feeds.
//
// NOTE ON THEMES: the Terminal ships ONE theme (dark) — `terminal/app/settings.css` documents
// it, and neither globals.css nor fin.css carries a `[data-theme]` branch. Both LANGUAGES are
// covered here (zh rides the tablet project, matching responsive.spec.ts).

/** A synthetic daily OHLC series ending on the most recent weekday.
 *
 *  Required, not decorative: ChartPanel drops any slice signal dated after the last bar, and
 *  the rail card only grants a refusal full authority inside the 21-day staleness window — so
 *  a fixture fire recent enough for the CARD is newer than the committed COST bars and would
 *  never reach the CHART. Synthesising the price series is what lets one fixture prove both,
 *  and taking the signal dates FROM the series is what stops the suite from going red every
 *  time the calendar hands it a weekend (a hardcoded "2 days ago" is a scheduled failure).
 */
function ohlcFixture(days = 420) {
  const bars: [string, number, number, number, number, number][] = [];
  const start = Date.now() - days * 86_400_000;
  let px = 18;
  for (let i = 0; i < days; i++) {
    const d = new Date(start + i * 86_400_000);
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;   // weekdays only
    // a long slide into a washout, so the tape under the refusal reads like the real case
    px = Math.max(6, px * (1 - 0.0016) + Math.sin(i / 9) * 0.09);
    bars.push([d.toISOString().slice(0, 10), +(px * 1.004).toFixed(2), +(px * 1.012).toFixed(2),
               +(px * 0.988).toFixed(2), +px.toFixed(2), 1_500_000]);
  }
  return { t: "COST", o: 1, src: "e2e-fixture", bar_quality: "real_ohlc", bars };
}

const OHLC = ohlcFixture();
const BAR_DATES = OHLC.bars.map((b) => b[0]);
/** the refused entry: the newest bar on the chart, and comfortably inside the 21-day window */
const BLOCKED_TS = BAR_DATES[BAR_DATES.length - 1];
/** the older structure stop it sits behind (~4 weeks back) */
const SELL_TS = BAR_DATES[BAR_DATES.length - 21];

const OVERRIDE_CTX = {
  group_id: "uranium_miners",
  peer_dd: -0.388,
  basis: "basket",
  thresholds_hit: [20, 25, 30],
  as_of: BLOCKED_TS,
  name: "Uranium miners",
  name_zh: "铀矿商",
};

function sliceFixture(opts: { override: boolean }) {
  const sellTs = SELL_TS;
  const blockedTs = BLOCKED_TS;
  return {
    slice: {
      indicator: {
        state: {
          position_hint: "flat",
          last_signal: "BUY",
          last_scored_signal: "SELL",
          last_scored_ts: sellTs,
          last_scored_basis: "structure_stop",
          strong_bull: false,
          overbought: false,
          weeklyBull: false,
          above200: false,
        },
        signals: [
          {
            ts: sellTs, known_ts: sellTs, bar_index: 400, type: "SELL", price: 14.2,
            basis: "structure_stop", stop_level: 15.05,
            reasons: ["distribution_confirmed", "structure_break"],
          },
          {
            // still typed BUY on purpose — `blocked`/`quality` are the render keys
            ts: blockedTs, known_ts: blockedTs, bar_index: 424, type: "BUY", price: 10.5,
            quality: "regime_blocked", blocked: true, tier: null, score: null,
            quality_reason: "bear_block: monthly-bear & below-200 & 2W-not-bull",
            ...(opts.override ? { override_candidate: true, override_ctx: OVERRIDE_CTX } : {}),
          },
        ],
        early_dots: [],
        warnings: [],
      },
      backtest: { metrics: { n_trades: 22, win_rate: 0.34, profit_factor: 1.6, cagr: 0.11 } },
    },
    blockedTs,
  };
}

async function openTerminal(page: Page, opts: { override: boolean; zh: boolean }) {
  const { slice, blockedTs } = sliceFixture({ override: opts.override });
  await page.route(/\/data\/COST\.json(?:\?.*)?$/, async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(OHLC) });
  });
  await page.route(/\/data\/COST\.slice\.json(?:\?.*)?$/, async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(slice) });
  });
  // Golden Oracle markers are an OPT-IN study (TerminalShell item-28) — seed the saved
  // indicator set so the ⊘ geometry actually renders on the price series.
  await page.addInitScript(() => {
    localStorage.setItem("mm.inds", JSON.stringify(["_oracle"]));
  });
  await armTerminalVisualReady(page);
  await page.goto("/terminal?symbol=COST");
  await expect(page.locator(".workspace")).toBeVisible();
  await waitForTerminalVisualReady(page);
  if (opts.zh) {
    await page.locator(".mobilebar button.avatar").click();
    const settings = page.locator(".acs-card");
    await settings.getByRole("tab", { name: "Preferences" }).click();
    const zhButton = settings.getByRole("button", { name: "中文" });
    await zhButton.click();
    await expect(zhButton).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Escape");
    await expect(settings).toBeHidden();
  }
  return { blockedTs };
}

/** The amber `--signal` token, as the browser resolves it (#e8b339). */
const AMBER_RGB = "rgb(232, 179, 57)";

/** The ⊘ glyph is ~11px across on a full chart, so a full-viewport shot proves nothing to a
 *  human reviewer. Crop tight around the marker's own bounding box instead. */
async function cropMarker(page: Page, path: string) {
  const box = await page.locator("[data-sig-layer]").first().evaluate((svg) => {
    const g = [...svg.querySelectorAll("g")]
      .find((el) => el.querySelector('circle[fill="none"]') && el.querySelector("line"));
    if (!g) return null;
    const r = (g as SVGGElement).getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (!box) return;
  await page.screenshot({
    path,
    clip: { x: Math.max(0, box.x - 38), y: Math.max(0, box.y - 32), width: 76, height: 64 },
  });
}

test("a qualifying ⊘ wears the amber override class on card, hover and chart", async ({ page }, testInfo) => {
  const zh = testInfo.project.name === "tablet";
  await openTerminal(page, { override: true, zh });

  // ── the rail button: unchanged verdict, and the Tier-2 numbers reachable on hover ──
  const signalButton = page.locator(".sig-btn");
  await signalButton.scrollIntoViewIfNeeded();
  await expect(signalButton.locator(".sig-btn-go .sig-btn-vd"))
    .toHaveText(zh ? "买点触发 — 趋势闸拦截" : "Entry trigger — regime-blocked");
  await expect(signalButton).toHaveAttribute(
    "title",
    zh ? /仍是被拦截的入场 — 洗盘标记是背景，不是放行/
       : /still a refused entry — the washout flag is context, not a green light/,
  );
  await expect(signalButton).toHaveAttribute(
    "title",
    zh ? /每笔平均 \+27%，其他情形 \+3%/ : /averaged \+27% per trade vs \+3% otherwise/,
  );
  await signalButton.screenshot({
    path: testInfo.outputPath(`${testInfo.project.name}-washout-override-rail.png`),
  });

  // ── the chart marker: same ring-slash, amber at full opacity, with the dot above it ──
  const sigLayer = page.locator("[data-sig-layer]").first();
  await expect(sigLayer.locator('circle[fill="none"]').first()).toBeAttached();
  const marker = await sigLayer.evaluate((svg) => {
    const groups = [...svg.querySelectorAll("g")];
    const g = groups.find((el) => el.querySelector('circle[fill="none"]') && el.querySelector("line"));
    if (!g) return null;
    const outline = g.querySelector<SVGCircleElement>('circle[fill="none"]')!;
    const slash = g.querySelector<SVGLineElement>("line")!;
    const dot = g.querySelector<SVGCircleElement>('circle:not([fill="none"])');
    return {
      opacity: g.getAttribute("opacity"),
      ringStroke: getComputedStyle(outline).stroke,
      slashStroke: getComputedStyle(slash).stroke,
      dotFill: dot ? getComputedStyle(dot).fill : null,
      dotR: dot ? dot.getAttribute("r") : null,
      dotAboveRing: dot ? Number(dot.getAttribute("cy")) < Number(outline.getAttribute("cy")) : false,
      title: g.querySelector("title")?.textContent ?? "",
    };
  });
  expect(marker).not.toBeNull();
  expect(marker!.opacity).toBe("1");                     // full opacity, not the 0.62 background
  expect(marker!.ringStroke).toBe(AMBER_RGB);
  expect(marker!.slashStroke).toBe(AMBER_RGB);           // still a ring-SLASH — never buy geometry
  expect(marker!.dotFill).toBe(AMBER_RGB);
  expect(marker!.dotAboveRing).toBe(true);
  expect(marker!.title).toContain("blocked by the regime gate — not an entry");
  expect(marker!.title).toContain("washout override candidate — Uranium miners −38% from highs");
  await page.locator(".chart-wrap, .workspace").first().screenshot({
    path: testInfo.outputPath(`${testInfo.project.name}-washout-override-chart.png`),
  });
  await cropMarker(page, testInfo.outputPath(`${testInfo.project.name}-washout-override-marker.png`));

  // ── the card: ONE extra amber line under the same amber verdict ──
  await signalButton.click();
  const dialog = page.locator(".sd-scrim");
  await expect(dialog).toBeVisible();
  const line2 = dialog.locator(".sd-go .od-vline2");
  await expect(line2).toHaveText(
    zh ? "深度洗盘例外候选 — 铀矿商板块距高点 −38%"
       : "Washout override candidate — Uranium miners −38% from highs",
  );
  await expect(line2).toHaveCSS("color", AMBER_RGB);
  await expect(dialog.locator(".sd-go .od-verdict")).toHaveText(
    zh ? "买点触发 — 趋势闸拦截" : "Entry trigger — regime-blocked",
  );
  // the disclosure carries its own Tier-2 hover so the numbers are reachable from the card too
  await expect(line2).toHaveAttribute(
    "title", zh ? /多数仍会止损离场 — 止损才是保护/ : /most still stop out — the stop is the protection/,
  );
  // the refusal is still a refusal: no tier/score row, and the history row still says BLOCKED
  await expect(dialog.locator(".sd-go .sig-dims")).toHaveCount(0);
  await expect(dialog.locator(".sd-go .sd-sigrow").first().locator(".sd-sig-badge"))
    .toHaveText(zh ? "已拦截" : "BLOCKED");
  await dialog.locator(".sd-go").screenshot({
    path: testInfo.outputPath(`${testInfo.project.name}-washout-override-card.png`),
  });
});

test("a non-qualifying ⊘ renders exactly as it does today", async ({ page }, testInfo) => {
  const zh = testInfo.project.name === "tablet";
  await openTerminal(page, { override: false, zh });

  const signalButton = page.locator(".sig-btn");
  await signalButton.scrollIntoViewIfNeeded();
  await expect(signalButton.locator(".sig-btn-go .sig-btn-vd"))
    .toHaveText(zh ? "买点触发 — 趋势闸拦截" : "Entry trigger — regime-blocked");
  const title = await signalButton.getAttribute("title");
  expect(title).not.toContain("washout");
  expect(title).not.toContain("洗盘");
  expect(title).not.toContain("+27%");

  const marker = await page.locator("[data-sig-layer]").first().evaluate((svg) => {
    const g = [...svg.querySelectorAll("g")]
      .find((el) => el.querySelector('circle[fill="none"]') && el.querySelector("line"));
    if (!g) return null;
    return {
      opacity: g.getAttribute("opacity"),
      ringStroke: getComputedStyle(g.querySelector<SVGCircleElement>('circle[fill="none"]')!).stroke,
      dots: g.querySelectorAll('circle:not([fill="none"])').length,
    };
  });
  expect(marker).not.toBeNull();
  expect(marker!.opacity).toBe("0.62");             // the dim slate background treatment
  expect(marker!.ringStroke).toBe("rgb(124, 138, 160)");   // #7c8aa0
  expect(marker!.dots).toBe(0);                     // no amber dot
  await cropMarker(page, testInfo.outputPath(`${testInfo.project.name}-washout-plain-marker.png`));

  await signalButton.click();
  const dialog = page.locator(".sd-scrim");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".sd-go .od-vline2")).toHaveCount(0);
  await expect(dialog.locator(".sd-go .od-verdict")).toHaveText(
    zh ? "买点触发 — 趋势闸拦截" : "Entry trigger — regime-blocked",
  );
  await dialog.locator(".sd-go").screenshot({
    path: testInfo.outputPath(`${testInfo.project.name}-washout-plain-card.png`),
  });
});
