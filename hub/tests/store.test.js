"use strict";
// Unit tests for lib/store.js — quote state management and close-leak regression.
// Run with: node --test tests/store.test.js   (Node ≥ 18 built-in test runner)
// Or via:   npm test  (from hub/ directory)

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { Store } = require("../lib/store");

// ── helpers ──

/**
 * Build a minimal AnchorCache stub.
 * anchors: Map<sym, anchor | null>  — null → cache miss
 */
function makeAnchorStub(anchors) {
  return {
    get(sym /*, nowMs */) {
      return anchors.has(sym) ? anchors.get(sym) : null;
    },
  };
}

/**
 * Make a store backed by a stub anchor cache with a manifest path that won't be read
 * (we never call loadManifestIfStale in these unit tests).
 */
function makeStore(anchors) {
  const stub = makeAnchorStub(anchors);
  return new Store("/dev/null/manifest.json", stub);
}

// ── BLOCKER: stale close leaks across trading-session boundaries ──
//
// Scenario: day N post-close: anchor.close = 202.78 → setQuote/getQuotes bake q.close = 202.78.
//           day N+1 RTH: anchor.close = null (daily file hasn't rolled yet).
//           Bug: q.close = 202.78 survives into N+1 RTH via the object spread.
//           Fix: setQuote and getQuotes must delete q.close / fresh.close when anchor.close == null.

describe("close-leak regression — two-session boundary", () => {
  // ─── Session N (post-close): anchor carries official close ───
  const DAY_N_CLOSE = 202.78;
  const DAY_N_PREVCLOSE = 204.12;
  // 17:00 ET on day N — post-close
  const NOW_DAY_N_AH = Date.UTC(2026, 6, 9, 21, 0); // 21:00 UTC = 17:00 ET

  // ─── Session N+1 (RTH): anchor has NO close yet ───
  const DAY_N1_PREVCLOSE = DAY_N_CLOSE; // yesterday's close becomes prevClose
  // 14:00 UTC on day N+1 = 10:00 ET (RTH)
  const NOW_DAY_N1_RTH = Date.UTC(2026, 6, 10, 14, 0);

  it("setQuote: q.close is set when anchor.close is present (day N post-close)", () => {
    const store = makeStore(new Map([
      ["NVDA", { prevClose: DAY_N_PREVCLOSE, close: DAY_N_CLOSE, anchor_source: "daily_file" }],
    ]));
    const q = store.setQuote("NVDA", { last: 203.10, market: "us" }, NOW_DAY_N_AH);
    assert.equal(q.close, DAY_N_CLOSE, "close should be set from anchor post-close");
  });

  it("setQuote: q.close is DELETED when anchor.close is absent (day N+1 RTH)", () => {
    // Simulate a quote already in the store with a baked-in close from day N.
    const storeN1 = makeStore(new Map([
      ["NVDA", { prevClose: DAY_N1_PREVCLOSE, anchor_source: "daily_file" }], // no close
    ]));
    // Pre-populate the internal quotes map to simulate a long-running process.
    storeN1.quotes.set("NVDA", {
      sym: "NVDA", last: 203.10, market: "us",
      close: DAY_N_CLOSE, // ← stale close from day N
      prevClose: DAY_N_PREVCLOSE, chg: -0.50, ts: Math.floor(NOW_DAY_N1_RTH / 1000) - 10,
    });
    const q = storeN1.setQuote("NVDA", { last: 203.50, market: "us" }, NOW_DAY_N1_RTH);
    assert.equal(q.close, undefined,
      "close MUST NOT survive from day N into day N+1 RTH (stale close leak)");
    assert.equal(q.afterHours, undefined,
      "afterHours MUST NOT survive when anchor has no close");
  });

  it("setQuote: afterHours is DELETED when anchor.close is absent (day N+1 RTH)", () => {
    const storeN1 = makeStore(new Map([
      ["NVDA", { prevClose: DAY_N1_PREVCLOSE, anchor_source: "daily_file" }],
    ]));
    storeN1.quotes.set("NVDA", {
      sym: "NVDA", last: 203.10, market: "us",
      close: DAY_N_CLOSE, afterHours: 203.50, // ← stale AH from day N
      prevClose: DAY_N_PREVCLOSE, chg: -0.50, ts: Math.floor(NOW_DAY_N1_RTH / 1000) - 10,
    });
    const q = storeN1.setQuote("NVDA", { last: 204.00, market: "us" }, NOW_DAY_N1_RTH);
    assert.equal(q.afterHours, undefined,
      "afterHours from day N must be evicted on day N+1 RTH");
  });

  it("getQuotes: fresh.close is DELETED when anchor.close is absent (day N+1 RTH)", () => {
    const storeN1 = makeStore(new Map([
      ["NVDA", { prevClose: DAY_N1_PREVCLOSE, anchor_source: "daily_file" }],
    ]));
    // Seed the store with a stale close from day N
    storeN1.quotes.set("NVDA", {
      sym: "NVDA", last: 203.10, market: "us",
      close: DAY_N_CLOSE,         // ← stale close from day N — the leak
      prevClose: DAY_N_PREVCLOSE, chg: -0.50, ts: Math.floor(NOW_DAY_N1_RTH / 1000) - 10,
      anchor_source: "daily_file",
    });
    const result = storeN1.getQuotes(["NVDA"], NOW_DAY_N1_RTH);
    assert.ok(result.NVDA, "NVDA should be present in result");
    assert.equal(result.NVDA.close, undefined,
      "getQuotes MUST delete stale close from day N when anchor has no close (day N+1 RTH)");
  });

  it("getQuotes: stale close is evicted even when no other field changes (flat close, non-daily anchor)", () => {
    // Edge: stale q.close == live last == anchor.prevClose, chg already 0, anchor has
    // no close and no prevSessionChg (e.g. polygon_prev fallback). Nothing else in the
    // changed-detection differs, so the stale close alone must trip the rebuild.
    const FLAT = 202.78;
    const storeN1 = makeStore(new Map([
      ["NVDA", { prevClose: FLAT, anchor_source: "polygon_prev" }], // no close, no prevSessionChg
    ]));
    storeN1.quotes.set("NVDA", {
      sym: "NVDA", last: FLAT, market: "us",
      close: FLAT,            // ← stale close from the prior session
      prevClose: FLAT, chg: 0, ts: Math.floor(NOW_DAY_N1_RTH / 1000) - 10,
      anchor_source: "polygon_prev",
    });
    const result = storeN1.getQuotes(["NVDA"], NOW_DAY_N1_RTH);
    assert.ok(result.NVDA, "NVDA should be present in result");
    assert.equal(result.NVDA.close, undefined,
      "stale close MUST be evicted when the anchor carries no close, even if every other field is unchanged");
  });

  it("getQuotes: fresh.close is set correctly when anchor.close is present (day N AH)", () => {
    const storeAH = makeStore(new Map([
      ["NVDA", { prevClose: DAY_N_PREVCLOSE, close: DAY_N_CLOSE, anchor_source: "daily_file" }],
    ]));
    storeAH.quotes.set("NVDA", {
      sym: "NVDA", last: 203.10, market: "us",
      prevClose: DAY_N_PREVCLOSE, chg: -0.50, ts: Math.floor(NOW_DAY_N_AH / 1000) - 10,
      anchor_source: "daily_file",
    });
    const result = storeAH.getQuotes(["NVDA"], NOW_DAY_N_AH);
    assert.ok(result.NVDA, "NVDA should be present");
    assert.equal(result.NVDA.close, DAY_N_CLOSE,
      "close MUST be set from anchor when anchor.close is present (post-close)");
  });

  it("getQuotes: regular values stay stable while ext fields use the separate namespace", () => {
    const storeAH = makeStore(new Map([
      ["NVDA", { prevClose: DAY_N_PREVCLOSE, close: DAY_N_CLOSE, anchor_source: "daily_file" }],
    ]));
    storeAH.quotes.set("NVDA", {
      sym: "NVDA", last: DAY_N_CLOSE, market: "us",
      prevClose: DAY_N_PREVCLOSE, chg: -0.50, ts: Math.floor(NOW_DAY_N_AH / 1000) - 10,
      anchor_source: "daily_file",
    });
    const extTs = Math.floor(NOW_DAY_N_AH / 1000) - 5;
    const extFeed = {
      getExt() {
        return {
          extPrice: 205.50,
          extChg: ((205.50 - DAY_N_CLOSE) / DAY_N_CLOSE) * 100,
          extTs,
          extSession: "post",
          extSource: "polygon-delayed",
          extBasis: "DELAYED_15M",
        };
      },
    };
    const result = storeAH.getQuotes(["NVDA"], NOW_DAY_N_AH, extFeed);
    assert.equal(result.NVDA.last, DAY_N_CLOSE, "last remains the official regular price");
    assert.equal(result.NVDA.close, DAY_N_CLOSE, "close remains the official regular close");
    assert.equal(result.NVDA.afterHours, undefined, "legacy afterHours is never emitted");
    assert.equal(result.NVDA.extPrice, 205.50, "extended price is carried under extPrice");
    assert.equal(result.NVDA.extSession, "post");
  });

  it("getQuotes: post-market ext change references today's RTH close before the daily file rolls", () => {
    const regularClose = 200.81;
    const storeAH = makeStore(new Map([
      ["NVDA", { prevClose: 195.04, anchor_source: "daily_file" }],
    ]));
    storeAH.quotes.set("NVDA", {
      sym: "NVDA", last: regularClose, market: "us",
      regularSession: "rth", regularSessionDate: "2026-07-09",
      prevClose: 195.04, chg: 2.95, ts: Math.floor(NOW_DAY_N_AH / 1000) - 10,
      anchor_source: "daily_file",
    });
    let reference = null;
    const extFeed = {
      getExt(_sym, _now, closeRef) {
        reference = closeRef;
        return {
          extPrice: 199.79,
          extChg: ((199.79 - closeRef) / closeRef) * 100,
          extTs: Math.floor(NOW_DAY_N_AH / 1000) - 5,
          extSession: "post",
        };
      },
    };

    const result = storeAH.getQuotes(["NVDA"], NOW_DAY_N_AH, extFeed);
    assert.equal(reference, regularClose,
      "AH reference must be today's RTH close even before the daily anchor rolls");
    assert.ok(Math.abs(result.NVDA.extChg - ((199.79 - regularClose) / regularClose) * 100) < 1e-9);
  });
});

// ── setQuote: basic merge semantics ──

describe("setQuote basic merge", () => {
  it("merges partial onto existing quote preserving source/basis", () => {
    const store = new Store("/dev/null/manifest.json");
    store.setQuote("BTC-USD", { last: 60000, market: "crypto", source: "coinbase", basis: "ws", prevClose: 58000 }, Date.now());
    const q = store.setQuote("BTC-USD", { last: 61000 }, Date.now());
    assert.equal(q.source, "coinbase", "source must survive partial update");
    assert.equal(q.basis, "ws", "basis must survive partial update");
    assert.equal(q.last, 61000);
  });

  it("stamps ts on first write when absent", () => {
    const store = new Store("/dev/null/manifest.json");
    const nowMs = Date.UTC(2026, 6, 9, 14, 0);
    const q = store.setQuote("TSLA", { last: 300, market: "us" }, nowMs);
    assert.equal(q.ts, Math.floor(nowMs / 1000));
  });
});

// ── getQuotes: non-US symbols bypass anchor path ──

describe("getQuotes non-US bypass", () => {
  it("returns raw quote for non-US symbol even when anchor stub is present", () => {
    const store = makeStore(new Map([["BTC-USD", { prevClose: 58000 }]]));
    store.quotes.set("BTC-USD", {
      sym: "BTC-USD", last: 60000, market: "crypto", chg: 3.45,
      prevClose: 58000, ts: Math.floor(Date.now() / 1000), anchor_source: "quote_partial",
    });
    const result = store.getQuotes(["BTC-USD"], Date.now());
    // Non-US bypasses the anchor-recompute branch (q.market !== "us")
    assert.ok(result["BTC-USD"], "BTC-USD should be in result");
    assert.equal(result["BTC-USD"].chg, 3.45);
  });
});
