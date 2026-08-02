import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  user: true,
  resolveLineage: vi.fn(),
  resolveInstitutional: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: state.user ? { id: "reader" } : null } })) },
  })),
}));

vi.mock("@/lib/companyIntelligence", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/companyIntelligence")>();
  return { ...actual, resolveCompanyIntelligenceLineageFromR2: state.resolveLineage };
});

vi.mock("@/lib/companyInstitutionalContext", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/companyInstitutionalContext")>();
  return { ...actual, resolveCompanyInstitutionalContextFromR2: state.resolveInstitutional };
});

import { GET } from "@/app/api/company-institutional-context/[symbol]/route";

let ip = 0;
const request = (address = `203.0.113.${++ip}`) => new Request("https://app.mastermind-x.com/api/company-institutional-context/NVDA", { headers: { "cf-connecting-ip": address } });
const params = (symbol: string) => ({ params: Promise.resolve({ symbol }) });

beforeEach(() => {
  delete process.env.TERMINAL_E2E_FIXTURE;
  state.user = true;
  state.resolveLineage.mockResolvedValue({
    result: { ok: true, state: "ready", context: { generation_id: "b".repeat(24), latest_event_id: "cie_latest" } },
    lineage: {
      generation_id: "b".repeat(24), latest_event_id: "cie_latest", latest_event_call_date: "2026-05-20",
      context_sha256: "c".repeat(64), manifest_sha256: "d".repeat(64),
    },
  });
  state.resolveInstitutional.mockResolvedValue({
    ok: true, state: "ready", context: { is_context_only: true, company: { ticker: "NVDA" } },
  });
});

afterEach(() => {
  delete process.env.TERMINAL_E2E_FIXTURE;
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("/api/company-institutional-context/[symbol]", () => {
  it("returns a no-store payload bound to exact Company Intelligence receipts", async () => {
    const response = await GET(request(), params("NVDA"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ schema: "mastermind.company-institutional-context/v1", ok: true, state: "ready" });
    expect(state.resolveInstitutional).toHaveBeenCalledWith("NVDA", expect.any(String), expect.objectContaining({
      expectedCompanyIntelligence: expect.objectContaining({ context_sha256: "c".repeat(64), manifest_sha256: "d".repeat(64) }),
    }));
  });

  it("requires a verified session before either data plane is read", async () => {
    state.user = false;
    const response = await GET(request(), params("NVDA"));
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "unauthorized", retryable: false } });
    expect(state.resolveLineage).not.toHaveBeenCalled();
    expect(state.resolveInstitutional).not.toHaveBeenCalled();
  });

  it("rejects non-canonical ticker segments before upstream access", async () => {
    for (const symbol of ["NVDA/../../secret", "NVDA%2Fsecret", "NVDA?x=1", "NVDA#x"]) {
      expect((await GET(request(), params(symbol))).status).toBe(400);
    }
    expect(state.resolveLineage).not.toHaveBeenCalled();
    expect(state.resolveInstitutional).not.toHaveBeenCalled();
  });

  it("fails closed when current Company Intelligence has no complete lineage", async () => {
    state.resolveLineage.mockResolvedValueOnce({
      result: { ok: true, state: "stale", context: { generation_id: "a".repeat(24) } }, lineage: null,
    });
    const response = await GET(request(), params("NVDA"));
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "invalid_payload", retryable: true } });
    expect(state.resolveInstitutional).not.toHaveBeenCalled();
  });

  it("maps publication validation and availability failures without leaking upstream text", async () => {
    state.resolveInstitutional.mockResolvedValueOnce({ ok: false, state: "error", error: { code: "invalid_payload", message: "opaque", retryable: true } });
    const invalid = await GET(request(), params("NVDA"));
    expect(invalid.status).toBe(502);
    expect(await invalid.json()).toMatchObject({ error: { code: "invalid_payload" } });
    state.resolveInstitutional.mockResolvedValueOnce({ ok: false, state: "error", error: { code: "upstream_unavailable", message: "down", retryable: true } });
    expect((await GET(request(), params("NVDA"))).status).toBe(503);
  });

  it("returns a browser-parseable no-store rate-limit envelope", async () => {
    const address = `198.51.100.${++ip}`;
    for (let attempt = 0; attempt < 60; attempt += 1) expect((await GET(request(address), params("NVDA"))).status).toBe(200);
    const response = await GET(request(address), params("NVDA"));
    expect(response.status).toBe(429);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "upstream_unavailable", retryable: true } });
  });
});
