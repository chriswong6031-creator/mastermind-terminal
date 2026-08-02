import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { __resetCompanyThemeExposureCacheForTests } from "@/lib/companyThemeExposure";
import { GET } from "@/app/api/company-theme-context/[symbol]/route";

const generation = "a".repeat(24);
const body = {
  schema: "company_theme_exposure.v1", authority: "context_only", generated_at: "2026-08-01T12:00:00Z", generation_id: generation, status: "ready",
  company: { ticker: "NVDA" },
  company_intelligence: { generation_id: "b".repeat(24), context_sha256: "c".repeat(64), latest_event_id: "NVDA-2026Q1", latest_event_call_date: "2026-05-28" },
  exposures: [{ theme_id: "ai_infrastructure", name_en: "AI Infrastructure", name_zh: "人工智能基础设施", basket_id: "ai_semiconductors", mapping_qualifier: "proxy" }],
  coverage: { status: "mapped", active_basket_count: 1, mapped_basket_count: 1, unmapped_basket_count: 0 },
  theme_state: { status: "fresh", as_of: "2026-08-01", sha256: "d".repeat(64) }, warnings: [],
};
const raw = JSON.stringify(body);
const root = {
  schema: "company_theme_exposure_manifest.v1", generation_id: generation, generated_at: "2026-08-01T12:00:00Z", company_count: 1, exposure_count: 1,
  coverage: { active_membership_count: 1, mapped_membership_count: 1, unmapped_membership_count: 0, active_member_ticker_count: 1, unmapped_only_ticker_count: 0, active_member_tickers_without_company_context: 0 },
  source: { company_intelligence: { generation_id: "b".repeat(24), sha256: "e".repeat(64) }, membership: { sha256: "f".repeat(64) }, crosswalk: { sha256: "1".repeat(64) }, theme_state: { status: "fresh", as_of: "2026-08-01", sha256: "d".repeat(64) }, builder: "company_theme_exposure.v1" },
  files: { "companies/NVDA.json": { sha256: createHash("sha256").update(raw).digest("hex"), bytes: Buffer.byteLength(raw) } }, status: "ready", warnings: [],
};

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  __resetCompanyThemeExposureCacheForTests();
  originalFetch = globalThis.fetch;
  process.env.TERMINAL_E2E_FIXTURE = "1";
  globalThis.fetch = vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith("companies/NVDA.json") ? body : root))) as unknown as typeof globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.TERMINAL_E2E_FIXTURE;
  vi.restoreAllMocks();
});

const request = () => new Request("https://app.mastermind-x.com/api/company-theme-context/NVDA", { headers: { "cf-connecting-ip": "203.0.113.70" } });
const params = (symbol: string) => ({ params: Promise.resolve({ symbol }) });

describe("/api/company-theme-context/[symbol]", () => {
  it("returns a receipt-verified, context-only payload with no-store", async () => {
    const response = await GET(request(), params("NVDA"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ schema: "mastermind.company-theme-context/v1", ok: true, state: "ready", context: { is_context_only: true, exposures: [{ mapping_qualifier: "proxy" }] } });
  });

  it("rejects malformed ticker segments before upstream access", async () => {
    const upstream = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    for (const symbol of ["NVDA/../../secret", "NVDA%2Fsecret", "NVDA?x=1", "NVDA#x"]) {
      const response = await GET(request(), params(symbol));
      expect(response.status, symbol).toBe(400);
    }
    expect(upstream).not.toHaveBeenCalled();
  });
});
