// One-off measurement for PR #490 MAJOR-1 (review ruling): the round-3/round-4 stacking fix
// (.analysis-shell .mobilebar{z-index:95} + the .fin-pane--workspace{top:52px} offset,
// app/globals.css) was asserted only through a source-level CSSOM test
// (lib/__tests__/appShellAnalysisZIndex.test.ts) — never through an actual rendered page. This
// script is the "before vs after" real-browser measurement the ruling asks for: computed
// z-index, position, and bounding boxes for the two colliding elements
// (.mobilebar and the Company Intelligence full-screen pane, .fin-pane / .fin-pane--workspace)
// at both contract viewports, plus a real elementFromPoint hit-test at the "Menu" button's
// center point (the actual user gesture the fix exists for — a z-index number alone does not
// prove a click reaches the button; app/fin.css `.fin-pane{z-index:90}` covers it below the fix).
//
// This is NOT part of the `test:e2e:responsive` suite (not in playwright.config.ts's testDir
// matching, and it is run with plain `node`, not `npx playwright test`) — house law forbids
// running that suite locally; this is a standalone script run once per side of the comparison
// and its output pasted into the PR body. Keep or delete after use (ruling's own words).
//
// Usage: node e2e/tools/measure-analysis-mobilebar-stacking.mjs <port> <label> <outDir>
//   <label> is a free-text tag ("BEFORE-origin-master" / "AFTER-f716d713a...") embedded in the
//   output filenames and JSON so the two runs cannot be confused after the fact.
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const [port, label, outDir] = process.argv.slice(2);
if (!port || !label || !outDir) {
  console.error("Usage: node measure-analysis-mobilebar-stacking.mjs <port> <label> <outDir>");
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

const BRAIN_SCRIPT_SRC = "https://www.mastermind-x.com/mm_brain.js";
const METRICS = {
  sentiment: null, performance: null, confidence: null, combined: null,
  call_positivity: null, management_confidence: null, analyst_criticism: null,
  future_outlook: null, revenue_growth_pct: null, eps_growth_pct: null,
  gross_margin_pct: null, analysts_count: null, questions_count: null,
};

function companyContext() {
  const event = {
    event_id: "cie_stack_2026q1", ticker: "NVDA", fiscal_year: 2026, fiscal_quarter: 1,
    call_date: "2026-05-20", summary: null, highlights: [], positive_highlights: [],
    negative_highlights: [], key_quote: null, tags: [], metrics: METRICS,
    field_lineage: { summary: null, key_quote: null, metrics: METRICS, positive_highlights: [], negative_highlights: [], highlights: [], tags: {} },
    previous_event_deltas: METRICS,
    sources: [{ source_ref: "transcript", kind: "transcript", status: "present", citation_precision: "document", url: "/data/tx/NVDA/2026Q1.json.gz", receipt: { source_hash: "a".repeat(64), source_date: "2026-05-20", record_id: "2026Q1" } }],
    claim_citations_pending: true,
  };
  return {
    schema: "company_intelligence_context.v1", authority: "context_only", is_context_only: true,
    generated_at: "2026-08-30T00:00:00Z", generation_id: "b".repeat(24),
    company: { ticker: "NVDA", display_name: "NVIDIA Corporation", exchange: null },
    status: "ready", latest_event_id: event.event_id, latest_event: event, history: [event],
    topics: { timeline: [], added: [], dropped: [], persistent: [] },
    source_completeness: {
      earnings_history: { status: "missing", event_count: 0 },
      score_overlay: { status: "missing", event_count: 0 },
      transcripts: { status: "present", event_count: 1 },
    },
    warnings: [], missing_sources: [],
    transport_lineage: {
      earnings_manifest: { generation_id: "c".repeat(24), sha256: "d".repeat(64) },
      tx_index: { schema: "mastermind.tx-index/v1", generation_id: "e".repeat(24), sha256: "f".repeat(64) },
      builder: "company_intelligence.v1",
    },
  };
}

async function mockRoutes(page) {
  await page.route(BRAIN_SCRIPT_SRC, (route) => route.fulfill({
    contentType: "application/javascript",
    body: "(() => { window.MMBrain = { mounted: true, open() {} }; document.documentElement.dataset.rctxHost = 'mounted'; })();",
  }));
  await page.route("**/api/event-workspace/**", (route) => route.fulfill({
    status: 404,
    json: { ok: false, state: "error", available: false, error: { code: "not_found", message: "No event workspace", retryable: false } },
  }));
  await page.route("**/api/company-intelligence/NVDA**", (route) => route.fulfill({ json: { ok: true, state: "ready", context: companyContext() } }));
  await page.route("**/api/company-theme-context/NVDA**", (route) => route.fulfill({
    status: 404, json: { ok: false, state: "error", error: { code: "not_found", message: "No theme context", retryable: false } },
  }));
  await page.route("**/api/company-institutional-context/NVDA**", (route) => route.fulfill({
    status: 404, json: { ok: false, state: "error", error: { code: "not_found", message: "No institutional context", retryable: false } },
  }));
  await page.route("**/api/company-source-search/NVDA?**", (route) => route.fulfill({
    json: {
      schema: "mastermind.company-source-search/v1", state: "ready", ticker: "NVDA", query: "",
      spans: [], searched_event_ids: [], match_count_by_event: {}, count_capped_event_ids: [],
      truncated: false, corpus_revision: "stack_measure_revision",
    },
  }));
}

/** Real getComputedStyle + getBoundingClientRect for one selector, or null if absent. */
function readElement(selector) {
  const el = document.querySelector(selector);
  if (!el) return null;
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  return {
    zIndex: cs.zIndex,
    position: cs.position,
    top: cs.top,
    rect: { x: r.x, y: r.y, width: r.width, height: r.height, top: r.top, bottom: r.bottom, left: r.left, right: r.right },
  };
}

function rectsOverlap(a, b) {
  if (!a || !b) return null;
  return a.rect.left < b.rect.right && a.rect.right > b.rect.left && a.rect.top < b.rect.bottom && a.rect.bottom > b.rect.top;
}

const VIEWPORTS = [
  { name: "1440x900", width: 1440, height: 900 },
  { name: "390x844", width: 390, height: 844 },
];

const browser = await chromium.launch();
const results = { label, port: Number(port), viewports: {} };

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const page = await ctx.newPage();
  await mockRoutes(page);
  await page.goto(`http://127.0.0.1:${port}/analysis?symbol=NVDA&page=intelligence`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.locator(".fin-pane").first().waitFor({ state: "attached", timeout: 30_000 });
  // Let layout settle (webfonts, one paint frame) before reading computed geometry.
  await page.waitForTimeout(500);

  const mobilebar = await page.evaluate(readElement, ".mobilebar");
  const finPane = await page.evaluate(readElement, ".fin-pane.fin-pane--workspace");
  const finHead = await page.evaluate(readElement, ".fin-head");
  const menuButton = await page.evaluate(readElement, 'button[aria-label="Menu"]');

  // Real hit-test: what does the browser's own hit-testing return at the Menu button's
  // center point? This is the actual click-reachability the fix exists for, not an inference
  // from z-index numbers alone.
  const menuHitTest = menuButton
    ? await page.evaluate(({ x, y }) => {
        const el = document.elementFromPoint(x, y);
        const menu = document.querySelector('button[aria-label="Menu"]');
        return { hitElementTag: el ? el.tagName : null, hitElementIsMenuButton: !!(el && menu && (el === menu || menu.contains(el))) };
      }, { x: menuButton.rect.x + menuButton.rect.width / 2, y: menuButton.rect.y + menuButton.rect.height / 2 })
    : null;

  const screenshotPath = join(outDir, `${label}-${vp.name}.png`);
  await page.screenshot({ path: screenshotPath });

  results.viewports[vp.name] = {
    mobilebar,
    finPane,
    finHead,
    menuButton,
    menuHitTest,
    mobilebarOverlapsFinPane: rectsOverlap(mobilebar, finPane),
    finHeadCoveredByMobilebar: rectsOverlap(finHead, mobilebar),
    screenshot: screenshotPath,
  };

  console.log(`[${label}] ${vp.name}`);
  console.log(JSON.stringify(results.viewports[vp.name], null, 2));
  await ctx.close();
}
await browser.close();

const jsonPath = join(outDir, `${label}.json`);
writeFileSync(jsonPath, JSON.stringify(results, null, 2));
console.log(`\nWrote ${jsonPath}`);
