import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import {
  __resetCompanyInstitutionalContextCacheForTests,
  getCompanyInstitutionalContext,
  normalizeCompanyInstitutionalContext,
  normalizeCompanyInstitutionalManifest,
  resolveCompanyInstitutionalContextFromR2,
} from "@/lib/companyInstitutionalContext";

const generation = "a".repeat(24);
const companyGeneration = "b".repeat(24);
const companyContextSha = "c".repeat(64);
const companyManifestSha = "d".repeat(64);
const latestEventId = "cie_d8488221fd8c710c53d6537d";

function context(status: "ready" | "partial" | "no_covered_holder" = "ready") {
  const covered = status !== "no_covered_holder";
  const warnings = status === "partial" ? ["history_coverage_incomplete"] : [];
  const positions = covered ? [
    {
      manager: "alpha", manager_name: "Alpha Capital", manager_style: "quality_growth", manager_grade: "A",
      action: "add", is_current_holder: true, value_usd: 12_000_000, book_weight_pct: 2.4,
      shares: 40_000, shares_change_pct: 25, period_end: "2026-03-31", filing_date: "2026-05-14",
      snapshot: { path: "data/smart_money/alpha/2026-03-31.parquet", sha256: "1".repeat(64), bytes: 2400 },
    },
    {
      manager: "beta", manager_name: "Beta Partners", manager_style: "value", manager_grade: "B+",
      action: "trim", is_current_holder: true, value_usd: 8_000_000, book_weight_pct: 1.2,
      shares: 20_000, shares_change_pct: -15, period_end: "2026-03-31", filing_date: "2026-05-15",
      snapshot: { path: "data/smart_money/beta/2026-03-31.parquet", sha256: "2".repeat(64), bytes: 2100 },
    },
  ] : [];
  return {
    schema: "company_institutional_context.v1", authority: "context_only", generated_at: "2026-08-01T12:00:00Z",
    generation_id: generation, status, company: { ticker: "NVDA" },
    company_intelligence: {
      generation_id: companyGeneration, context_sha256: companyContextSha,
      latest_event_id: latestEventId, latest_event_call_date: "2026-05-20",
    },
    period: {
      build_as_of: "2026-08-01", consensus_period: "2026-03-31", comparison_period: "2025-12-31",
      filing_window_closed_on: "2026-05-15", consensus_available_on: "2026-05-15", latest_reporting_filing_date: "2026-05-15",
    },
    coverage: {
      configured_manager_count: 3, active_manager_count: 2, closed_manager_count: 1,
      reporting_manager_count: 2, missing_manager_count: 0,
      comparison_reporting_manager_count: 2, comparison_missing_manager_count: 0,
      resolved_position_count: covered ? 2 : 0, unresolved_position_count: 0,
    },
    positions,
    consensus: {
      current_holder_count: covered ? 2 : 0, buyer_count: covered ? 1 : 0, trimmer_count: covered ? 1 : 0,
      exit_count: 0, unknown_move_count: 0, total_value_usd: covered ? 20_000_000 : 0,
      ownership_hhi: covered ? 0.52 : null, max_book_weight_pct: covered ? 2.4 : null, avg_book_weight_pct: covered ? 1.8 : null,
    },
    trend: {
      status: status === "partial" ? "insufficient_coverage" : "available",
      direction: status === "partial" ? null : covered ? "accumulating" : "stable",
      eligible_period_count: status === "partial" ? 1 : 2,
      periods: [
        { period_end: "2025-12-31", available_on: "2026-02-17", reporting_manager_count: 2, missing_manager_count: 0, holder_count: covered ? 1 : 0, total_value_usd: covered ? 12_000_000 : 0, eligible: true },
        status === "partial"
          ? { period_end: "2026-03-31", available_on: null, reporting_manager_count: 1, missing_manager_count: 1, holder_count: covered ? 2 : 0, total_value_usd: covered ? 20_000_000 : 0, eligible: false }
          : { period_end: "2026-03-31", available_on: "2026-05-15", reporting_manager_count: 2, missing_manager_count: 0, holder_count: covered ? 2 : 0, total_value_usd: covered ? 20_000_000 : 0, eligible: true },
      ],
    },
    warnings,
  };
}

function manifest(body: unknown = context()) {
  const wire = JSON.stringify(body);
  return {
    schema: "company_institutional_context_manifest.v1", generation_id: generation, generated_at: "2026-08-01T12:00:00Z",
    company_count: 1, covered_company_count: 1, position_record_count: 2, consensus_period: "2026-03-31",
    coverage: {
      configured_manager_count: 3, active_manager_count: 2, closed_manager_count: 1,
      reporting_manager_count: 2, missing_manager_count: 0,
      comparison_reporting_manager_count: 2, comparison_missing_manager_count: 0,
      resolved_position_count: 2, unresolved_position_count: 0,
    },
    source: {
      company_intelligence: { generation_id: companyGeneration, sha256: companyManifestSha },
      smart_money_config: { sha256: "3".repeat(64) }, share_class_equivalence: { sha256: "4".repeat(64) },
      universe_membership: { sha256: "5".repeat(64) },
      snapshot_index: { sha256: "6".repeat(64), snapshot_count: 8, manager_count: 2 },
      builder: "company_institutional_context.v1",
    },
    files: { "companies/NVDA.json": { sha256: createHash("sha256").update(wire).digest("hex"), bytes: Buffer.byteLength(wire) } },
    status: "ready", warnings: [],
  };
}

const expected = {
  generation_id: companyGeneration, latest_event_id: latestEventId, latest_event_call_date: "2026-05-20",
  context_sha256: companyContextSha, manifest_sha256: companyManifestSha,
};

let originalFetch: typeof globalThis.fetch;
let calls: string[];
function install(upstream: (url: string) => Response | Promise<Response>) {
  globalThis.fetch = vi.fn(async (url: string) => {
    calls.push(String(url));
    return upstream(String(url));
  }) as unknown as typeof globalThis.fetch;
}

beforeEach(() => { originalFetch = globalThis.fetch; calls = []; });
afterEach(() => {
  globalThis.fetch = originalFetch;
  __resetCompanyInstitutionalContextCacheForTests();
  vi.restoreAllMocks();
});

describe("company institutional context normalizer", () => {
  it("accepts the closed context-only contract and rejects signal-shaped extras", () => {
    expect(normalizeCompanyInstitutionalContext(context(), "NVDA", generation)).toMatchObject({
      is_context_only: true, consensus: { current_holder_count: 2 }, trend: { direction: "accumulating" },
    });
    const unsafe = context() as ReturnType<typeof context> & { score?: number };
    unsafe.score = 92;
    expect(normalizeCompanyInstitutionalContext(unsafe, "NVDA", generation)).toBeNull();
    const authority = context(); authority.authority = "actionable";
    expect(normalizeCompanyInstitutionalContext(authority, "NVDA", generation)).toBeNull();
  });

  it("keeps no-holder coverage distinct and refuses future filings", () => {
    expect(normalizeCompanyInstitutionalContext(context("no_covered_holder"), "NVDA", generation)?.status).toBe("no_covered_holder");
    const future = context(); future.positions[0].filing_date = "2026-08-02";
    expect(normalizeCompanyInstitutionalContext(future, "NVDA", generation)).toBeNull();
  });

  it("recomputes consensus aggregates and trend direction instead of trusting labels", () => {
    const badTotal = context(); badTotal.consensus.total_value_usd = 20_000_001;
    expect(normalizeCompanyInstitutionalContext(badTotal, "NVDA", generation)).toBeNull();
    const badHhi = context(); badHhi.consensus.ownership_hhi = 0.9;
    expect(normalizeCompanyInstitutionalContext(badHhi, "NVDA", generation)).toBeNull();
    const badDirection = context(); badDirection.trend.direction = "distributing";
    expect(normalizeCompanyInstitutionalContext(badDirection, "NVDA", generation)).toBeNull();
    const mixedQuarter = context(); mixedQuarter.positions[0].period_end = "2025-12-31";
    expect(normalizeCompanyInstitutionalContext(mixedQuarter, "NVDA", generation)).toBeNull();
  });

  it("validates the global manifest and every safe company receipt", () => {
    expect(normalizeCompanyInstitutionalManifest(manifest())?.files["companies/NVDA.json"].bytes).toBeGreaterThan(0);
    const traversal = manifest() as unknown as { files: Record<string, { sha256: string; bytes: number }> };
    traversal.files = { "companies/NVDA.json?next=bad": { sha256: "a".repeat(64), bytes: 1 } };
    expect(normalizeCompanyInstitutionalManifest(traversal)).toBeNull();
  });
});

describe("company institutional R2 verification", () => {
  it("proves root, immutable manifest, object receipt, and Company Intelligence lineage", async () => {
    const body = context();
    const root = manifest(body);
    install((url) => {
      if (url.endsWith("/company_institutional_context/manifest.json")) return new Response(JSON.stringify(root));
      if (url.endsWith(`/generations/${generation}/manifest.json`)) return new Response(JSON.stringify(root));
      if (url.endsWith(`/generations/${generation}/companies/NVDA.json`)) return new Response(JSON.stringify(body));
      return new Response("missing", { status: 404 });
    });
    await expect(resolveCompanyInstitutionalContextFromR2(
      "NVDA", "https://pub-f7ffb4441c5f4ad983ca56ec7c651c61.r2.dev", { expectedCompanyIntelligence: expected },
    )).resolves.toMatchObject({ ok: true, state: "ready", context: { is_context_only: true } });
    expect(calls).toHaveLength(3);
  });

  it("refuses immutable-manifest drift and exact CI receipt drift before reading a company object", async () => {
    const root = manifest();
    const immutable = { ...root, generated_at: "2026-08-01T12:01:00Z" };
    install((url) => new Response(JSON.stringify(url.includes(`/generations/${generation}/manifest.json`) ? immutable : root)));
    await expect(resolveCompanyInstitutionalContextFromR2(
      "NVDA", "https://pub-f7ffb4441c5f4ad983ca56ec7c651c61.r2.dev", { expectedCompanyIntelligence: expected },
    )).resolves.toMatchObject({ ok: false, error: { code: "invalid_payload" } });
    expect(calls).toHaveLength(2);

    __resetCompanyInstitutionalContextCacheForTests();
    calls = [];
    install(() => new Response(JSON.stringify(root)));
    await expect(resolveCompanyInstitutionalContextFromR2(
      "NVDA", "https://pub-f7ffb4441c5f4ad983ca56ec7c651c61.r2.dev",
      { expectedCompanyIntelligence: { ...expected, manifest_sha256: "9".repeat(64) } },
    )).resolves.toMatchObject({ ok: false, error: { code: "invalid_payload" } });
    expect(calls).toHaveLength(2);
  });

  it("serves stale only while the complete CI lineage still matches", async () => {
    let now = 1_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const body = context(); const root = manifest(body);
    install((url) => new Response(JSON.stringify(url.endsWith("companies/NVDA.json") ? body : root)));
    await expect(resolveCompanyInstitutionalContextFromR2(
      "NVDA", "https://pub-f7ffb4441c5f4ad983ca56ec7c651c61.r2.dev", { expectedCompanyIntelligence: expected },
    )).resolves.toMatchObject({ ok: true, state: "ready" });
    now += 31_000;
    install(() => new Response("down", { status: 503 }));
    await expect(resolveCompanyInstitutionalContextFromR2(
      "NVDA", "https://pub-f7ffb4441c5f4ad983ca56ec7c651c61.r2.dev", { expectedCompanyIntelligence: expected },
    )).resolves.toMatchObject({ ok: true, state: "stale" });
    await expect(resolveCompanyInstitutionalContextFromR2(
      "NVDA", "https://pub-f7ffb4441c5f4ad983ca56ec7c651c61.r2.dev",
      { expectedCompanyIntelligence: { ...expected, context_sha256: "8".repeat(64) } },
    )).resolves.toMatchObject({ ok: false, error: { code: "upstream_unavailable" } });
  });

  it("never widens the trusted R2 origin", async () => {
    install(() => new Response("unexpected"));
    await expect(resolveCompanyInstitutionalContextFromR2("NVDA", "https://example.invalid"))
      .resolves.toMatchObject({ ok: false, error: { code: "upstream_unavailable" } });
    expect(calls).toHaveLength(0);
  });
});

describe("company institutional browser client", () => {
  it("uses a same-origin no-store BFF", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ ok: true, state: "ready", context: context() })));
    await expect(getCompanyInstitutionalContext("nvda", { retryNonce: 9 })).resolves.toMatchObject({ ok: true, state: "ready" });
    expect(fetchSpy).toHaveBeenCalledWith("/api/company-institutional-context/NVDA?retry=9", expect.objectContaining({ cache: "no-store" }));
  });
});
