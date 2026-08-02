import { expect, test, type Page } from "@playwright/test";
import { gzipSync } from "node:zlib";

const SHA = "a".repeat(64);
const drawerFixtureBody = {
  schema: "mastermind.tx/v1",
  ticker: "NVDA",
  id: "2026Q1",
  period: "Q1 FY2026",
  date: "2026-05-20",
  title: "NVIDIA Earnings Call Q1 FY2026",
  segments: [
    { speaker: "Jensen Huang", role: "Chief Executive Officer", text: "Data center demand remained broad across cloud, enterprise, and sovereign AI customers." },
    { speaker: "Colette Kress", role: "Chief Financial Officer", text: "We continue to see data center demand across our compute platforms and networking products." },
  ],
};

const metrics = (overrides: Record<string, number | null> = {}) => ({
  sentiment: 68,
  performance: 72,
  confidence: 64,
  combined: 68,
  call_positivity: 71,
  management_confidence: 66,
  analyst_criticism: 22,
  future_outlook: 74,
  revenue_growth_pct: 18.4,
  eps_growth_pct: 21.1,
  gross_margin_pct: 74.2,
  analysts_count: 12,
  questions_count: 18,
  ...overrides,
});

function event(id: string, fiscalYear: number, fiscalQuarter: number, callDate: string, summary: string) {
  const eventMetrics = metrics();
  return {
    event_id: id,
    ticker: "NVDA",
    fiscal_year: fiscalYear,
    fiscal_quarter: fiscalQuarter,
    call_date: callDate,
    summary,
    highlights: ["Data-center demand remained broad across the period."],
    positive_highlights: ["Revenue growth accelerated with broad data-center demand."],
    negative_highlights: ["Supply and deployment timing remain watch items."],
    key_quote: "We continue to see broad demand across our platform.",
    tags: ["data center", "demand"],
    metrics: eventMetrics,
    field_lineage: {
      summary: "earnings_history",
      key_quote: "earnings_history",
      metrics: Object.fromEntries(Object.keys(eventMetrics).map((key) => [key, "score_overlay"])),
      positive_highlights: ["earnings_history"],
      negative_highlights: ["earnings_history"],
      highlights: ["earnings_history"],
      tags: { "data center": "earnings_history", demand: "earnings_history" },
    },
    previous_event_deltas: metrics({ revenue_growth_pct: 2.1, eps_growth_pct: 1.6, gross_margin_pct: 0.4, questions_count: 3 }),
    sources: [
      {
        source_ref: "earnings_history",
        kind: "earnings_history",
        status: "present",
        citation_precision: "document",
        url: "https://investor.nvidia.com/earnings",
        receipt: { source_hash: SHA, source_date: callDate, record_id: `${id}-earnings` },
      },
      {
        source_ref: "score_overlay",
        kind: "score_overlay",
        status: "metadata_only",
        citation_precision: "metadata",
        url: null,
        receipt: { source_hash: "b".repeat(64), source_date: callDate, record_id: `${id}-overlay` },
      },
      {
        source_ref: "transcript",
        kind: "transcript",
        status: "present",
        citation_precision: "document",
        url: `/data/tx/NVDA/${fiscalYear}Q${fiscalQuarter}.json.gz`,
        receipt: { source_hash: "c".repeat(64), source_date: callDate, record_id: `${fiscalYear}Q${fiscalQuarter}` },
      },
    ],
    claim_citations_pending: true,
  };
}

function contextFixture() {
  const latest = event(
    "cie_d8488221fd8c710c53d6537d",
    2026,
    1,
    "2026-05-20",
    "NVIDIA reported broad platform demand, with revenue growth and gross-margin discipline remaining central to the event read-through.",
  );
  const prior = event(
    "cie_4c0410e7c4358283cf37a557",
    2025,
    4,
    "2026-02-19",
    "The preceding event established the demand and supply baseline for this quarter-over-quarter comparison.",
  );
  return {
    schema: "company_intelligence_context.v1",
    authority: "context_only",
    is_context_only: true,
    generated_at: "2026-08-01T12:00:00Z",
    generation_id: "a".repeat(24),
    company: { ticker: "NVDA", display_name: "NVIDIA Corporation", exchange: null },
    status: "ready",
    latest_event_id: latest.event_id,
    latest_event: latest,
    history: [latest, prior],
    topics: {
      timeline: [
        { tag: "data center", first_event_id: prior.event_id, last_event_id: latest.event_id, event_count: 2, status: "persistent" },
        { tag: "demand", first_event_id: latest.event_id, last_event_id: latest.event_id, event_count: 1, status: "added" },
      ],
      added: ["demand"],
      dropped: [],
      persistent: ["data center"],
    },
    source_completeness: {
      earnings_history: { status: "present", event_count: 2 },
      score_overlay: { status: "metadata_only", event_count: 2 },
      transcripts: { status: "present", event_count: 2 },
    },
    warnings: [],
    missing_sources: [],
    transport_lineage: {
      earnings_manifest: { generation_id: "b".repeat(24), sha256: "d".repeat(64) },
      tx_index: { schema: "mastermind.tx-index/v1", generation_id: "c".repeat(24), sha256: "e".repeat(64) },
      builder: "company_intelligence.v1",
    },
  };
}

function themeContextFixture() {
  return {
    schema: "company_theme_exposure.v1",
    authority: "context_only",
    is_context_only: true,
    generated_at: "2026-08-01T12:00:00Z",
    generation_id: "f".repeat(24),
    status: "partial",
    company: { ticker: "NVDA" },
    company_intelligence: {
      generation_id: "a".repeat(24),
      context_sha256: "9".repeat(64),
      latest_event_id: "cie_d8488221fd8c710c53d6537d",
      latest_event_call_date: "2026-05-20",
    },
    exposures: [{
      theme_id: "ai_infrastructure",
      name_en: "AI Infrastructure",
      name_zh: "人工智能基础设施",
      basket_id: "ai_semiconductors",
      mapping_qualifier: "proxy",
    }],
    coverage: { status: "mixed", active_basket_count: 2, mapped_basket_count: 1, unmapped_basket_count: 1 },
    theme_state: { status: "stale", as_of: "2026-07-28", sha256: "8".repeat(64) },
    warnings: ["active_membership_unmapped", "theme_state_stale"],
  };
}

async function routeThemeContext(page: Page) {
  await page.route("**/api/company-theme-context/NVDA**", async (route) => {
    await route.fulfill({ json: { ok: true, state: "partial", context: themeContextFixture() } });
  });
}

async function openCompanyIntelligence(page: Page, intelligenceLabel = "Intelligence") {
  await page.route("**/api/company-intelligence/NVDA**", async (route) => {
    await route.fulfill({ json: { ok: true, state: "ready", context: contextFixture() } });
  });
  await routeThemeContext(page);
  await page.goto("/analysis?symbol=NVDA&page=intelligence");
  // This is a server-seeded deep link, not a client-side redirect from Overview.
  await expect(page.locator(".fin-tabs").getByRole("tab", { name: intelligenceLabel, exact: true }))
    .toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".ci-page")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "NVIDIA Corporation" })).toBeVisible();
}

async function expectNoDocumentOverflow(page: Page) {
  const width = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(width.document).toBeLessThanOrEqual(width.viewport + 1);
}

test("Company Intelligence keeps its context and evidence workflow responsive", async ({ page }, testInfo) => {
  await openCompanyIntelligence(page);
  await expectNoDocumentOverflow(page);
  await expect(page.getByRole("heading", { name: "Curated basket context" })).toBeVisible();
  await expect(page.locator(".ci-theme-card")).toContainText("AI Infrastructure");
  await expect(page.locator(".ci-theme-card")).toContainText("Proxy crosswalk");
  await page.screenshot({ path: testInfo.outputPath(`${testInfo.project.name}-company-theme-context.png`), fullPage: false });

  const evidence = page.locator(".ci-evidence");
  const receipts = page.locator(".ci-receipts-button");
  const desktop = testInfo.project.name.endsWith("desktop");

  if (desktop) {
    await expect(evidence).toHaveAttribute("aria-hidden", "false");
    await expect(evidence).toHaveCSS("position", "sticky");
    await page.getByRole("button", { name: "Close evidence inspector" }).click();
    await expect(evidence).toHaveAttribute("aria-hidden", "true");
    await expect(evidence).toHaveAttribute("inert", "");
    await expect(evidence).not.toBeVisible();
    await expect(receipts).toBeFocused();
  } else {
    await expect(evidence).toHaveAttribute("aria-hidden", "true");
    await expect(evidence).toHaveAttribute("inert", "");
    await expect(evidence).toHaveCSS("position", "fixed");
  }

  // The closed mobile sheet remains in the DOM for its transform animation, so
  // this is a real tab-order assertion rather than merely checking aria-hidden.
  if (!desktop) {
    await receipts.focus();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Ask Mastermind" })).toBeFocused();
    await page.keyboard.press("Tab");
    expect(await page.locator(".ci-evidence").evaluate((rail) => !rail.contains(document.activeElement))).toBe(true);
  }

  await receipts.click();
  await expect(evidence).toHaveAttribute("aria-hidden", "false");
  if (!desktop) {
    await expect(page.locator(".ci-evidence-scrim")).toHaveClass(/open/);
    const close = page.locator(".ci-evidence-close");
    await expect(close).toBeFocused();
    const focusables = evidence.locator('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])');
    const focusableCount = await focusables.count();
    // The inspector intentionally includes more than Close when the selected
    // receipt has a source link. Walk to the actual final control, then prove
    // the trap wraps forward (and backward) instead of assuming one Tab wraps.
    expect(focusableCount).toBeGreaterThan(1);
    for (let index = 1; index < focusableCount; index += 1) await page.keyboard.press("Tab");
    await expect(focusables.nth(focusableCount - 1)).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(close).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(focusables.nth(focusableCount - 1)).toBeFocused();
  }
  if (desktop) {
    await page.getByRole("button", { name: "Close evidence inspector" }).click();
  } else {
    await page.keyboard.press("Escape");
  }
  await expect(evidence).toHaveAttribute("aria-hidden", "true");
  await expect(evidence).toHaveAttribute("inert", "");
  await expect(receipts).toBeFocused();

  // The lens bar is its own roving tablist inside the Intelligence page; this
  // assertion protects it from being swallowed by the outer Financials tabs.
  const topics = page.locator(".ci-lenses").getByRole("tab", { name: "Topics" });
  // Start from the deliberately taller transcript workspace so both Terminal
  // hosts (inner .fin-body scroller and document scroller) exercise the same
  // sticky-lens reveal contract.
  await page.locator(".ci-lenses").getByRole("tab").nth(1).click();
  await expect(page.locator(".ci-ts-explorer")).toBeVisible();
  await page.locator(".ci-ts-explorer").evaluate((element) => {
    const inner = element.closest<HTMLElement>(".fin-body");
    element.style.minHeight = `${(inner?.clientHeight ?? window.innerHeight) + 800}px`;
  });
  const deepScroll = await page.evaluate(() => {
    const inner = document.querySelector<HTMLElement>(".fin-body");
    if (inner) inner.scrollTop = inner.scrollHeight;
    window.scrollTo(0, document.documentElement.scrollHeight);
    return { inner: inner?.scrollTop ?? 0, windowY: window.scrollY };
  });
  expect(Math.max(deepScroll.inner, deepScroll.windowY)).toBeGreaterThan(0);
  await topics.click();
  await expect(topics).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#ci-panel-topics")).toContainText("What entered, persisted, or dropped");
  await expect.poll(() => page.evaluate(() => {
    const lenses = document.querySelector(".ci-lenses")?.getBoundingClientRect();
    const workspace = document.querySelector(".ci-workspace")?.getBoundingClientRect();
    return !!lenses && !!workspace && workspace.top >= lenses.bottom - 1;
  })).toBe(true);
  const afterReveal = await page.evaluate(() => ({
    inner: document.querySelector<HTMLElement>(".fin-body")?.scrollTop ?? 0,
    windowY: window.scrollY,
  }));
  expect(afterReveal.inner < deepScroll.inner || afterReveal.windowY < deepScroll.windowY).toBe(true);
  await expectNoDocumentOverflow(page);

  await page.screenshot({
    path: testInfo.outputPath(`${testInfo.project.name}-company-intelligence.png`),
    fullPage: false,
  });
});

test("literal transcript search and compare use the local revision-verified BFF", async ({ page }, testInfo) => {
  await page.route("**/data/tx/NVDA/2026Q1.json.gz", async (route) => {
    await route.fulfill({ body: gzipSync(JSON.stringify(drawerFixtureBody)), headers: { "content-type": "application/gzip" } });
  });
  await openCompanyIntelligence(page);
  const transcript = page.locator(".ci-lenses").getByRole("tab").nth(1);
  await transcript.click();
  await expect(page.locator(".ci-ts-hero h3")).toBeVisible();

  const search = page.locator(".ci-ts-search");
  await search.locator("input").fill("quantum bicycle");
  await search.locator(".btn").click();
  await expect(page.locator(".ci-ts-state.empty strong")).toHaveText("No exact matches");
  await expect(page.locator(".ci-ts-state.empty p")).toHaveText("The selected events were checked for this literal phrase. No segment contains it; no expansion, paraphrase, or inferred relevance was used.");

  await search.locator("input").fill("data center");
  await search.locator(".btn").click();
  await expect(page.locator(".ci-ts-results .ci-ts-span")).toHaveCount(2);
  await expect(page.locator(".ci-ts-results mark").first()).toHaveText("Data center");
  await expect(page.locator(".ci-ts-hero")).toContainText("Find exact words across calls");

  const settings = page.locator('button[aria-label="Settings"]');
  const sourceButton = page.locator(".ci-ts-results .ci-ts-span-actions button").first();
  await sourceButton.scrollIntoViewIfNeeded();
  const scrollBeforeDrawer = await page.evaluate(() => ({
    inner: document.querySelector<HTMLElement>(".fin-body")?.scrollTop ?? 0,
    windowX: window.scrollX,
    windowY: window.scrollY,
  }));
  await sourceButton.click();
  const drawerRoot = page.locator(".fin-tx-modal-root");
  await expect(page.locator(".fin-tx-drawer")).toBeVisible();
  await expect(page.locator('.fin-tx-seg[data-segment="1"]')).toBeFocused();
  expect(await drawerRoot.evaluate((element) => element.parentElement === document.body)).toBe(true);
  expect(Number(await page.locator(".fin-tx-drawer").evaluate((element) => getComputedStyle(element).zIndex))).toBeGreaterThanOrEqual(241);
  await expect(page.locator("body")).toHaveCSS("overflow", "hidden");
  await expect(page.locator("html")).toHaveCSS("overflow", "hidden");
  expect(await settings.count()).toBeGreaterThan(0);
  expect(await settings.evaluateAll((buttons) => buttons.every((button) => !!button.closest("[inert]")))).toBe(true);
  await settings.first().evaluate((button) => (button as HTMLElement).focus());
  expect(await page.evaluate(() => !!document.activeElement?.closest(".fin-tx-drawer"))).toBe(true);
  await page.getByRole("button", { name: "Close transcript" }).click();
  await expect(page.locator(".fin-tx-drawer")).toHaveCount(0);
  await expect(sourceButton).toBeFocused();
  expect(await settings.evaluateAll((buttons) => buttons.every((button) => !button.closest("[inert]")))).toBe(true);
  await expect.poll(() => page.evaluate(() => ({
    inner: document.querySelector<HTMLElement>(".fin-body")?.scrollTop ?? 0,
    windowX: window.scrollX,
    windowY: window.scrollY,
  }))).toEqual(scrollBeforeDrawer);

  const receipt = page.locator(".ci-ts-results .ci-ts-span-actions button").nth(1);
  await receipt.scrollIntoViewIfNeeded();
  const scrollBeforeReceipt = await page.evaluate(() => ({
    inner: document.querySelector<HTMLElement>(".fin-body")?.scrollTop ?? 0,
    windowX: window.scrollX,
    windowY: window.scrollY,
  }));
  await receipt.click();
  const receiptWrap = page.locator(".ci-ts-dialog-wrap");
  const receiptClose = page.getByRole("button", { name: "Close source receipt" }).last();
  await expect(page.locator(".ci-ts-dialog")).toBeVisible();
  await expect(receiptClose).toBeFocused();
  await expect(page.locator(".ci-ts-dialog code").nth(1)).toHaveText(/^[a-f0-9]{64}$/);
  expect(await receiptWrap.evaluate((element) => element.parentElement === document.body)).toBe(true);
  expect(Number(await receiptWrap.evaluate((element) => getComputedStyle(element).zIndex))).toBeGreaterThanOrEqual(260);
  await expect(page.locator("body")).toHaveCSS("overflow", "hidden");
  await expect(page.locator("html")).toHaveCSS("overflow", "hidden");

  expect(await settings.count()).toBeGreaterThan(0);
  expect(await settings.evaluateAll((buttons) => buttons.every((button) => !!button.closest("[inert]")))).toBe(true);
  expect(await settings.first().evaluate((button) => {
    const bounds = button.getBoundingClientRect();
    const hit = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
    return hit === button || button.contains(hit);
  })).toBe(false);
  await settings.first().evaluate((button) => (button as HTMLElement).focus());
  expect(await page.evaluate(() => !!document.activeElement?.closest(".ci-ts-dialog"))).toBe(true);
  await expect(page.locator(".acs-overlay.open")).toHaveCount(0);

  await page.keyboard.press("Escape");
  await expect(page.locator(".ci-ts-dialog")).toHaveCount(0);
  await expect(receipt).toBeFocused();
  expect(await settings.evaluateAll((buttons) => buttons.every((button) => !button.closest("[inert]")))).toBe(true);
  await expect.poll(() => page.evaluate(() => ({
    inner: document.querySelector<HTMLElement>(".fin-body")?.scrollTop ?? 0,
    windowX: window.scrollX,
    windowY: window.scrollY,
  }))).toEqual(scrollBeforeReceipt);

  await page.locator(".ci-ts-compare-controls > .btn").click();
  await expect(page.locator(".ci-ts-compare-grid")).toBeVisible();
  await expect(page.locator(".ci-ts-compare-col")).toHaveCount(2);
  await expectNoDocumentOverflow(page);
  await page.screenshot({ path: testInfo.outputPath(`transcript-search-compare-${testInfo.project.name}.png`), fullPage: false });
});

test("editing a transcript query invalidates an older in-flight result", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.endsWith("desktop"), "one desktop race contract is sufficient");
  let releaseResponse!: () => void;
  let markRequested!: () => void;
  const responseGate = new Promise<void>((resolve) => { releaseResponse = resolve; });
  const requestSeen = new Promise<void>((resolve) => { markRequested = resolve; });
  await page.route("**/api/company-source-search/NVDA?**", async (route) => {
    markRequested();
    await responseGate;
    await route.fulfill({
      json: {
        schema: "mastermind.company-source-search/v1",
        state: "ready",
        ticker: "NVDA",
        query: "data center",
        searched_event_ids: ["cie_d8488221fd8c710c53d6537d"],
        match_count_by_event: { cie_d8488221fd8c710c53d6537d: 1 },
        count_capped_event_ids: [],
        truncated: false,
        corpus_revision: "txroot-race-20260801",
        spans: [{
          span_id: `txs1_${"f".repeat(64)}`,
          event_id: "cie_d8488221fd8c710c53d6537d",
          transcript_id: "2026Q1",
          ticker: "NVDA",
          document_sha256: "c".repeat(64),
          segment_index: 0,
          start_byte: 0,
          end_byte: 11,
          segment_text_sha256: "d".repeat(64),
          speaker: "Jensen Huang",
          role: "Chief Executive Officer",
          section: "prepared",
          excerpt: "Data center demand remained broad.",
          matched_text: "Data center",
          receipt: {
            revision_id: "txroot-race-20260801",
            document_sha256: "c".repeat(64),
            indexed_at: "2026-08-01T12:00:00Z",
            source_label: "Committed Mastermind transcript archive",
            source_url: "/data/tx/NVDA/2026Q1.json.gz",
            verification: "verified",
          },
        }],
      },
    });
  });

  await openCompanyIntelligence(page);
  await page.locator(".ci-lenses").getByRole("tab").nth(1).click();
  const search = page.locator(".ci-ts-search");
  await search.locator("input").fill("data center");
  await search.locator(".btn").click();
  await requestSeen;
  await expect(search.locator(".btn")).toHaveText("Searching…");
  await search.locator("input").fill("quantum bicycle");
  releaseResponse();
  await expect(search.locator(".btn")).toHaveText("Search exact phrase");
  await expect(page.locator(".ci-ts-state")).toHaveCount(0);
  await expect(page.locator(".ci-ts-results")).toHaveCount(0);
});

test("Analysis symbol URLs preserve valid market identifiers and refuse malformed ones", async ({ page }) => {
  const requested: string[] = [];
  await page.route("**/api/company-intelligence/**", async (route) => {
    requested.push(new URL(route.request().url()).pathname);
    await route.fulfill({ json: { ok: true, state: "ready", context: contextFixture() } });
  });

  await page.goto("/analysis?symbol=BRK.B&page=intelligence");
  await expect(page.locator(".analysis-context-identity strong")).toHaveText("BRK.B");
  await expect.poll(() => requested.some((path) => path.endsWith("/BRK.B"))).toBe(true);

  requested.length = 0;
  await page.getByLabel("Change symbol").fill("../NVDA");
  await page.getByLabel("Change symbol").press("Enter");
  await expect(page.locator(".analysis-invalid-state")).toBeVisible();
  await expect(page.locator(".analysis-invalid-state")).toContainText("not substituted with NVDA");
  await page.waitForTimeout(200);
  expect(requested).toEqual([]);

  await page.goto(`/analysis?symbol=${encodeURIComponent("../NVDA")}&page=intelligence`);
  await expect(page.locator(".analysis-invalid-state")).toBeVisible();
  await expect(page.locator(".analysis-invalid-state")).toContainText("not substituted with NVDA");
  await page.waitForTimeout(200);
  expect(requested).toEqual([]);
});

test("workspace Escape remains in analysis", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.endsWith("desktop"), "one desktop interaction contract is sufficient");
  await openCompanyIntelligence(page);

  // In workspace mode Escape is not a Back-to-chart shortcut.
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/analysis\?symbol=NVDA/);
  await expect(page.locator(".ci-page")).toBeVisible();
});

test("evidence receipts follow producer field lineage instead of guessing a source", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.endsWith("desktop"), "one desktop lineage contract is sufficient");
  await openCompanyIntelligence(page);
  const sourceRow = page.locator(".ci-receipt-row").filter({ hasText: "Source family" });

  await page.locator(".ci-stance-copy").click();
  await expect(sourceRow).toContainText("Earnings history");
  await expect(page.locator(".ci-evidence-note")).toContainText("normalized field is attributed");
  await expect(page.locator(".ci-evidence-note")).not.toContainText("pinned to the complete event document");

  await page.locator(".ci-metric").filter({ hasText: "Revenue growth" }).click();
  await expect(sourceRow).toContainText("Event analysis");
  await expect(page.locator(".ci-evidence-derived")).toContainText("DERIVED COMPARISON");
  await expect(page.locator(".ci-evidence-note")).toContainText("not attributed to this source alone");
});

test("theme context stays pinned to the latest event and makes its receipts inspectable", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.endsWith("desktop"), "one desktop semantic flow is sufficient");
  await openCompanyIntelligence(page);
  await page.getByLabel("Select company event").selectOption({ label: "Q4 FY2025 · 2026-02-19" });
  await expect(page.locator(".ci-theme-boundary")).toContainText("Pinned to the latest reported event");
  await page.getByRole("button", { name: "Use latest event" }).click();
  await expect(page.getByRole("heading", { name: "Curated basket context" })).toBeVisible();
  await page.getByRole("button", { name: "View receipts" }).last().click();
  await expect(page.locator(".ci-theme-receipts-panel")).toContainText("Latest event pin");
  await expect(page.locator(".ci-theme-receipts-panel")).toContainText("Context only");
});

test("general highlights are not relabelled as Constructive without explicit positive lineage", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.endsWith("desktop"), "one desktop semantic-label contract is sufficient");
  const fixture = contextFixture();
  fixture.latest_event.positive_highlights = [];
  fixture.latest_event.field_lineage.positive_highlights = [];
  await page.route("**/api/company-intelligence/NVDA**", async (route) => {
    await route.fulfill({ json: { ok: true, state: "ready", context: fixture } });
  });
  await page.goto("/analysis?symbol=NVDA&page=intelligence");
  const constructive = page.locator(".ci-change-columns > div").first();
  await expect(constructive).toContainText("no explicitly constructive highlight");
  await expect(constructive.locator(".ci-change-row")).toHaveCount(0);
});

test("Ask Mastermind hands off the current analysis ticker before opening a mounted Brain or routes to its Terminal host", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.endsWith("desktop"), "one desktop interaction contract is sufficient");
  await page.addInitScript(() => {
    const brainWindow = window as Window & {
      MMBrain?: { open: () => void };
      MM_BRAIN_CFG?: { symbol?: () => string };
    };
    // Simulates a singleton left behind by Terminal AAPL before the client
    // navigates to /analysis?symbol=NVDA.
    brainWindow.MM_BRAIN_CFG = { symbol: () => "AAPL" };
    brainWindow.MMBrain = {
      open: () => {
        document.documentElement.dataset.brainOpened = "true";
        document.documentElement.dataset.brainSymbol = brainWindow.MM_BRAIN_CFG?.symbol?.() ?? "";
      },
    };
  });
  await openCompanyIntelligence(page);
  await page.getByRole("button", { name: "Ask Mastermind" }).click();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.brainOpened)).toBe("true");
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.brainSymbol)).toBe("NVDA");

  await page.evaluate(() => { delete (window as Window & { MMBrain?: unknown }).MMBrain; });
  const terminalUrl = page.waitForURL((url) => url.pathname === "/terminal" && url.searchParams.get("symbol") === "NVDA" && url.searchParams.get("ai") === "1");
  await page.getByRole("button", { name: "Ask Mastermind" }).click();
  await terminalUrl;
});

test("Company Intelligence preserves its mobile workflow in Chinese", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.endsWith("mobile"), "one mobile bilingual contract is sufficient");
  await page.addInitScript(() => window.localStorage.setItem("mm.lang", "zh"));
  await page.route("**/api/company-intelligence/NVDA**", async (route) => {
    await route.fulfill({ json: { ok: true, state: "ready", context: contextFixture() } });
  });
  await routeThemeContext(page);
  await page.goto("/analysis?symbol=NVDA&page=intelligence");
  await expect(page.locator(".fin-tabs").getByRole("tab", { name: "公司情报", exact: true }))
    .toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".ci-hero").getByRole("button", { name: "查看凭证" })).toBeVisible();
  await expect(page.getByRole("button", { name: "询问 Mastermind" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "策展篮子背景" })).toBeVisible();
  await expect(page.locator(".ci-theme-card")).toContainText("代理映射");
  await expectNoDocumentOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath("mobile-company-intelligence-zh.png"),
    fullPage: false,
  });
});

test("transcript search copy switches cleanly between English and Chinese", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.endsWith("mobile"), "one mobile bilingual interaction contract is sufficient");
  await page.addInitScript(() => window.localStorage.setItem("mm.lang", "zh"));
  await openCompanyIntelligence(page, "公司情报");
  await page.locator(".ci-lenses").getByRole("tab", { name: "电话会", exact: true }).click();
  await expect(page.locator(".ci-ts-hero h3")).toHaveText("在电话会中找到准确出处");
  const search = page.locator(".ci-ts-search");
  await expect(search.getByRole("button", { name: "搜索准确短语" })).toBeVisible();
  await search.locator("input").fill("quantum bicycle");
  await search.getByRole("button", { name: "搜索准确短语" }).click();
  await expect(page.locator(".ci-ts-state.empty strong")).toHaveText("未找到精确命中");
  await expect(page.locator(".ci-ts-state.empty p")).toHaveText("已在选定事件中进行精确字面匹配；没有段落包含该短语。系统没有扩展、改写或推断关联内容。");
  await expectNoDocumentOverflow(page);
});
