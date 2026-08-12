"use strict";
// Unit tests for lib/snapshot.js + the store's snapshot overlay.
// Run with: node --test tests/snapshot.test.js
//
// REGRESSION UNDER TEST (operator-reported 2026-08-07, SKY / Champion Homes):
//   SKY closed at 94.66 on 2026-08-07. The Terminal showed 91.52 +0.39% — the 2026-08-06
//   close and the 2026-08-06 move — because the AM.* subscription had been idle-swept and
//   the only fallback was the NIGHTLY manifest. Real numbers from that session are used
//   throughout so a future reader can check them against the tape.

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { Store } = require("../lib/store");
const { SnapshotFeed, parseSnapshot } = require("../lib/snapshot");

// ── the real SKY numbers ──
const PREV_CLOSE = 91.52;   // 2026-08-06 close
const TODAY_CLOSE = 94.66;  // 2026-08-07 close (TradingView: +3.14, +3.43%)
const TODAY_CHG = ((TODAY_CLOSE - PREV_CLOSE) / PREV_CLOSE) * 100; // ≈ 3.4309%

// 2026-08-07 16:50 ET (20:50 UTC) — after the bell, before the ~23:00 ET EOD writer runs.
const NOW_POST = Date.UTC(2026, 7, 7, 20, 50);
// 2026-08-07 10:00 ET (14:00 UTC) — mid-session.
const NOW_RTH = Date.UTC(2026, 7, 7, 14, 0);

// ── the real SPCX recurrence numbers (2026-08-11) ──
const SPCX_STALE_ANCHOR = 131.66; // bad prior close in the Terminal daily file
const SPCX_PREV_CLOSE = 138.74;   // Polygon snapshot prevDay.c / official 2026-08-10 close
const SPCX_CLOSE = 133.29;        // official 2026-08-11 close
const SPCX_CHG = ((SPCX_CLOSE - SPCX_PREV_CLOSE) / SPCX_PREV_CLOSE) * 100; // -3.928...
const SPCX_POST = Date.UTC(2026, 7, 11, 20, 5);
const SPCX_RTH = Date.UTC(2026, 7, 11, 18, 0);
const SPCX_NEXT_OVERNIGHT = Date.UTC(2026, 7, 12, 4, 15); // 00:15 ET next date

function polygonRow(updatedMs, { close = TODAY_CLOSE, prevClose = PREV_CLOSE } = {}) {
  return {
    ticker: "SKY",
    day: { o: 92.67, h: 95.57, l: 92.05, c: close, v: 601463 },
    prevDay: { o: 94.31, h: 94.31, l: 90.8, c: prevClose, v: 803064.867718 },
    todaysChangePerc: 3.4309440559440567,
    updated: updatedMs * 1e6, // Polygon reports nanoseconds
  };
}

function spcxRow(updatedMs) {
  return {
    ticker: "SPCX",
    day: { o: 138.655, h: 139.98, l: 130.5, c: SPCX_CLOSE, v: 108891159 },
    prevDay: { o: 134.95, h: 139.26, l: 130.17, c: SPCX_PREV_CLOSE, v: 169934328 },
    todaysChangePerc: -4.149416174138677, // deliberately ignored: it follows lastTrade
    updated: updatedMs * 1e6,
  };
}

function makeFeed(rows, { disabled = false } = {}) {
  return new SnapshotFeed({
    apiKey: "test-key",
    disabled,
    fetchJson: async () => ({ tickers: rows }),
  });
}

/** Store holding ONLY the manifest placeholder polygon.js writes — no live print. */
function placeholderStore(anchor) {
  const store = new Store("/dev/null/manifest.json", {
    get: () => anchor,
  });
  store.quotes.set("SKY", {
    sym: "SKY",
    last: PREV_CLOSE,            // = manifest.last = the PREVIOUS session's close
    market: "us",
    live: false,
    source: "polygon-delayed",
    basis: "DELAYED_15M",
    regularSession: "closed",
    ts: Math.floor(NOW_POST / 1000),
  });
  return store;
}

describe("parseSnapshot", () => {
  it("derives today's session and computes chg from prevDay (not todaysChangePerc)", () => {
    const snap = parseSnapshot(polygonRow(NOW_POST));
    assert.equal(snap.date, "2026-08-07");
    assert.equal(snap.close, TODAY_CLOSE);
    assert.equal(snap.prevClose, PREV_CLOSE);
    assert.ok(Math.abs(snap.chg - TODAY_CHG) < 1e-9, `chg=${snap.chg}`);
  });

  it("rejects a zeroed day block — 0 is MISSING for an equity price, never a $0 print", () => {
    const row = polygonRow(NOW_POST);
    row.day = { o: 0, h: 0, l: 0, c: 0, v: 0 }; // what Polygon serves pre-open
    assert.equal(parseSnapshot(row), null);
  });

  it("rejects a row with no `updated` stamp (undatable → could be any session)", () => {
    const row = polygonRow(NOW_POST);
    delete row.updated;
    assert.equal(parseSnapshot(row), null);
  });

  it("emits chg=null rather than a fabricated 0 when prevDay close is missing", () => {
    const row = polygonRow(NOW_POST);
    row.prevDay = {};
    const snap = parseSnapshot(row);
    assert.equal(snap.close, TODAY_CLOSE);
    assert.equal(snap.chg, null);
  });
});

describe("SnapshotFeed.get — session gating", () => {
  it("serves today's snapshot", async () => {
    const feed = makeFeed([polygonRow(NOW_POST)]);
    feed.demand("SKY", NOW_POST);
    await feed._flush();
    assert.equal(feed.get("SKY", NOW_POST).close, TODAY_CLOSE);
  });

  it("NEVER serves a previous session's snapshot as the current one", async () => {
    const YESTERDAY = Date.UTC(2026, 7, 6, 20, 50);
    const feed = makeFeed([polygonRow(YESTERDAY)]);
    feed.demand("SKY", YESTERDAY);
    await feed._flush();
    assert.ok(feed.get("SKY", YESTERDAY), "same-day read is fine");
    assert.equal(feed.get("SKY", NOW_POST), null,
      "a 2026-08-06 snapshot must not answer for 2026-08-07");
  });

  it("exposes a prior-session pair only when an independent completed close corroborates it", async () => {
    const feed = makeFeed([spcxRow(SPCX_POST)]);
    feed.demand("SPCX", SPCX_NEXT_OVERNIGHT);
    await feed._flush(SPCX_NEXT_OVERNIGHT);

    assert.equal(feed.get("SPCX", SPCX_NEXT_OVERNIGHT), null,
      "the Aug 11 row must not masquerade as the Aug 12 session");
    assert.equal(feed.getCompleted("SPCX", SPCX_NEXT_OVERNIGHT, 140), null,
      "an unrelated daily close must not authorize an old snapshot");
    const completed = feed.getCompleted("SPCX", SPCX_NEXT_OVERNIGHT, SPCX_CLOSE);
    assert.equal(completed.date, "2026-08-11");
    assert.equal(completed.close, SPCX_CLOSE);
    assert.equal(completed.prevClose, SPCX_PREV_CLOSE);
  });

  it("is inert when disabled — demand and get are both no-ops", async () => {
    const feed = makeFeed([polygonRow(NOW_POST)], { disabled: true });
    feed.demand("SKY", NOW_POST);
    await feed._flush();
    assert.equal(feed.get("SKY", NOW_POST), null);
  });
});

describe("store overlay — the SKY regression", () => {
  it("post-close: adopts today's close instead of serving the manifest placeholder", async () => {
    // Daily file has not rolled: its last bar is 2026-08-06, so the anchor's prevClose is
    // 91.52 — the SAME number as the placeholder's `last`.
    const anchor = {
      prevClose: PREV_CLOSE,
      anchor_source: "daily_file",
      prevSessionChg: 0.39491004826678305, // the 08-06 move
    };
    const store = placeholderStore(anchor);
    const feed = makeFeed([polygonRow(NOW_POST)]);
    feed.demand("SKY", NOW_POST);
    await feed._flush();

    const q = store.getQuotes(["SKY"], NOW_POST, null, feed)["SKY"];
    assert.equal(q.last, TODAY_CLOSE, "must show today's close, not yesterday's");
    assert.equal(q.close, TODAY_CLOSE, "post-close, day.c IS the official close");
    assert.equal(q.prevClose, PREV_CLOSE);
    assert.ok(Math.abs(q.chg - TODAY_CHG) < 1e-9, `chg=${q.chg} expected≈${TODAY_CHG}`);
    assert.equal(q.prevSessionChg, undefined,
      "today's session is in hand — the previous session's move must not ride along");
    assert.equal(q.regularSessionDate, "2026-08-07");
  });

  it("RTH: adopts today's price but does NOT claim an official close", async () => {
    const anchor = { prevClose: PREV_CLOSE, anchor_source: "daily_file", prevSessionChg: 0.39 };
    const store = placeholderStore(anchor);
    const feed = makeFeed([polygonRow(NOW_RTH)]);
    feed.demand("SKY", NOW_RTH);
    await feed._flush();

    const q = store.getQuotes(["SKY"], NOW_RTH, null, feed)["SKY"];
    assert.equal(q.last, TODAY_CLOSE);
    assert.equal(q.close, undefined, "mid-session there is no official close yet");
    assert.ok(Math.abs(q.chg - TODAY_CHG) < 1e-9);
  });

  it("never overrides a symbol the live tape IS carrying for today", async () => {
    const anchor = { prevClose: PREV_CLOSE, anchor_source: "daily_file" };
    const store = placeholderStore(anchor);
    const LIVE_LAST = 95.10;
    store.quotes.set("SKY", {
      ...store.quotes.get("SKY"),
      last: LIVE_LAST,
      regularSessionDate: "2026-08-07", // an AM bar landed
      source: "polygon-delayed",
    });
    const feed = makeFeed([polygonRow(NOW_RTH)]);
    feed.demand("SKY", NOW_RTH);
    await feed._flush();

    const q = store.getQuotes(["SKY"], NOW_RTH, null, feed)["SKY"];
    assert.equal(q.last, LIVE_LAST, "the stream stays authoritative when it has data");
    assert.notEqual(q.source, "polygon-snapshot");
  });
});

describe("store snapshot baseline — the SPCX recurrence", () => {
  it("keeps snapshot prevDay.c across repeated polls instead of restoring a stale daily anchor", async () => {
    const anchor = {
      prevClose: SPCX_STALE_ANCHOR,
      close: SPCX_CLOSE,
      anchor_source: "daily_file",
    };
    const store = new Store("/dev/null/manifest.json", { get: () => anchor });
    store.quotes.set("SPCX", {
      sym: "SPCX",
      last: SPCX_STALE_ANCHOR,
      market: "us",
      live: false,
      source: "polygon-delayed",
      basis: "DELAYED_15M",
      regularSession: "closed",
      ts: Math.floor(SPCX_POST / 1000),
    });
    const feed = makeFeed([spcxRow(SPCX_POST)]);
    feed.demand("SPCX", SPCX_POST);
    await feed._flush();

    const first = store.getQuotes(["SPCX"], SPCX_POST, null, feed).SPCX;
    const second = store.getQuotes(["SPCX"], SPCX_POST, null, feed).SPCX;

    for (const [label, q] of [["first", first], ["second", second]]) {
      assert.equal(q.last, SPCX_CLOSE, `${label} poll must show the official close`);
      assert.equal(q.prevClose, SPCX_PREV_CLOSE,
        `${label} poll must retain Polygon prevDay.c, not the 131.66 daily-file anchor`);
      assert.ok(Math.abs(q.chg - SPCX_CHG) < 1e-9,
        `${label} poll chg=${q.chg} expected=${SPCX_CHG}`);
      assert.equal(q.anchor_source, "snapshot");
    }
  });

  it("corrects a current-day stream baseline without replacing the stream price/source", async () => {
    const anchor = {
      prevClose: SPCX_STALE_ANCHOR,
      anchor_source: "daily_file",
    };
    const store = new Store("/dev/null/manifest.json", { get: () => anchor });
    const streamLast = 133.40;
    store.quotes.set("SPCX", {
      sym: "SPCX",
      last: streamLast,
      market: "us",
      live: false,
      source: "polygon-delayed",
      basis: "DELAYED_15M",
      regularSession: "rth",
      regularSessionDate: "2026-08-11",
      prevClose: SPCX_STALE_ANCHOR,
      chg: ((streamLast - SPCX_STALE_ANCHOR) / SPCX_STALE_ANCHOR) * 100,
      anchor_source: "daily_file",
      ts: Math.floor(SPCX_RTH / 1000),
    });
    const feed = makeFeed([spcxRow(SPCX_RTH)]);
    feed.demand("SPCX", SPCX_RTH);
    await feed._flush();

    const q = store.getQuotes(["SPCX"], SPCX_RTH, null, feed).SPCX;
    assert.equal(q.last, streamLast, "the current-day stream price stays authoritative");
    assert.equal(q.source, "polygon-delayed", "baseline repair must not relabel the price source");
    assert.equal(q.close, undefined, "an RTH snapshot is not an official close");
    assert.equal(q.prevClose, SPCX_PREV_CLOSE);
    assert.ok(Math.abs(q.chg - ((streamLast - SPCX_PREV_CLOSE) / SPCX_PREV_CLOSE) * 100) < 1e-9);
    assert.equal(q.anchor_source, "snapshot");
  });

  it("repairs the completed-session baseline after midnight and a hub restart", async () => {
    // On Aug 12 the daily-file anchor correctly identifies 133.29 as the latest completed
    // close, but derives its +1.24% move from the bad Aug 10 bar at 131.66. A freshly
    // fetched Polygon row is still dated Aug 11; it may repair the completed pair but must
    // not be presented as an Aug 12 print.
    const rolledAnchor = {
      prevClose: SPCX_CLOSE,
      prevSessionChg: ((SPCX_CLOSE - SPCX_STALE_ANCHOR) / SPCX_STALE_ANCHOR) * 100,
      anchor_source: "daily_file",
    };
    const store = new Store("/dev/null/manifest.json", { get: () => rolledAnchor });
    store.quotes.set("SPCX", {
      sym: "SPCX",
      last: SPCX_CLOSE,
      market: "us",
      live: false,
      source: "polygon-delayed",
      basis: "DELAYED_15M",
      regularSession: "closed",
      ts: Math.floor(SPCX_POST / 1000),
    });
    const feed = makeFeed([spcxRow(SPCX_POST)]);
    feed.demand("SPCX", SPCX_NEXT_OVERNIGHT);
    await feed._flush(SPCX_NEXT_OVERNIGHT);

    const first = store.getQuotes(["SPCX"], SPCX_NEXT_OVERNIGHT, null, feed).SPCX;
    // Simulate the REST cache being temporarily unavailable on the next UI poll. The
    // corroborated pair must remain stable in Store instead of reverting to +1.24%.
    const emptyFeed = { get: () => null, getCompleted: () => null };
    const second = store.getQuotes(["SPCX"], SPCX_NEXT_OVERNIGHT, null, emptyFeed).SPCX;

    for (const [label, q] of [["first", first], ["second", second]]) {
      assert.equal(q.last, SPCX_CLOSE, `${label} poll keeps the completed close`);
      assert.equal(q.prevClose, SPCX_PREV_CLOSE, `${label} poll keeps the corrected prior close`);
      assert.ok(Math.abs(q.chg - SPCX_CHG) < 1e-9,
        `${label} poll chg=${q.chg} expected=${SPCX_CHG}`);
      assert.equal(q.regularSessionDate, "2026-08-11",
        "completed data stays explicitly dated; it is not an Aug 12 print");
      assert.equal(q.close, undefined, "yesterday's close must not leak into today's close field");
      assert.equal(q.anchor_source, "snapshot");
    }
  });
});

describe("store — a placeholder must never publish a fabricated 0.00%", () => {
  // Without a snapshot leg (disabled, unentitled, API down) the placeholder's `last` and
  // the anchor's `prevClose` are the same number, so the computed chg is a STRUCTURAL zero.
  // The last completed session's move is the honest answer — in RTH as much as after it.
  for (const [label, now] of [["RTH", NOW_RTH], ["post-close", NOW_POST]]) {
    it(`${label}: falls back to prevSessionChg, not 0.00%`, () => {
      const anchor = {
        prevClose: PREV_CLOSE,
        anchor_source: "daily_file",
        prevSessionChg: 0.39491004826678305,
      };
      const store = placeholderStore(anchor);
      const q = store.getQuotes(["SKY"], now, null, null)["SKY"];
      assert.equal(q.chg, 0.39491004826678305,
        `${label} placeholder served chg=${q.chg} — a flat 0 here is the reported bug`);
    });
  }
});
