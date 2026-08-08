// /api/intraday — the two gates that decide WHO may read the second band, and WHETHER it serves.
//
// WHAT THIS PINS. Both defects these tests cover were ORDERING defects, not logic defects: the
// route computed the right answer and then returned a cached one before ever asking the question.
//
//   1. AUTH BEFORE CACHE. The warm-cache return used to sit ahead of the auth gate, on the
//      reasoning that market data is public. A warm entry is still a served payload, so an
//      unauthenticated caller could read whatever a signed-in caller had just warmed. For the
//      second band that is paid, real-time-derived data.
//   2. KILL SWITCH BEFORE CACHE. The second band rides HUB_REALTIME_QUOTES, the same operator
//      lever as the real-time quote leg. A refusal placed after the cache would keep serving a
//      warm entry for a further SECOND_TTL after the operator flipped the lever off — i.e. the
//      kill switch would not actually kill anything for ten seconds.
//
// Each test therefore WARMS the cache first and only then applies the gate. A version of the
// route that checks either gate too late passes a naive cold-cache test and fails these.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  user: true as boolean,
  bars: [] as number[][],
  fetchCalls: 0,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: state.user ? { id: "reader" } : null } })) },
  })),
}));

vi.mock("@/lib/intradaySources", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/intradaySources")>();
  return {
    ...actual,
    // Keep isIntradayTf / isSecondTf / classify REAL — the gates branch on them, and a stubbed
    // classifier would let the test pass against a route that never recognised a second TF.
    fetchIntraday: vi.fn(async () => { state.fetchCalls++; return state.bars as never; }),
  };
});

vi.mock("@/lib/intradayStore", () => ({
  withStoredHistory: vi.fn(async (_s: string, _t: string, _e: boolean, live: number[][]) => live),
}));

vi.mock("@/lib/flowSource", () => ({ intradayFixture: vi.fn(async () => null) }));

vi.mock("@/lib/rateLimit", () => ({
  rateLimit: vi.fn(() => ({ ok: true })),
  tooMany: vi.fn(() => new Response("rate limited", { status: 429 })),
}));

import { GET } from "@/app/api/intraday/route";

const ENV_KEYS = ["HUB_REALTIME_QUOTES", "TERMINAL_REQUIRE_AUTH", "FLOW_FIXTURE"] as const;
const saved: Record<string, string | undefined> = {};

// One ET session's worth of shape — the values do not matter, only that bars ARE served, so a
// refusal (bars: []) can never be mistaken for a successful empty window.
const BARS = [[1_786_109_700, 9.4, 9.6, 9.3, 9.5, 1200]];

const call = (sym: string, tf: string) =>
  GET(new Request(`https://x.test/api/intraday?sym=${sym}&tf=${tf}`));

beforeEach(() => {
  for (const k of ENV_KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
  state.user = true;
  state.bars = BARS;
  state.fetchCalls = 0;
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k]!;
  }
});

describe("second-band kill switch — one operator lever, checked before the cache", () => {
  it("refuses the second band when the lever is off, and never reaches the fetcher", async () => {
    // Lever unset (the DEFAULT). A US symbol that is otherwise fully entitled.
    const res = await call("AAPL", "1s");
    const body = await res.json();
    expect(res.status).toBe(200);                       // an entitlement refusal, never a 5xx
    expect(body.bars).toEqual([]);
    expect(body.note).toBe("second-resolution bars are not enabled");
    expect(state.fetchCalls).toBe(0);                   // the paid key is never spent
  });

  it("keeps refusing a symbol whose second bars are already WARM in the cache", async () => {
    process.env.HUB_REALTIME_QUOTES = "1";
    const warm = await (await call("NVDA", "1s")).json();
    expect(warm.bars.length).toBe(1);                   // cache is now warm for NVDA|1s

    delete process.env.HUB_REALTIME_QUOTES;             // operator flips the lever off
    const res = await call("NVDA", "1s");
    const body = await res.json();
    expect(body.bars).toEqual([]);
    expect(body.note).toBe("second-resolution bars are not enabled");
  });

  it("leaves the minute band alone — it is not real-time-derived", async () => {
    const res = await call("MSFT", "5m");               // lever off
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.bars.length).toBe(1);
  });
});

describe("auth is checked BEFORE the cache — a warm entry is not a bypass", () => {
  it("refuses an unauthenticated caller whose minute bars are already warm", async () => {
    const warm = await (await call("AMD", "5m")).json();
    expect(warm.bars.length).toBe(1);                   // warmed while auth was disabled

    process.env.TERMINAL_REQUIRE_AUTH = "1";
    state.user = null as never;
    const res = await call("AMD", "5m");
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("unauthenticated");
  });

  it("refuses an unauthenticated caller whose SECOND bars are already warm", async () => {
    process.env.HUB_REALTIME_QUOTES = "1";
    const warm = await (await call("TSLA", "1s")).json();
    expect(warm.bars.length).toBe(1);

    process.env.TERMINAL_REQUIRE_AUTH = "1";
    state.user = null as never;
    const res = await call("TSLA", "1s");
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("unauthenticated");
  });

  it("still serves the warm cache to an AUTHENTICATED caller, without re-spending the key", async () => {
    // The fix must not turn every authenticated request into an upstream fetch — the cache's
    // real job (bounding upstream call volume) is untouched; it just no longer decides access.
    await call("INTC", "5m");
    const after = state.fetchCalls;

    process.env.TERMINAL_REQUIRE_AUTH = "1";
    state.user = true;
    const res = await call("INTC", "5m");
    expect(res.status).toBe(200);
    expect((await res.json()).bars.length).toBe(1);
    expect(state.fetchCalls).toBe(after);               // served from cache, not refetched
  });
});
