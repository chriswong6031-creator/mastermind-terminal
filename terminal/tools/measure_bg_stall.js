/**
 * tools/measure_bg_stall.js
 *
 * Measures hidden-tab vs foreground boot time on /terminal?boottrace=1&symbol=MU.
 *
 * Usage:
 *   node tools/measure_bg_stall.js [--url URL] [--no-screenshot] [--headed]
 *
 * Defaults:
 *   URL = http://localhost:3030
 *
 * Playwright is loaded from /tmp/pw/node_modules/playwright (install once with
 * `npm install --prefix /tmp/pw playwright`).  Falls back to require("playwright").
 *
 * The script:
 *   1. Opens page A (foreground anchor) to ensure page B starts hidden.
 *   2. Navigates page B (background) to /terminal?boottrace=1&symbol=MU.
 *      - Polls every 2 s for: fetch count, boottrace marks, canvas count.
 *      - Stops polling as soon as first fetch appears OR at BG_DEADLINE_MS.
 *   3. Repeats with page B as FOREGROUND (page A absent) for the fast-path baseline.
 *   4. Prints a before/after summary table and exits:
 *       0  — both scenarios booted within PASS_THRESHOLD_MS (fix confirmed)
 *       1  — background boot took >PASS_THRESHOLD_MS (stall still present / fix incomplete)
 *       2  — unexpected error
 *
 * Why this test passes AFTER the fix:
 *   - The rIC timeout-race in TerminalShell (setTimeout 200 ms) fires within the
 *     browser's minimum background-timer interval (~1-2 s), not the 30-60 s rIC delay.
 *   - The rAF fallback in ChartPanel (setTimeout 200 ms) drives overlay render even when
 *     Chrome freezes rAF at 0 fps in background tabs.
 *
 * NOTE: Playwright headless Chromium does NOT throttle rAF or timers for background pages,
 * so the background scenario always boots fast in headless mode — the test confirms the fix
 * does not regress foreground boot.  To reproduce the original stall you must use headed
 * Chrome with a real background tab (--headed flag) against a production bundle on a
 * machine where Chrome's background throttling is active.
 */
"use strict";

let playwright;
try {
  playwright = require("/tmp/pw/node_modules/playwright");
} catch {
  playwright = require("playwright");
}
const { chromium } = playwright;

const args = process.argv.slice(2);
const BASE_URL = (() => {
  const i = args.indexOf("--url");
  return i >= 0 ? args[i + 1] : "http://localhost:3030";
})();
const HEADED = args.includes("--headed");
const SKIP_SCREENSHOT = args.includes("--no-screenshot");
const TERMINAL_URL = `${BASE_URL}/terminal?boottrace=1&symbol=MU`;

const POLL_INTERVAL_MS = 2000;
const BG_DEADLINE_MS = 15000;      // wait up to 15 s for first fetch in background
const FG_DEADLINE_MS = 10000;      // foreground should boot well within 10 s
const PASS_THRESHOLD_MS = 5000;    // fix target: background first-fetch < 5 s

// Patch window.fetch to count outgoing requests.
const PATCH_FETCH_SCRIPT = /* js */ `(() => {
  if (window.__bgStallFetches) return;
  window.__bgStallFetches = [];
  const orig = window.fetch;
  window.fetch = function(...a) {
    const url = typeof a[0] === "string" ? a[0] : (a[0]?.url || "?");
    window.__bgStallFetches.push({ url, t: performance.now() });
    return orig.apply(this, a);
  };
})()`;

// Poll for current page state.
const POLL_SCRIPT = /* js */ `(() => {
  const fetches = window.__bgStallFetches || [];
  const marks = window.performance
    ? performance.getEntriesByType("mark")
        .filter(m => m.name.startsWith("bt:") || m.name.startsWith("cp:"))
        .map(m => ({ name: m.name, t: Math.round(m.startTime) }))
    : [];
  return {
    fetchCount: fetches.length,
    marks,
    canvases: document.querySelectorAll("canvas").length,
    visState: document.visibilityState,
    hasFocus: document.hasFocus(),
  };
})()`;

async function pollUntilFirstFetch(page, deadlineMs, label) {
  const start = Date.now();
  const snapshots = [];
  let screenshotTaken = false;

  while (true) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    const elapsed = Date.now() - start;

    let snap = { fetchCount: -1, marks: [], canvases: -1, visState: "eval-error", hasFocus: false };
    try { snap = await page.evaluate(POLL_SCRIPT); } catch {}
    snap.elapsed = elapsed;
    snapshots.push(snap);

    const markStr = snap.marks.map(m => `${m.name}@${m.t}`).join(", ");
    console.log(
      `  [${label}] t=${(elapsed / 1000).toFixed(1)}s` +
      `  fetches=${snap.fetchCount}  canvases=${snap.canvases}` +
      `  vis=${snap.visState}  marks=[${markStr || "none"}]`
    );

    if (snap.fetchCount > 0) {
      console.log(`  [${label}] First fetch at t=${(elapsed / 1000).toFixed(1)}s`);
      break;
    }
    if (elapsed >= deadlineMs) {
      if (!SKIP_SCREENSHOT && !screenshotTaken) {
        console.log(`  [${label}] Deadline reached — taking screenshot to check unblock…`);
        try {
          await page.screenshot({ path: `/tmp/bg_stall_${label}.png` });
          screenshotTaken = true;
          // Poll for 5 more seconds after screenshot to see if it unblocks.
          for (let extra = 0; extra < 3; extra++) {
            await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
            try { snap = await page.evaluate(POLL_SCRIPT); snap.elapsed = Date.now() - start; snapshots.push(snap); } catch {}
            if (snap.fetchCount > 0) { console.log(`  [${label}] Unblocked after screenshot at t=${(snap.elapsed / 1000).toFixed(1)}s`); break; }
          }
        } catch (e) { console.log(`  [${label}] Screenshot failed: ${e.message}`); }
      }
      break;
    }
  }
  return snapshots;
}

async function runScenario(browser, label, isBackground) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Scenario: ${label} (background=${isBackground})`);
  console.log("=".repeat(60));

  const context = await browser.newContext();

  let pageA = null;
  if (isBackground) {
    pageA = await context.newPage();
    await pageA.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
    console.log("  Page A (foreground anchor) loaded.");
  }

  const pageB = await context.newPage();
  await pageB.addInitScript(PATCH_FETCH_SCRIPT);

  const navStart = Date.now();
  let visAfterNav = "unknown";
  try {
    await pageB.goto(TERMINAL_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
    visAfterNav = await pageB.evaluate(() => document.visibilityState).catch(() => "err");
  } catch (e) {
    console.log(`  Navigation error: ${e.message}`);
  }
  const navMs = Date.now() - navStart;
  console.log(`  Page B DOM loaded in ${navMs} ms. visibilityState=${visAfterNav}`);

  const deadline = isBackground ? BG_DEADLINE_MS : FG_DEADLINE_MS;
  const snapshots = await pollUntilFirstFetch(pageB, deadline, label);

  await context.close();
  return snapshots;
}

function summarize(label, snapshots) {
  const firstFetch = snapshots.find(s => s.fetchCount > 0);
  const firstCanvas = snapshots.find(s => s.canvases > 0);
  const firstMark = snapshots.find(s => s.marks.length > 0);
  const last = snapshots[snapshots.length - 1] || {};

  console.log(`\n--- ${label} ---`);
  console.log(`  First fetch:  ${firstFetch ? `t=${(firstFetch.elapsed / 1000).toFixed(1)} s  (count=${firstFetch.fetchCount})` : "never in window"}`);
  console.log(`  First canvas: ${firstCanvas ? `t=${(firstCanvas.elapsed / 1000).toFixed(1)} s` : "never in window"}`);
  console.log(`  First mark:   ${firstMark ? `t=${(firstMark.elapsed / 1000).toFixed(1)} s  (${firstMark.marks[0]?.name})` : "never in window"}`);
  console.log(`  Final state:  fetches=${last.fetchCount ?? "?"}  canvases=${last.canvases ?? "?"}  marks=${last.marks?.length ?? "?"}`);

  return { firstFetchMs: firstFetch?.elapsed ?? null };
}

(async () => {
  const browser = await chromium.launch({ headless: !HEADED, args: ["--disable-features=site-per-process", "--no-sandbox"] });

  try {
    const bgSnaps = await runScenario(browser, "background", true);
    const fgSnaps = await runScenario(browser, "foreground", false);

    console.log("\n" + "=".repeat(60));
    console.log("SUMMARY");
    console.log("=".repeat(60));
    const bg = summarize("background", bgSnaps);
    const fg = summarize("foreground", fgSnaps);

    const bgMs = bg.firstFetchMs;
    const fgMs = fg.firstFetchMs;

    const bgPass = bgMs !== null && bgMs <= PASS_THRESHOLD_MS;
    const fgPass = fgMs !== null && fgMs <= PASS_THRESHOLD_MS;

    console.log(`\nPass threshold: ${PASS_THRESHOLD_MS / 1000} s`);
    console.log(`Background first fetch: ${bgMs !== null ? (bgMs / 1000).toFixed(1) + " s" : "TIMED OUT"}  → ${bgPass ? "PASS" : "FAIL"}`);
    console.log(`Foreground first fetch: ${fgMs !== null ? (fgMs / 1000).toFixed(1) + " s" : "TIMED OUT"}  → ${fgPass ? "PASS" : "FAIL"}`);

    console.log(`\n${"=".repeat(60)}`);
    console.log("BEFORE / AFTER TABLE");
    console.log("=".repeat(60));
    console.log("Scenario        | Before fix     | After fix (this run)");
    console.log("----------------|----------------|----------------------");
    console.log(`Background tab  | 30-60 s+       | ${bgMs !== null ? (bgMs / 1000).toFixed(1) + " s" : "TIMED OUT"} (target <5 s)`);
    console.log(`Foreground tab  | ~0.2 s         | ${fgMs !== null ? (fgMs / 1000).toFixed(1) + " s" : "TIMED OUT"} (target <5 s)`);
    console.log("");
    console.log("NOTE: Playwright headless Chromium does not throttle rAF/timers in background");
    console.log("pages, so background=foreground in this environment. Both measurements confirm");
    console.log("the fix does not regress the fast boot path. To observe the original stall,");
    console.log("run with --headed against a full production bundle on a real Chrome session.");

    if (bgPass && fgPass) {
      console.log("\nResult: PASS — both scenarios booted within threshold.");
      process.exit(0);
    } else {
      console.log("\nResult: FAIL — one or more scenarios did not boot within threshold.");
      process.exit(1);
    }
  } finally {
    await browser.close();
  }
})().catch(err => {
  console.error("Fatal:", err);
  process.exit(2);
});
