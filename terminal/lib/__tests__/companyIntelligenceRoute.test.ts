import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import {
  __resetCompanyIntelligenceCacheForTests,
  COMPANY_INTELLIGENCE_MAX_R2_JSON_BYTES,
  resolveCompanyIntelligenceFromR2,
} from "@/lib/companyIntelligence";

const metrics = () => ({
  sentiment: null, performance: null, confidence: null, combined: null,
  call_positivity: null, management_confidence: null, analyst_criticism: null, future_outlook: null,
  revenue_growth_pct: null, eps_growth_pct: null, gross_margin_pct: null, analysts_count: null, questions_count: null,
});
const event = (ticker = "NVDA") => ({
  event_id: `${ticker}-2026Q1`, ticker, fiscal_year: 2026, fiscal_quarter: 1, call_date: "2026-05-28",
  summary: "Demand remained broad.", highlights: ["Broad demand"], positive_highlights: [], negative_highlights: [],
  key_quote: null, tags: ["demand"], metrics: metrics(),
  field_lineage: {
    summary: "earnings_history", key_quote: null,
    metrics: Object.fromEntries(Object.keys(metrics()).map((key) => [key, null])),
    positive_highlights: [], negative_highlights: [], highlights: ["earnings_history"],
    tags: { demand: "earnings_history" },
  },
  previous_event_deltas: metrics(),
  sources: [
    { source_ref: "earnings_history", kind: "earnings_history", status: "metadata_only", citation_precision: "metadata", url: null, receipt: null },
    { source_ref: "transcript", kind: "transcript", status: "present", citation_precision: "document", url: `/data/tx/${ticker}/2026Q1.json.gz`, receipt: null },
  ],
  claim_citations_pending: true,
});
const context = (ticker = "NVDA", generation = "a".repeat(24)) => ({
  schema: "company_intelligence_context.v1", authority: "context_only", generated_at: "2026-08-01T12:00:00Z", generation_id: generation,
  company: { ticker, display_name: "NVIDIA Corporation", exchange: null }, status: "ready", latest_event_id: `${ticker}-2026Q1`, latest_event: event(ticker), history: [event(ticker)],
  topics: { timeline: [{ tag: "demand", first_event_id: `${ticker}-2026Q1`, last_event_id: `${ticker}-2026Q1`, event_count: 1, status: "added" }], added: ["demand"], dropped: [], persistent: [] },
  source_completeness: { earnings_history: { status: "metadata_only", event_count: 1 }, score_overlay: { status: "missing", event_count: 0 }, transcripts: { status: "present", event_count: 1 } },
  warnings: [], missing_sources: [],
  transport_lineage: { earnings_manifest: { generation_id: "b".repeat(24), sha256: "b".repeat(64) }, tx_index: { schema: "mastermind.tx-index/v1", generation_id: "c".repeat(24), sha256: "c".repeat(64) }, builder: "company_intelligence.v1" },
});
const manifest = (generation = "a".repeat(24), body: unknown = context("NVDA", generation)) => {
  const wire = JSON.stringify(body);
  return ({
  schema: "company_intelligence_manifest.v1", generation_id: generation, generated_at: "2026-08-01T12:00:00Z", company_count: 1, event_count: 1, latest_event_date: "2026-05-28",
  source: { earnings_manifest: { generation_id: "b".repeat(24), sha256: "b".repeat(64) }, tx_index: { schema: "mastermind.tx-index/v1", generation_id: "c".repeat(24), sha256: "c".repeat(64) } },
  files: { "companies/NVDA.json": { sha256: createHash("sha256").update(wire).digest("hex"), bytes: Buffer.byteLength(wire) } }, status: "ready", warnings: [],
  });
};

// This state has to be self-contained: vi.hoisted runs before normal imports and
// declarations, so it must not call the fixture builders below.
const fixtureState = vi.hoisted(() => ({ raw: null as unknown, missing: false, reads: [] as string[] }));
vi.mock("node:fs", () => ({
  promises: {
    readFile: vi.fn(async (file: string) => {
      fixtureState.reads.push(file);
      if (fixtureState.missing) throw new Error("ENOENT");
      return JSON.stringify(fixtureState.raw);
    }),
  },
}));

import { GET } from "@/app/api/company-intelligence/[symbol]/route";

let realFetch: typeof globalThis.fetch;
let calls: string[];
let fetchOptions: Array<RequestInit | undefined>;
let ip = 0;

const req = () => new Request("https://app.mastermind-x.com/api/company-intelligence/NVDA", {
  headers: { "cf-connecting-ip": `203.0.113.${++ip}` },
});
const params = (symbol: string) => ({ params: Promise.resolve({ symbol }) });
const json = async (res: Response) => res.json() as Promise<any>;

function installR2(upstream: (url: string) => Response | Promise<Response>) {
  globalThis.fetch = vi.fn(async (url: string, options?: RequestInit) => {
    calls.push(String(url));
    fetchOptions.push(options);
    return upstream(String(url));
  }) as unknown as typeof globalThis.fetch;
}

beforeEach(() => {
  __resetCompanyIntelligenceCacheForTests();
  realFetch = globalThis.fetch;
  calls = [];
  fetchOptions = [];
  fixtureState.raw = context();
  fixtureState.missing = false;
  fixtureState.reads = [];
  delete process.env.COMPANY_INTELLIGENCE_FIXTURE;
});
afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.COMPANY_INTELLIGENCE_FIXTURE;
  vi.restoreAllMocks();
});

describe("/api/company-intelligence/[symbol]", () => {
  it("pins the context URL to the validated manifest generation and sanitizes the response", async () => {
    const raw = context();
    (raw as any).untrusted = "do-not-relay";
    const pinnedGeneration = "d".repeat(24);
    const pinned = { ...raw, generation_id: pinnedGeneration };
    installR2((url) => {
      if (url.endsWith("/company_intelligence/manifest.json")) return new Response(JSON.stringify(manifest(pinnedGeneration, pinned)));
      if (url.endsWith(`/company_intelligence/generations/${pinnedGeneration}/companies/NVDA.json`)) {
        return new Response(JSON.stringify(pinned));
      }
      return new Response("missing", { status: 404 });
    });
    const res = await GET(req(), params("NVDA"));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(calls).toEqual(expect.arrayContaining([
      expect.stringMatching(/company_intelligence\/manifest\.json$/),
      expect.stringMatching(new RegExp(`generations/${pinnedGeneration}/companies/NVDA\\.json$`)),
    ]));
    expect(fetchOptions).toEqual(expect.arrayContaining([
      expect.objectContaining({ cache: "no-store", redirect: "error" }),
    ]));
    const body = await json(res);
    expect(body.context.is_context_only).toBe(true);
    expect(body.context.untrusted).toBeUndefined();
  });

  it("rejects traversal, encoded slashes, query and hash injection before any R2 call", async () => {
    installR2(() => new Response("unexpected"));
    for (const symbol of ["NVDA/../../secret", "NVDA%2Fsecret", "NVDA?x=1", "NVDA#x"]) {
      const res = await GET(req(), params(symbol));
      expect(res.status, symbol).toBe(400);
      expect(res.headers.get("cache-control"), symbol).toBe("no-store");
    }
    expect(calls).toHaveLength(0);
  });

  it("pins the R2 helper to the configured public bucket host", async () => {
    installR2(() => new Response("unexpected"));
    const result = await resolveCompanyIntelligenceFromR2("NVDA", "https://example.invalid");
    expect(result).toMatchObject({ ok: false, state: "error", error: { code: "upstream_unavailable" } });
    expect(calls).toHaveLength(0);
  });

  it("rejects a response whose final URL leaves the pinned R2 bucket", async () => {
    const redirected = new Response(JSON.stringify(manifest()));
    Object.defineProperty(redirected, "url", {
      value: "https://example.invalid/company_intelligence/manifest.json",
    });
    installR2(() => redirected);
    expect((await GET(req(), params("NVDA"))).status).toBe(503);
    expect(calls).toHaveLength(1);
  });

  it("rejects oversized R2 JSON before parsing, both advertised and streamed", async () => {
    installR2(() => new Response("{}", {
      headers: { "content-length": String(COMPANY_INTELLIGENCE_MAX_R2_JSON_BYTES + 1) },
    }));
    expect((await GET(req(), params("NVDA"))).status).toBe(503);
    expect(calls).toHaveLength(1);

    __resetCompanyIntelligenceCacheForTests();
    calls = [];
    fetchOptions = [];
    const oversized = new Uint8Array(COMPANY_INTELLIGENCE_MAX_R2_JSON_BYTES + 1);
    installR2(() => new Response(oversized));
    expect((await GET(req(), params("NVDA"))).status).toBe(503);
    expect(calls).toHaveLength(1);
  });

  it("uses a warm manifest/context cache without another upstream request", async () => {
    installR2((url) => new Response(JSON.stringify(url.endsWith("manifest.json") ? manifest() : context())));
    expect((await GET(req(), params("NVDA"))).status).toBe(200);
    expect(calls).toHaveLength(2);
    expect((await GET(req(), params("NVDA"))).status).toBe(200);
    expect(calls).toHaveLength(2);
  });

  it("serves a stale last-good context after the manifest refresh fails", async () => {
    const now = vi.spyOn(Date, "now");
    now.mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValueOnce(31_000);
    let healthy = true;
    installR2((url) => {
      if (!healthy) throw new Error("R2 timeout");
      return new Response(JSON.stringify(url.endsWith("manifest.json") ? manifest() : context()));
    });
    expect((await GET(req(), params("NVDA"))).status).toBe(200);
    healthy = false;
    const res = await GET(req(), params("NVDA"));
    expect(res.status).toBe(200);
    expect((await json(res)).state).toBe("stale");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("keeps the prior verified generation when a newly promoted context is invalid", async () => {
    let now = 0;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    let generation = "a".repeat(24);
    let body: unknown = context("NVDA", generation);
    installR2((url) => new Response(JSON.stringify(
      url.endsWith("manifest.json") ? manifest(generation, body) : body,
    )));

    expect((await GET(req(), params("NVDA"))).status).toBe(200);
    generation = "d".repeat(24);
    body = { bad: true };
    now = 31_000;

    const response = await GET(req(), params("NVDA"));
    expect(response.status).toBe(200);
    const payload = await json(response);
    expect(payload.state).toBe("stale");
    expect(payload.context.generation_id).toBe("a".repeat(24));
  });

  it("keeps the prior verified generation when a promoted manifest object is missing", async () => {
    let now = 0;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    let generation = "a".repeat(24);
    let objectAvailable = true;
    installR2((url) => {
      if (url.endsWith("manifest.json")) return new Response(JSON.stringify(manifest(generation, context("NVDA", generation))));
      return objectAvailable
        ? new Response(JSON.stringify(context("NVDA", generation)))
        : new Response("missing", { status: 404 });
    });

    expect((await GET(req(), params("NVDA"))).status).toBe(200);
    generation = "d".repeat(24);
    objectAvailable = false;
    now = 31_000;

    const response = await GET(req(), params("NVDA"));
    expect(response.status).toBe(200);
    const payload = await json(response);
    expect(payload.state).toBe("stale");
    expect(payload.context.generation_id).toBe("a".repeat(24));
  });

  it("maps a manifest-advertised missing object and invalid producer payload to 502, both no-store", async () => {
    installR2((url) => new Response(JSON.stringify(url.endsWith("manifest.json") ? manifest() : {}), {
      status: url.endsWith("manifest.json") ? 200 : 404,
    }));
    const absent = await GET(req(), params("NVDA"));
    expect(absent.status).toBe(502);
    expect(absent.headers.get("cache-control")).toBe("no-store");
    expect(await json(absent)).toMatchObject({ error: { code: "invalid_payload", retryable: true } });

    __resetCompanyIntelligenceCacheForTests();
    installR2((url) => new Response(JSON.stringify(url.endsWith("manifest.json") ? manifest() : { bad: true })));
    const invalid = await GET(req(), params("NVDA"));
    expect(invalid.status).toBe(502);
    expect(invalid.headers.get("cache-control")).toBe("no-store");
  });

  it("returns 503 no-store when no last-good copy exists and R2 is unavailable", async () => {
    installR2(() => { throw new Error("offline"); });
    const res = await GET(req(), params("NVDA"));
    expect(res.status).toBe(503);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("rejects an unsafe manifest generation before it can become an R2 path", async () => {
    const bad = manifest() as any;
    bad.generation_id = "good/../../secret";
    installR2((url) => new Response(JSON.stringify(url.endsWith("manifest.json") ? bad : context())));
    const res = await GET(req(), params("NVDA"));
    expect(res.status).toBe(502);
    expect(calls).toHaveLength(1);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("uses the local NVDA fixture mode without touching R2", async () => {
    process.env.COMPANY_INTELLIGENCE_FIXTURE = "1";
    installR2(() => new Response("unexpected"));
    const res = await GET(req(), params("NVDA"));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-company-intelligence-source")).toBe("fixture");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(fixtureState.reads[0]).toContain("company_intelligence/NVDA.json");
    expect(calls).toHaveLength(0);
  });

  it("does not substitute NVDA when a requested fixture is absent", async () => {
    process.env.COMPANY_INTELLIGENCE_FIXTURE = "1";
    fixtureState.missing = true;
    const res = await GET(req(), params("AAPL"));
    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(fixtureState.reads[0]).toContain("company_intelligence/AAPL.json");
  });

  it("uses a requested symbol fixture when it is present", async () => {
    process.env.COMPANY_INTELLIGENCE_FIXTURE = "1";
    fixtureState.raw = context("AAPL");
    const res = await GET(req(), params("AAPL"));
    expect(res.status).toBe(200);
    expect((await json(res)).context.company.ticker).toBe("AAPL");
    expect(fixtureState.reads[0]).toContain("company_intelligence/AAPL.json");
  });
});
