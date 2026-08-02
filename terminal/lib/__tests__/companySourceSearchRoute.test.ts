import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  user: true,
  resolve: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: state.user ? { id: "reader" } : null } })) },
  })),
}));

vi.mock("@/lib/companySourceSearchServer", () => ({
  resolveCompanySourceSearchFromArchive: state.resolve,
  createCompanySourceSearchE2eFetch: vi.fn(),
}));

import { GET } from "@/app/api/company-source-search/[ticker]/route";

let ip = 0;
const request = (suffix: string, address = `203.0.113.${++ip}`) => new Request(`https://app.mastermind-x.com/api/company-source-search/NVDA${suffix}`, {
  headers: { "cf-connecting-ip": address },
});
const params = (ticker = "NVDA") => ({ params: Promise.resolve({ ticker }) });
const suffix = "?q=data%20center&mode=search&event=NVDA-2026Q1&tx=2026Q1";

beforeEach(() => {
  delete process.env.TERMINAL_E2E_FIXTURE;
  state.user = true;
  state.resolve.mockResolvedValue({
    state: "ready", ticker: "NVDA", query: "data center", spans: [], searched_event_ids: ["NVDA-2026Q1"], corpus_revision: "txroot-aabbccddeeff",
  });
});
afterEach(() => {
  delete process.env.TERMINAL_E2E_FIXTURE;
  vi.clearAllMocks();
});

describe("/api/company-source-search/[ticker]", () => {
  it("requires a server-verified session before resolving an archive", async () => {
    state.user = false;
    const response = await GET(request(suffix), params());
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ state: "error", retryable: false });
    expect(state.resolve).not.toHaveBeenCalled();
  });

  it("rejects malformed paths and mismatched event/transcript pairs before archive I/O", async () => {
    expect((await GET(request(suffix), params("NVDA%2Fsecret"))).status).toBe(400);
    expect((await GET(request("?q=data%20center&mode=search&event=NVDA-2026Q1"), params())).status).toBe(400);
    expect(state.resolve).not.toHaveBeenCalled();
  });

  it("passes explicit selected event/transcript identities and keeps source failures unavailable", async () => {
    state.resolve.mockResolvedValueOnce({ state: "unavailable", ticker: "NVDA", query: "data center", message: "archive down", retryable: true });
    const response = await GET(request(suffix), params());
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ state: "unavailable", ticker: "NVDA" });
    expect(state.resolve).toHaveBeenCalledWith(expect.objectContaining({
      calls: [{ event_id: "NVDA-2026Q1", transcript_id: "2026Q1" }],
      mode: "search",
    }), expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it("rate-limits the BFF independently of normal Company Intelligence reads", async () => {
    const address = `198.51.100.${++ip}`;
    for (let attempt = 0; attempt < 30; attempt += 1) expect((await GET(request(suffix, address), params())).status).toBe(200);
    const throttled = await GET(request(suffix, address), params());
    expect(throttled.status).toBe(429);
    expect(throttled.headers.get("cache-control")).toBe("no-store");
  });
});
