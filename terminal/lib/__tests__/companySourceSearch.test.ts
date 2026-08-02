import { afterEach, describe, expect, it, vi } from "vitest";
import {
  browserCompanySourceSearchAdapter,
  createFixtureCompanySourceSearchAdapter,
  normalizeCompanySourceSearchResult,
  normalizeTranscriptLiteralPhrase,
} from "../companySourceSearch";

const SHA = "a".repeat(64);

function envelope(overrides: Record<string, unknown> = {}) {
  return {
    schema: "mastermind.company-source-search/v1",
    state: "ready",
    ticker: "NVDA",
    query: "data center",
    corpus_revision: "revision-20260801-test",
    searched_event_ids: ["NVDA-2026Q1"],
    spans: [{
      span_id: "span:NVDA-2026Q1:3:0:11",
      event_id: "NVDA-2026Q1",
      transcript_id: "2026Q1",
      ticker: "NVDA",
      document_sha256: SHA,
      segment_index: 3,
      char_start: 0,
      char_end: 11,
      speaker: "Example Speaker",
      role: "Chief Executive Officer",
      section: "prepared",
      excerpt: "Data center demand was discussed in the call.",
      matched_text: "Data center",
      receipt: {
        revision_id: "revision-20260801-test",
        document_sha256: SHA,
        indexed_at: "2026-08-01T12:00:00Z",
        source_label: "Verified transcript corpus",
        source_url: "/data/tx/NVDA/2026Q1.json.gz",
        verification: "verified",
      },
    }],
    ...overrides,
  };
}

afterEach(() => vi.restoreAllMocks());

describe("exact transcript search boundary", () => {
  it("keeps quoted phrases literal instead of becoming a query language", () => {
    expect(normalizeTranscriptLiteralPhrase('  "data   center"  ')).toBe("data center");
    expect(normalizeTranscriptLiteralPhrase("'data center'")).toBe("data center");
    expect(normalizeTranscriptLiteralPhrase("   ")).toBeNull();
  });

  it("accepts only a span that is bound to its exact document revision", () => {
    const normalized = normalizeCompanySourceSearchResult(envelope(), "NVDA", "data center");
    expect(normalized).toMatchObject({ state: "ready", ticker: "NVDA", query: "data center" });

    const wrongHash = envelope();
    (wrongHash.spans as Array<Record<string, unknown>>)[0].receipt = {
      ...(wrongHash.spans as Array<Record<string, unknown>>)[0].receipt as Record<string, unknown>,
      document_sha256: "b".repeat(64),
    };
    expect(normalizeCompanySourceSearchResult(wrongHash, "NVDA", "data center")).toBeNull();

    const expanded = envelope();
    (expanded.spans as Array<Record<string, unknown>>)[0].matched_text = "demand";
    expect(normalizeCompanySourceSearchResult(expanded, "NVDA", "data center")).toBeNull();

    const stale = envelope({ state: "stale_revision", message: "The source document changed after indexing." });
    ((stale.spans as Array<Record<string, unknown>>)[0].receipt as Record<string, unknown>).verification = "stale_revision";
    expect(normalizeCompanySourceSearchResult(stale, "NVDA", "data center")).toMatchObject({ state: "stale_revision" });

    const mixedRevision = envelope();
    ((mixedRevision.spans as Array<Record<string, unknown>>)[0].receipt as Record<string, unknown>).revision_id = "another-revision-20260801";
    expect(normalizeCompanySourceSearchResult(mixedRevision, "NVDA", "data center")).toBeNull();
  });

  it("treats a missing future producer route as not covered, not an empty search", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("missing", { status: 404 }));
    await expect(browserCompanySourceSearchAdapter.search({
      ticker: "NVDA",
      phrase: "data center",
      event_ids: ["NVDA-2026Q1"],
    })).resolves.toMatchObject({ state: "not_covered", ticker: "NVDA" });
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/api/company-source-search/NVDA?"),
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("keeps fixture content quarantined behind a deterministic adapter seam", async () => {
    const adapter = createFixtureCompanySourceSearchAdapter();
    const searched = await adapter.search({
      ticker: "NVDA",
      phrase: "data center",
      event_ids: ["NVDA-2026Q1"],
    });
    expect(searched.state).toBe("ready");
    if (searched.state === "ready") {
      expect(searched.spans).toHaveLength(2);
      expect(searched.spans[0].receipt.source_label).toContain("fixture");
    }

    const compared = await adapter.compare({
      ticker: "NVDA",
      phrase: "data center",
      event_ids: ["NVDA-2025Q4", "NVDA-2026Q1"],
      left_event_id: "NVDA-2025Q4",
      right_event_id: "NVDA-2026Q1",
    });
    expect(compared.state).toBe("ready");
    if (compared.state === "ready") expect(new Set(compared.spans.map((span) => span.event_id))).toEqual(new Set(["NVDA-2025Q4", "NVDA-2026Q1"]));
  });
});
