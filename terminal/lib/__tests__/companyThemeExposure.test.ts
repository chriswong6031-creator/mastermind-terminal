import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import {
  __resetCompanyThemeExposureCacheForTests,
  getCompanyThemeExposure,
  normalizeCompanyThemeExposure,
  normalizeCompanyThemeExposureManifest,
  resolveCompanyThemeExposureFromR2,
} from "@/lib/companyThemeExposure";

const generation = "a".repeat(24);
const companyGeneration = "b".repeat(24);

function context(ticker = "NVDA", status: "ready" | "partial" = "ready") {
  return {
    schema: "company_theme_exposure.v1",
    authority: "context_only",
    generated_at: "2026-08-01T12:00:00Z",
    generation_id: generation,
    status,
    company: { ticker },
    company_intelligence: {
      generation_id: companyGeneration,
      context_sha256: "c".repeat(64),
      latest_event_id: `${ticker}-2026Q1`,
      latest_event_call_date: "2026-05-28",
    },
    exposures: [{ theme_id: "ai_infrastructure", name_en: "AI Infrastructure", name_zh: "人工智能基础设施", basket_id: "ai_semiconductors", mapping_qualifier: "proxy" }],
    coverage: { status: "mapped", active_basket_count: 1, mapped_basket_count: 1, unmapped_basket_count: 0 },
    theme_state: { status: "fresh", as_of: "2026-08-01", sha256: "d".repeat(64) },
    warnings: status === "partial" ? ["theme_state_stale"] : [],
  };
}

function manifest(body: unknown = context()) {
  const wire = JSON.stringify(body);
  return {
    schema: "company_theme_exposure_manifest.v1",
    generation_id: generation,
    generated_at: "2026-08-01T12:00:00Z",
    company_count: 1,
    exposure_count: 1,
    coverage: {
      active_membership_count: 1,
      mapped_membership_count: 1,
      unmapped_membership_count: 0,
      active_member_ticker_count: 1,
      unmapped_only_ticker_count: 0,
      active_member_tickers_without_company_context: 0,
    },
    source: {
      company_intelligence: { generation_id: companyGeneration, sha256: "e".repeat(64) },
      membership: { sha256: "f".repeat(64) },
      crosswalk: { sha256: "1".repeat(64) },
      theme_state: { status: "fresh", as_of: "2026-08-01", sha256: "d".repeat(64) },
      builder: "company_theme_exposure.v1",
    },
    files: { "companies/NVDA.json": { sha256: createHash("sha256").update(wire).digest("hex"), bytes: Buffer.byteLength(wire) } },
    status: "ready",
    warnings: [],
  };
}

let realFetch: typeof globalThis.fetch;
let calls: string[];

function install(upstream: (url: string) => Response | Promise<Response>) {
  globalThis.fetch = vi.fn(async (url: string) => {
    calls.push(String(url));
    return upstream(String(url));
  }) as unknown as typeof globalThis.fetch;
}

beforeEach(() => {
  realFetch = globalThis.fetch;
  calls = [];
});

afterEach(() => {
  globalThis.fetch = realFetch;
  __resetCompanyThemeExposureCacheForTests();
  vi.restoreAllMocks();
});

describe("company theme exposure normalizer", () => {
  it("accepts only a closed context-only membership projection", () => {
    expect(normalizeCompanyThemeExposure(context(), "NVDA", generation)).toMatchObject({
      is_context_only: true,
      exposures: [{ mapping_qualifier: "proxy" }],
    });
    const unsafe = context() as ReturnType<typeof context> & { score?: number };
    unsafe.score = 99;
    expect(normalizeCompanyThemeExposure(unsafe, "NVDA", generation)).toBeNull();
    const causal = context();
    causal.authority = "actionable";
    expect(normalizeCompanyThemeExposure(causal, "NVDA", generation)).toBeNull();
  });

  it("keeps mapped, unmapped-only, and no-membership coverage distinct", () => {
    const unmappedOnly = context();
    unmappedOnly.exposures = [];
    unmappedOnly.coverage = { status: "unmapped_only", active_basket_count: 2, mapped_basket_count: 0, unmapped_basket_count: 2 };
    unmappedOnly.status = "partial";
    unmappedOnly.warnings = ["active_membership_unmapped"];
    expect(normalizeCompanyThemeExposure(unmappedOnly, "NVDA", generation)?.coverage.status).toBe("unmapped_only");

    const none = context();
    none.exposures = [];
    none.coverage = { status: "no_active_membership", active_basket_count: 0, mapped_basket_count: 0, unmapped_basket_count: 0 };
    expect(normalizeCompanyThemeExposure(none, "NVDA", generation)?.coverage.status).toBe("no_active_membership");
  });

  it("requires manifest global coverage and every safe company path", () => {
    expect(normalizeCompanyThemeExposureManifest(manifest())?.files["companies/NVDA.json"].bytes).toBeGreaterThan(0);
    const traversal = manifest() as unknown as { files: Record<string, { sha256: string; bytes: number }> };
    traversal.files = { "companies/NVDA.json?next=bad": { sha256: "a".repeat(64), bytes: 1 } };
    expect(normalizeCompanyThemeExposureManifest(traversal)).toBeNull();
    const unaccounted = manifest() as ReturnType<typeof manifest>;
    unaccounted.coverage.active_membership_count = 2;
    expect(normalizeCompanyThemeExposureManifest(unaccounted)).toBeNull();
  });
});

describe("company theme exposure R2 verification", () => {
  it("proves marker then immutable manifest then object receipt", async () => {
    const body = context();
    const root = manifest(body);
    install((url) => {
      if (url.endsWith("/company_theme_exposure/manifest.json")) return new Response(JSON.stringify(root));
      if (url.endsWith(`/company_theme_exposure/generations/${generation}/manifest.json`)) return new Response(JSON.stringify(root));
      if (url.endsWith(`/company_theme_exposure/generations/${generation}/companies/NVDA.json`)) return new Response(JSON.stringify(body));
      return new Response("missing", { status: 404 });
    });
    const result = await resolveCompanyThemeExposureFromR2("NVDA", "https://pub-f7ffb4441c5f4ad983ca56ec7c651c61.r2.dev");
    expect(result).toMatchObject({ ok: true, state: "ready", context: { is_context_only: true, company: { ticker: "NVDA" } } });
    expect(calls).toEqual(expect.arrayContaining([
      expect.stringMatching(/company_theme_exposure\/manifest\.json$/),
      expect.stringMatching(new RegExp(`generations/${generation}/manifest\\.json$`)),
      expect.stringMatching(new RegExp(`generations/${generation}/companies/NVDA\\.json$`)),
    ]));
  });

  it("refuses a non-identical immutable manifest before reading a company object", async () => {
    const root = manifest();
    const immutable = { ...root, generated_at: "2026-08-01T12:01:00Z" };
    install((url) => new Response(JSON.stringify(url.endsWith(`/generations/${generation}/manifest.json`) ? immutable : root)));
    const result = await resolveCompanyThemeExposureFromR2("NVDA", "https://pub-f7ffb4441c5f4ad983ca56ec7c651c61.r2.dev");
    expect(result).toMatchObject({ ok: false, error: { code: "invalid_payload" } });
    expect(calls).toHaveLength(2);
  });

  it("never widens the trusted R2 origin and validates object bytes", async () => {
    install(() => new Response("unexpected"));
    expect(await resolveCompanyThemeExposureFromR2("NVDA", "https://example.invalid")).toMatchObject({ ok: false, error: { code: "upstream_unavailable" } });
    expect(calls).toHaveLength(0);

    const body = context();
    const root = manifest(body);
    install((url) => new Response(JSON.stringify(url.endsWith("companies/NVDA.json") ? { ...body, company: { ticker: "AAPL" } } : root)));
    expect(await resolveCompanyThemeExposureFromR2("NVDA", "https://pub-f7ffb4441c5f4ad983ca56ec7c651c61.r2.dev")).toMatchObject({ ok: false, error: { code: "invalid_payload" } });
  });

  it("binds the company object to manifest and current Company Intelligence lineage", async () => {
    const body = context();
    body.company_intelligence.generation_id = "7".repeat(24);
    const root = manifest(body);
    install((url) => new Response(JSON.stringify(url.endsWith("companies/NVDA.json") ? body : root)));
    await expect(resolveCompanyThemeExposureFromR2(
      "NVDA",
      "https://pub-f7ffb4441c5f4ad983ca56ec7c651c61.r2.dev",
      { expectedCompanyIntelligence: { generation_id: companyGeneration, latest_event_id: "NVDA-2026Q1" } },
    )).resolves.toMatchObject({ ok: false, error: { code: "invalid_payload" } });

    __resetCompanyThemeExposureCacheForTests();
    calls = [];
    const aligned = context();
    const alignedRoot = manifest(aligned);
    install((url) => new Response(JSON.stringify(url.endsWith("companies/NVDA.json") ? aligned : alignedRoot)));
    await expect(resolveCompanyThemeExposureFromR2(
      "NVDA",
      "https://pub-f7ffb4441c5f4ad983ca56ec7c651c61.r2.dev",
      { expectedCompanyIntelligence: { generation_id: companyGeneration, latest_event_id: "NVDA-2025Q4" } },
    )).resolves.toMatchObject({ ok: false, error: { code: "invalid_payload" } });
  });

  it("requires matching generation timestamp and theme-state receipt", async () => {
    const body = context();
    body.generated_at = "2026-08-01T12:01:00Z";
    const root = manifest(body);
    root.generated_at = "2026-08-01T12:00:00Z";
    install((url) => new Response(JSON.stringify(url.endsWith("companies/NVDA.json") ? body : root)));
    await expect(resolveCompanyThemeExposureFromR2("NVDA", "https://pub-f7ffb4441c5f4ad983ca56ec7c651c61.r2.dev"))
      .resolves.toMatchObject({ ok: false, error: { code: "invalid_payload" } });

    __resetCompanyThemeExposureCacheForTests();
    calls = [];
    const receiptMismatch = context();
    receiptMismatch.theme_state.sha256 = "2".repeat(64);
    const receiptRoot = manifest(receiptMismatch);
    install((url) => new Response(JSON.stringify(url.endsWith("companies/NVDA.json") ? receiptMismatch : receiptRoot)));
    await expect(resolveCompanyThemeExposureFromR2("NVDA", "https://pub-f7ffb4441c5f4ad983ca56ec7c651c61.r2.dev"))
      .resolves.toMatchObject({ ok: false, error: { code: "invalid_payload" } });
  });

  it("serves a stale fallback only while its Company Intelligence lineage still matches", async () => {
    let now = 1_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const body = context();
    const root = manifest(body);
    install((url) => new Response(JSON.stringify(url.endsWith("companies/NVDA.json") ? body : root)));
    await expect(resolveCompanyThemeExposureFromR2(
      "NVDA",
      "https://pub-f7ffb4441c5f4ad983ca56ec7c651c61.r2.dev",
      { expectedCompanyIntelligence: { generation_id: companyGeneration, latest_event_id: "NVDA-2026Q1" } },
    )).resolves.toMatchObject({ ok: true, state: "ready" });

    now += 31_000;
    install(() => new Response("upstream down", { status: 503 }));
    await expect(resolveCompanyThemeExposureFromR2(
      "NVDA",
      "https://pub-f7ffb4441c5f4ad983ca56ec7c651c61.r2.dev",
      { expectedCompanyIntelligence: { generation_id: companyGeneration, latest_event_id: "NVDA-2026Q1" } },
    )).resolves.toMatchObject({ ok: true, state: "stale" });
    await expect(resolveCompanyThemeExposureFromR2(
      "NVDA",
      "https://pub-f7ffb4441c5f4ad983ca56ec7c651c61.r2.dev",
      { expectedCompanyIntelligence: { generation_id: companyGeneration, latest_event_id: "NVDA-2025Q4" } },
    )).resolves.toMatchObject({ ok: false, error: { code: "upstream_unavailable" } });
  });
});

describe("company theme exposure browser client", () => {
  it("uses a same-origin no-store BFF", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ ok: true, state: "ready", context: context() })));
    const result = await getCompanyThemeExposure("nvda", { retryNonce: 8 });
    expect(result).toMatchObject({ ok: true, state: "ready" });
    expect(fetchSpy).toHaveBeenCalledWith("/api/company-theme-context/NVDA?retry=8", expect.objectContaining({ cache: "no-store" }));
  });
});
