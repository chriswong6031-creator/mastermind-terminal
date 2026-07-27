// Where a macro symbol's QUOTE comes from, and in what order.
//
// Macro symbols used to bypass the Quote Hub entirely and go straight to Yahoo's v7 spark
// endpoint — permanently DELAYED_15M, even though the hub now carries a near-live Sina leg for
// exactly these instruments. The contract locked here is hub-first with a spark fallback for
// the REMAINDER:
//
//   • a macro symbol the hub answers passes through UNCHANGED (its own source/basis survive —
//     a near-live Sina print must keep saying LIVE, and nothing may overwrite it with the
//     delayed spark copy);
//   • only the macro symbols the hub did NOT answer are asked of spark, in ONE batched call
//     (this is what keeps local dev without a hub on :3100 working, and what covers the hub's
//     macro leg being down in production);
//   • a symbol both legs miss stays ABSENT from the map, so the caller falls back to the
//     manifest's EOD row instead of showing a hole or a fabricated price.
//
// Mocked at the FETCH layer rather than by stubbing fetchHubQuotes, so the test also proves the
// symbols actually reach the hub's /quotes URL — the routing bug being fixed was invisible at
// any higher level.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchQuotes } from "@/lib/intradaySources";

type Call = { url: string };
let calls: Call[];
let realFetch: typeof globalThis.fetch;

/** Quote-Hub-shaped entry (the hub already speaks the Quote contract). */
const hubQuote = (sym: string, last: number, extra: Record<string, unknown> = {}) => ({
  sym, last, prevClose: last - 1, chg: 1.23,
  open: last - 0.5, high: last + 0.5, low: last - 1, vol: 1000, amount: null,
  ts: 1_800_000_000, live: true, source: "sina", market: "macro", basis: "LIVE",
  ...extra,
});

/** v7 spark-shaped entry for the delayed fallback leg. */
const sparkRow = (symbol: string, price: number) => ({
  symbol,
  response: [{ meta: { symbol, regularMarketPrice: price, previousClose: price - 2, regularMarketTime: 1_800_000_100 } }],
});

/**
 * Route the spy by URL: hub answers `hubBody`, spark answers `sparkSyms`.
 * `hubBody: null` simulates no hub listening on :3100 (local dev) — a rejected fetch.
 */
function install(hubBody: Record<string, unknown> | null, sparkSyms: Record<string, number> = {}) {
  globalThis.fetch = vi.fn(async (url: any) => {
    const u = String(url);
    calls.push({ url: u });
    if (u.includes("127.0.0.1")) {
      if (hubBody === null) throw new Error("ECONNREFUSED");
      return new Response(JSON.stringify(hubBody), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (u.includes("/v7/finance/spark")) {
      const wanted = decodeURIComponent(new URL(u).searchParams.get("symbols") || "").split(",");
      const result = wanted.filter((s) => s in sparkSyms).map((s) => sparkRow(s, sparkSyms[s]));
      return new Response(JSON.stringify({ spark: { result } }), { status: 200, headers: { "content-type": "application/json" } });
    }
    throw new Error("unexpected upstream: " + u);
  }) as any;
}

const hubCalls = () => calls.filter((c) => c.url.includes("127.0.0.1"));
const sparkCalls = () => calls.filter((c) => c.url.includes("/v7/finance/spark"));
/** The symbols a spark call asked for. */
const sparkAsked = (i = 0) =>
  decodeURIComponent(new URL(sparkCalls()[i].url).searchParams.get("symbols") || "").split(",");

beforeEach(() => {
  calls = [];
  realFetch = globalThis.fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

describe("fetchQuotes — macro symbols go to the Quote Hub first", () => {
  it("sends macro symbols to the hub alongside US equities, in the same batch", async () => {
    install({ "CL=F": hubQuote("CL=F", 65.4), NVDA: hubQuote("NVDA", 180.2) });
    await fetchQuotes(["CL=F", "NVDA"]);
    expect(hubCalls()).toHaveLength(1);
    const asked = decodeURIComponent(new URL(hubCalls()[0].url).searchParams.get("syms") || "");
    expect(asked.split(",").sort()).toEqual(["CL=F", "NVDA"]);
  });

  it("passes a hub-served macro quote through unchanged — its source and basis survive", async () => {
    // The whole point of the hub's macro leg: a near-live Sina print must not be relabelled
    // DELAYED_15M/yahoo-spark by the fallback path.
    install({ "CL=F": hubQuote("CL=F", 65.4) }, { "CL=F": 11.11 });
    const out = await fetchQuotes(["CL=F"]);
    expect(out["CL=F"].last).toBe(65.4);
    expect(out["CL=F"].source).toBe("sina");
    expect(out["CL=F"].basis).toBe("LIVE");
    expect(out["CL=F"].live).toBe(true);
    expect(sparkCalls()).toHaveLength(0);   // nothing missing → no fallback call at all
  });

  it("asks spark ONLY for the macro symbols the hub did not answer", async () => {
    install(
      { "CL=F": hubQuote("CL=F", 65.4), NVDA: hubQuote("NVDA", 180.2) },
      { "GC=F": 2410.5, "^GSPC": 5500.25 },
    );
    const out = await fetchQuotes(["CL=F", "GC=F", "^GSPC", "NVDA"]);
    expect(sparkCalls()).toHaveLength(1);                    // one batched call, not one per symbol
    expect(sparkAsked().sort()).toEqual(["GC=F", "^GSPC"]);  // and NOT CL=F, which the hub served
    expect(out["CL=F"].source).toBe("sina");
    expect(out["GC=F"].last).toBe(2410.5);
    expect(out["^GSPC"].last).toBe(5500.25);
  });

  it("marks a spark-served macro quote DELAYED_15M and not live", async () => {
    // Real-time index/CME/ICE data needs a licensed feed we do not hold; claiming LIVE here
    // would print a promise we cannot back.
    install({}, { "GC=F": 2410.5 });
    const q = (await fetchQuotes(["GC=F"]))["GC=F"];
    expect(q.basis).toBe("DELAYED_15M");
    expect(q.live).toBe(false);
    expect(q.source).toBe("yahoo-spark");
    expect(q.chg).toBeCloseTo(((2410.5 - 2408.5) / 2408.5) * 100, 10);
  });

  it("still serves macro quotes when no hub is listening at all (local dev)", async () => {
    install(null, { "CL=F": 65.4, "EURUSD=X": 1.0925 });
    const out = await fetchQuotes(["CL=F", "EURUSD=X"]);
    expect(out["CL=F"].last).toBe(65.4);
    expect(out["EURUSD=X"].last).toBe(1.0925);
    expect(sparkAsked().sort()).toEqual(["CL=F", "EURUSD=X"]);
  });

  it("leaves a symbol both legs miss ABSENT, so the caller falls back to manifest EOD", async () => {
    install({}, {});
    const out = await fetchQuotes(["CL=F"]);
    expect("CL=F" in out).toBe(false);
  });

  it("does not send non-macro symbols to the spark fallback when the hub misses them", async () => {
    // A US equity the hub could not answer has no Yahoo leg here — it falls to manifest EOD.
    install({}, { NVDA: 180.2 });
    const out = await fetchQuotes(["NVDA"]);
    expect(sparkCalls()).toHaveLength(0);
    expect("NVDA" in out).toBe(false);
  });
});

// ── FRED daily series: routed NOWHERE ────────────────────────────────────────
//
// DFII10 / DFII5 / T10YIE / T5YIE are bare FRED series ids. They match no macro SHAPE (no ^,
// no =F/=X) and so fell through classify()'s "us" default straight into the hub batch — where
// the hub polygon-subscribed AM.DFII10, burned one of the 30 shared ext slots, and answered
// with a manifest placeholder stamped source "polygon-delayed" / basis DELAYED_15M / ts:now.
// That is a 15-minute-freshness claim on a number FRED publishes once a day, and ChartPanel's
// spliceDaily then appended it as a synthetic flat bar dated today.
//
// The fix is absence, not a new leg: with the symbol missing from every live map, the caller
// falls back to the manifest's real daily close and splices nothing.
describe("fetchQuotes — FRED daily series reach no live leg at all", () => {
  const FRED = ["DFII10", "DFII5", "T10YIE", "T5YIE"];

  it("keeps DFII10 out of the hub batch", async () => {
    install({ NVDA: hubQuote("NVDA", 180.2) });
    await fetchQuotes(["DFII10", "NVDA"]);
    expect(hubCalls()).toHaveLength(1);
    const asked = decodeURIComponent(new URL(hubCalls()[0].url).searchParams.get("syms") || "");
    expect(asked.split(",")).toEqual(["NVDA"]);
  });

  it("keeps DFII10 out of the spark fallback too", async () => {
    // It is not a macro symbol, so it must not be picked up by the "hub missed it" sweep.
    install({}, { DFII10: 1.85 });
    const out = await fetchQuotes(["DFII10"]);
    expect(sparkCalls()).toHaveLength(0);
    expect("DFII10" in out).toBe(false);
  });

  it("makes NO upstream call at all when only FRED series are requested", async () => {
    install({}, {});
    const out = await fetchQuotes(FRED);
    expect(calls).toHaveLength(0);
    expect(Object.keys(out)).toEqual([]);
  });

  it("never fabricates a quote for one — absent means manifest EOD", async () => {
    // Even if some upstream volunteered a price for the id, routing never asks for it.
    install(Object.fromEntries(FRED.map((s) => [s, hubQuote(s, 1.85)])), { DFII10: 1.85 });
    const out = await fetchQuotes(FRED);
    for (const s of FRED) expect(s in out, s).toBe(false);
  });

  it("does not disturb the symbols around it in a mixed request", async () => {
    install({ "CL=F": hubQuote("CL=F", 65.4), NVDA: hubQuote("NVDA", 180.2) }, { "^GSPC": 5500.25 });
    const out = await fetchQuotes(["DFII10", "CL=F", "NVDA", "^GSPC"]);
    const asked = decodeURIComponent(new URL(hubCalls()[0].url).searchParams.get("syms") || "");
    expect(asked.split(",").sort()).toEqual(["CL=F", "NVDA", "^GSPC"]);
    expect(sparkAsked()).toEqual(["^GSPC"]);
    expect(out["CL=F"].last).toBe(65.4);
    expect(out["NVDA"].last).toBe(180.2);
    expect(out["^GSPC"].last).toBe(5500.25);
    expect("DFII10" in out).toBe(false);
  });
});
