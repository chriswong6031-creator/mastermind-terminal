import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __resetCompanyIntelligenceCacheForTests,
  getCompanyIntelligence,
  isCompanyIntelligenceSymbol,
  isSafeCompanyIntelligenceSourceUrl,
  normalizeCompanyIntelligence,
  normalizeCompanyIntelligenceManifest,
} from "@/lib/companyIntelligence";

const metrics = () => ({
  sentiment: null, performance: null, confidence: null, combined: null,
  call_positivity: null, management_confidence: null, analyst_criticism: null, future_outlook: null,
  revenue_growth_pct: null, eps_growth_pct: null, gross_margin_pct: null, analysts_count: null, questions_count: null,
});

const event = (ticker = "NVDA", id = "NVDA-2026Q1") => ({
  event_id: id,
  ticker,
  fiscal_year: 2026,
  fiscal_quarter: 1,
  call_date: "2026-05-28",
  summary: "Demand remained broad.",
  highlights: ["Data center demand remained broad."],
  positive_highlights: ["Revenue grew."],
  negative_highlights: ["Supply remains constrained."],
  key_quote: null,
  tags: ["demand"],
  metrics: metrics(),
  field_lineage: {
    summary: "earnings_history",
    key_quote: null,
    metrics: Object.fromEntries(Object.keys(metrics()).map((key) => [key, null])),
    positive_highlights: ["earnings_history"],
    negative_highlights: ["earnings_history"],
    highlights: ["earnings_history"],
    tags: { demand: "earnings_history" },
  },
  previous_event_deltas: metrics(),
  sources: [
    {
      source_ref: "earnings_history",
      kind: "earnings_history",
      status: "metadata_only",
      citation_precision: "metadata",
      url: null,
      receipt: { source_hash: "a".repeat(64), source_date: "2026-05-28", record_id: "NVDA-2026Q1" },
    },
    {
      source_ref: "transcript",
      kind: "transcript",
      status: "present",
      citation_precision: "document",
      url: "/data/tx/NVDA/2026Q1.json.gz",
      receipt: { source_hash: "b".repeat(64), source_date: "2026-05-28", record_id: "2026Q1" },
    },
  ],
  claim_citations_pending: true,
});

export const context = (ticker = "NVDA", generation = "a".repeat(24)) => ({
  schema: "company_intelligence_context.v1",
  authority: "context_only",
  generated_at: "2026-08-01T12:00:00Z",
  generation_id: generation,
  company: { ticker, display_name: "NVIDIA Corporation", exchange: null },
  status: "ready",
  latest_event_id: "NVDA-2026Q1",
  latest_event: event(ticker),
  history: [event(ticker)],
  topics: {
    timeline: [{ tag: "demand", first_event_id: "NVDA-2026Q1", last_event_id: "NVDA-2026Q1", event_count: 1, status: "added" }],
    added: ["demand"], dropped: [], persistent: [],
  },
  source_completeness: {
    earnings_history: { status: "present", event_count: 1 },
    score_overlay: { status: "missing", event_count: 0 },
    transcripts: { status: "present", event_count: 1 },
  },
  warnings: [],
  missing_sources: [],
  transport_lineage: {
    earnings_manifest: { generation_id: "b".repeat(24), sha256: "b".repeat(64) },
    tx_index: { schema: "mastermind.tx-index/v1", generation_id: "c".repeat(24), sha256: "c".repeat(64) },
    builder: "company_intelligence.v1",
  },
});

export const manifest = (generation = "a".repeat(24)) => ({
  schema: "company_intelligence_manifest.v1",
  generation_id: generation,
  generated_at: "2026-08-01T12:00:00Z",
  company_count: 1,
  event_count: 1,
  latest_event_date: "2026-05-28",
  source: {
    earnings_manifest: {
      generation_id: "b".repeat(24),
      observed_counts: { history_rows: 1, history_tickers: 1, score_rows: 0, score_tickers: 0 },
      sha256: "b".repeat(64),
    },
    tx_index: { schema: "mastermind.tx-index/v1", generation_id: "c".repeat(24), sha256: "c".repeat(64) },
  },
  files: { "companies/NVDA.json": { sha256: "d".repeat(64), bytes: 2048 } },
  status: "ready",
  warnings: [],
  operational: { history_rows_rejected: 0 },
});

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

afterEach(() => {
  __resetCompanyIntelligenceCacheForTests();
  vi.restoreAllMocks();
});

describe("company intelligence normalizer", () => {
  it("rejects path traversal, encoded slash and query/hash-looking ticker inputs", () => {
    for (const value of ["NVDA/../../secret", "NVDA%2Fsecret", "NVDA?next=x", "NVDA#x", "..", "A\\B", "NVDA_"]) {
      expect(isCompanyIntelligenceSymbol(value), value).toBe(false);
    }
    expect(isCompanyIntelligenceSymbol("BRK.B")).toBe(true);
    expect(isCompanyIntelligenceSymbol("RDS-A")).toBe(true);
  });

  it("accepts only HTTPS or the local transcript archive for source links", () => {
    expect(isSafeCompanyIntelligenceSourceUrl("https://example.com/transcript?id=1")).toBe(true);
    expect(isSafeCompanyIntelligenceSourceUrl("/data/tx/NVDA/2026Q1.json.gz")).toBe(true);
    for (const value of ["http://example.com", "javascript:alert(1)", "//example.com/x", "/data/tx/../admin", "/other/file", "https://u:p@example.com"]) {
      expect(isSafeCompanyIntelligenceSourceUrl(value), value).toBe(false);
    }
  });

  it("rejects wrong authority, foreign identity, duplicate IDs and oversized content", () => {
    const authority = context(); authority.authority = "actionable";
    expect(normalizeCompanyIntelligence(authority, "NVDA")).toBeNull();

    const foreign = context(); foreign.company.ticker = "AAPL";
    expect(normalizeCompanyIntelligence(foreign, "NVDA")).toBeNull();

    const duplicate = context(); duplicate.history.push(clone(duplicate.history[0]));
    expect(normalizeCompanyIntelligence(duplicate, "NVDA")).toBeNull();

    const tooMany = context();
    tooMany.history = Array.from({ length: 13 }, (_, i) => event("NVDA", `NVDA-${i}`));
    expect(normalizeCompanyIntelligence(tooMany, "NVDA")).toBeNull();

    const tooLong = context(); tooLong.history[0].summary = "x".repeat(8_001);
    tooLong.latest_event.summary = "x".repeat(8_001);
    expect(normalizeCompanyIntelligence(tooLong, "NVDA")).toBeNull();
  });

  it("accepts the producer's metadata-only score-overlay completeness state", () => {
    const raw = context();
    raw.source_completeness.score_overlay = { status: "metadata_only", event_count: 1 };

    expect(normalizeCompanyIntelligence(raw, "NVDA")?.source_completeness.score_overlay)
      .toEqual({ status: "metadata_only", event_count: 1 });
  });

  it("accepts the producer's partial earnings-history completeness state", () => {
    const raw = context();
    raw.source_completeness.earnings_history = { status: "partial", event_count: 1 };

    expect(normalizeCompanyIntelligence(raw, "NVDA")?.source_completeness.earnings_history)
      .toEqual({ status: "partial", event_count: 1 });
  });

  it("does not pass raw objects or unsafe source URLs through", () => {
    const raw = context() as ReturnType<typeof context> & { untrusted?: string };
    raw.untrusted = "<script>";
    raw.history[0].sources[0].url = "javascript:alert(1)";
    raw.latest_event.sources[0].url = "javascript:alert(1)";
    expect(normalizeCompanyIntelligence(raw, "NVDA")).toBeNull();

    const clean = context() as ReturnType<typeof context> & { untrusted?: string };
    clean.untrusted = "<script>";
    const normalized = normalizeCompanyIntelligence(clean, "NVDA");
    expect(normalized).not.toBeNull();
    expect(normalized).not.toBe(clean);
    expect(normalized).not.toHaveProperty("untrusted");
    clean.history[0].highlights[0] = "mutated after validation";
    expect(normalized?.history[0].highlights[0]).toBe("Data center demand remained broad.");
  });

  it("preserves exact field lineage and rejects guessed or unresolved attribution", () => {
    const normalized = normalizeCompanyIntelligence(context(), "NVDA");
    expect(normalized?.history[0].field_lineage.summary).toBe("earnings_history");
    expect(normalized?.history[0].sources[0].source_ref).toBe("earnings_history");

    const unresolved = context();
    unresolved.history[0].field_lineage.summary = "score_overlay";
    unresolved.latest_event.field_lineage.summary = "score_overlay";
    expect(normalizeCompanyIntelligence(unresolved, "NVDA")).toBeNull();

    const mismatchedSource = context();
    mismatchedSource.history[0].sources[0].source_ref = "score_overlay";
    mismatchedSource.latest_event.sources[0].source_ref = "score_overlay";
    expect(normalizeCompanyIntelligence(mismatchedSource, "NVDA")).toBeNull();

    const populatedWithoutLineage = context() as any;
    populatedWithoutLineage.history[0].metrics.revenue_growth_pct = 12;
    populatedWithoutLineage.latest_event.metrics.revenue_growth_pct = 12;
    expect(normalizeCompanyIntelligence(populatedWithoutLineage, "NVDA")).toBeNull();
  });

  it("preserves a valid timestamp receipt date while rejecting malformed receipts", () => {
    const raw = context();
    raw.history[0].sources[0].receipt.source_date = "2026-05-28T21:30:00Z";
    raw.latest_event.sources[0].receipt.source_date = "2026-05-28T21:30:00Z";
    expect(normalizeCompanyIntelligence(raw, "NVDA")?.history[0].sources[0].receipt?.source_date)
      .toBe("2026-05-28T21:30:00Z");

    const uppercaseHash = context();
    uppercaseHash.history[0].sources[0].receipt.source_hash = "A".repeat(64);
    uppercaseHash.latest_event.sources[0].receipt.source_hash = "A".repeat(64);
    expect(normalizeCompanyIntelligence(uppercaseHash, "NVDA")).toBeNull();

    const presentWithoutDocument = context();
    presentWithoutDocument.history[0].sources[0].status = "present";
    presentWithoutDocument.latest_event.sources[0].status = "present";
    expect(normalizeCompanyIntelligence(presentWithoutDocument, "NVDA")).toBeNull();
  });

  it("validates every manifest file path and immutable generation ID", () => {
    expect(normalizeCompanyIntelligenceManifest(manifest())?.files["companies/NVDA.json"].bytes).toBe(2048);
    const traversal = manifest() as ReturnType<typeof manifest> & { generation_id: string };
    traversal.generation_id = "gen/../../other";
    expect(normalizeCompanyIntelligenceManifest(traversal)).toBeNull();
    const badFile = manifest() as unknown as { files: Record<string, { sha256: string; bytes: number }> };
    badFile.files = { "companies/NVDA.json?next=secret": { sha256: "d".repeat(64), bytes: 1 } };
    expect(normalizeCompanyIntelligenceManifest(badFile)).toBeNull();
  });
});

describe("company intelligence browser client", () => {
  it("uses a same-origin, no-store BFF request and returns the discriminated response", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      ok: true, state: "ready", context: context(),
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const result = await getCompanyIntelligence("nvda", { retryNonce: 7 });
    expect(result.ok && result.state).toBe("ready");
    expect(fetchSpy).toHaveBeenCalledWith("/api/company-intelligence/NVDA?retry=7", expect.objectContaining({ cache: "no-store" }));
  });

  it("never asks the BFF for an unsafe ticker", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await getCompanyIntelligence("NVDA%2Fsecret");
    expect(result).toMatchObject({ ok: false, state: "error", error: { code: "invalid_symbol" } });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
