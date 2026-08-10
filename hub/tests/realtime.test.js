"use strict";
// Real-time tier: the MEASUREMENT is the product, not the env flag.
//
// Run with: node --test tests/realtime.test.js
//
// WHAT THIS PINS. `HUB_REALTIME_QUOTES=1` enables a faster poll and a last-trade parse. It must
// never, on its own, cause a quote to be labelled real-time. The basis comes from verdict(),
// which times the youngest print seen against the wall clock. The tests below are written so
// that deleting the measurement and hard-coding `tier: "realtime"` FAILS — several of them
// assert the NON-real-time outcome under a feed that is fully enabled.

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { Store } = require("../lib/store");
const { SnapshotFeed } = require("../lib/snapshot");

// 2026-08-07 (Friday) 10:00 ET = 14:00 UTC — mid-session.
const RTH = Date.UTC(2026, 7, 7, 14, 0);
// 2026-08-08 (Saturday) 04:41 ET = 08:41 UTC — the weekend this feature was built on.
const WEEKEND = Date.UTC(2026, 7, 8, 8, 41);

const PREV_CLOSE = 312.41;
const LAST_TRADE = 313.25;

/** A Polygon snapshot row whose lastTrade is `ageMs` old at `nowMs`. */
function row(sym, nowMs, ageMs, { price = LAST_TRADE, prevClose = PREV_CLOSE } = {}) {
  const printMs = nowMs - ageMs;
  return {
    ticker: sym,
    day: { o: 311.9, h: 314.1, l: 311.2, c: price, v: 34_562_295 },
    prevDay: { c: prevClose },
    lastTrade: { p: price, s: 100, t: printMs * 1e6 }, // NANOseconds
    min: { c: price, t: printMs },                      // MILLIseconds
    updated: printMs * 1e6,
  };
}

function feedOf(rows, { realtime = true } = {}) {
  return new SnapshotFeed({ apiKey: "test-key", realtime, fetchJson: async () => ({ tickers: rows }) });
}

describe("parseSnapshot — unit discipline on the two timestamp fields", () => {
  it("reads lastTrade.t as NANOseconds and min.t as MILLIseconds", async () => {
    const { parseSnapshot } = require("../lib/snapshot");
    const snap = parseSnapshot(row("AAPL", RTH, 3_000));
    // Confusing the two units puts the print 10^6 out — a confidently wrong freshness verdict.
    assert.equal(snap.printMs, RTH - 3_000);
    assert.equal(snap.printFrom, "lastTrade");
    assert.equal(snap.printPrice, LAST_TRADE);
  });

  it("falls back to the minute bar, then to `updated`, when there is no trade block", () => {
    const { parseSnapshot } = require("../lib/snapshot");
    const noTrade = row("AAPL", RTH, 5_000);
    delete noTrade.lastTrade;
    assert.equal(parseSnapshot(noTrade).printFrom, "min");

    const bare = row("AAPL", RTH, 5_000);
    delete bare.lastTrade;
    delete bare.min;
    assert.equal(parseSnapshot(bare).printFrom, "updated");
  });
});

describe("verdict — measured, not configured", () => {
  it("grades a seconds-old print as real-time DURING a session", async () => {
    const feed = feedOf([row("AAPL", RTH, 3_000)]);
    feed.demand("AAPL", RTH);
    // Fixed clock: without it this assertion degrades to "closed" every weekend and stops
    // testing the rule it was written for.
    await feed._flush(RTH);
    const v = feed.verdict(RTH);
    assert.equal(v.tier, "realtime");
    assert.equal(v.floorLagMs, 3_000);
    assert.equal(v.session, "rth");
  });

  it("grades a 15-minute-old print as delayed, from the same measurement", async () => {
    const feed = feedOf([row("AAPL", RTH, 15 * 60_000 + 2_000)]);
    feed.demand("AAPL", RTH);
    await feed._flush(RTH);
    assert.equal(feed.verdict(RTH).tier, "delayed");
  });

  it("ignores a print from a PREVIOUS session when measuring the floor", async () => {
    // A row left over from yesterday would otherwise contribute a multi-hour floor and mask a
    // genuine measurement — or, on a stale cache, invent one.
    const stale = row("AAPL", RTH, 26 * 3600_000); // ~yesterday
    const feed = feedOf([stale]);
    feed.demand("AAPL", RTH);
    await feed._flush(RTH);
    assert.equal(feed.verdict(RTH).tier, "unknown");
    assert.equal(feed._floorLagMs, null);
  });

  it("REFUSES to grade on a weekend — an old print proves nothing when nothing is printing", () => {
    const feed = feedOf([row("AAPL", WEEKEND, 3_000)]);
    const v = feed.verdict(WEEKEND);
    assert.equal(v.tier, "closed",
      "a Saturday must not read as 'delayed' — the tape is shut, not lagging");
    assert.equal(v.floorLagMs, null);
  });

  it("is 'off' when the real-time leg was never enabled", () => {
    const feed = feedOf([row("AAPL", RTH, 3_000)], { realtime: false });
    assert.equal(feed.verdict(RTH).tier, "off");
  });

  it("is 'unknown' before anything has been measured — never optimistic by default", () => {
    const feed = feedOf([]);
    const v = feed.verdict(RTH);
    assert.equal(v.tier, "unknown");
    assert.equal(v.floorLagMs, null);
  });

  it("measures the FLOOR across symbols, so one quiet ticker cannot demote a live feed", () => {
    // MSFT has not printed in 11 minutes (legitimate for an illiquid window); AAPL printed 2s
    // ago. The feed is real-time — a per-symbol rule would have called it delayed.
    const feed = feedOf([]);
    feed._floorLagMs = 2_000;
    feed._floorAt = RTH;
    assert.equal(feed.verdict(RTH).tier, "realtime");

    // …and a floor that is genuinely 15 minutes old is the delayed plan, correctly identified.
    feed._floorLagMs = 15 * 60_000 + 30_000;
    feed._floorAt = RTH;
    const delayed = feed.verdict(RTH);
    assert.equal(delayed.tier, "delayed");
    assert.equal(delayed.floorLagMs, 15 * 60_000 + 30_000);
  });

  it("expires a stale measurement rather than re-serving it forever", () => {
    const feed = feedOf([]);
    feed._floorLagMs = 2_000;
    feed._floorAt = RTH - 20 * 60_000; // measured 20 min ago, window is 5
    assert.equal(feed.verdict(RTH).tier, "unknown");
  });
});

describe("store overlay — freshest print wins, but only on a measured real-time feed", () => {
  const anchor = { prevClose: PREV_CLOSE, close: null, anchor_source: "daily_file" };

  /** Store whose AAPL row came from the 15-min-delayed AM.* stream, stamped 15 min ago. */
  function delayedStreamStore(nowMs) {
    const store = new Store("/dev/null/manifest.json", { get: () => anchor });
    store.quotes.set("AAPL", {
      sym: "AAPL",
      last: 311.00,
      market: "us",
      live: false,
      source: "polygon-delayed",
      basis: "DELAYED_15M",
      regularSession: "rth",
      regularSessionDate: "2026-08-07",
      ts: Math.floor((nowMs - 15 * 60_000) / 1000),
    });
    return store;
  }

  it("a MEASURED real-time snapshot overrides a 15-min-old stream print", async () => {
    const store = delayedStreamStore(RTH);
    const feed = feedOf([row("AAPL", RTH, 3_000)]);
    feed.demand("AAPL", RTH);
    await feed._flush();
    // Pin the measurement to the test clock so the assertion is about the RULE, not about
    // how long this process took to get here.
    feed._floorLagMs = 3_000;
    feed._floorAt = RTH;

    const out = store.getQuotes(["AAPL"], RTH, null, feed);
    assert.equal(out.AAPL.basis, "REALTIME");
    assert.equal(out.AAPL.source, "polygon-snapshot-rt");
    assert.equal(out.AAPL.last, LAST_TRADE, "the delayed 311.00 must not survive");
    assert.equal(out.AAPL.live, true);
    assert.ok(out.AAPL.lagMs != null, "the number the verdict was made on rides along");
    // asOfMs is the STABLE half of the pair — it moves only when a new print lands, which is
    // what lets the client skip a re-render on a quiet symbol without freezing the shown age.
    assert.equal(out.AAPL.asOfMs, RTH - 3_000);
    // ONE chg formula, recomputed against the price actually published.
    const want = ((LAST_TRADE - PREV_CLOSE) / PREV_CLOSE) * 100;
    assert.ok(Math.abs(out.AAPL.chg - want) < 1e-9, `chg=${out.AAPL.chg}`);
  });

  it("does NOT override when the feed has not measured itself real-time", async () => {
    // Same data, same freshness, real-time mode OFF. The old rule (stream is authoritative)
    // must still hold, and nothing may claim REALTIME.
    const store = delayedStreamStore(RTH);
    const feed = feedOf([row("AAPL", RTH, 3_000)], { realtime: false });
    feed.demand("AAPL", RTH);
    await feed._flush();

    const out = store.getQuotes(["AAPL"], RTH, null, feed);
    assert.equal(out.AAPL.basis, "DELAYED_15M");
    assert.equal(out.AAPL.last, 311.00);
    assert.notEqual(out.AAPL.source, "polygon-snapshot-rt");
  });

  it("does not override on a TIE — a quiet symbol must not flap between two legs", async () => {
    const store = delayedStreamStore(RTH);
    const streamTs = store.quotes.get("AAPL").ts;
    // Snapshot print lands on the very second the stream already reported.
    const feed = feedOf([row("AAPL", RTH, RTH - streamTs * 1000)]);
    feed.demand("AAPL", RTH);
    await feed._flush();
    feed._floorLagMs = 3_000;
    feed._floorAt = RTH;

    const out = store.getQuotes(["AAPL"], RTH, null, feed);
    assert.equal(out.AAPL.basis, "DELAYED_15M", "equal timestamps keep the incumbent");
  });

  it("still rescues a symbol the stream is not carrying at all (the SKY path, unchanged)", async () => {
    const store = new Store("/dev/null/manifest.json", { get: () => anchor });
    store.quotes.set("AAPL", {
      sym: "AAPL", last: PREV_CLOSE, market: "us", live: false,
      source: "polygon-delayed", basis: "DELAYED_15M", regularSession: "closed",
      ts: Math.floor(RTH / 1000),
    });
    const feed = feedOf([row("AAPL", RTH, 4_000)], { realtime: false });
    feed.demand("AAPL", RTH);
    await feed._flush();

    const out = store.getQuotes(["AAPL"], RTH, null, feed);
    assert.equal(out.AAPL.regularSessionDate, "2026-08-07");
    assert.equal(out.AAPL.last, LAST_TRADE);
  });
});

describe("per-NAME freshness — the verdict grades the feed, but the badge is per symbol", () => {
  // 2026-08-07 (Friday) 15:30 ET = 19:30 UTC — late in the session.
  const LATE = Date.UTC(2026, 7, 7, 19, 30);
  // 09:35 ET the SAME day: a real print, from this session, but 5h55m stale by LATE.
  const QUIET_PRINT = Date.UTC(2026, 7, 7, 13, 35);
  const anchor = { prevClose: 11.0, close: null, anchor_source: "daily_file" };

  /** A name that DID trade today (day.c > 0, so the 0=MISSING rule admits the row) and has not
   *  printed since `printMs`. `updated` is now, which is what dates the snapshot as today's. */
  const quietRow = (printMs) => ({
    ticker: "SGML",
    day: { o: 9.5, h: 9.6, l: 9.4, c: 9.5, v: 1200 },
    prevDay: { c: 11.0 },
    lastTrade: { p: 9.5, s: 100, t: printMs * 1e6 }, // NANOseconds
    updated: LATE * 1e6,
  });

  /** Store in the SKY shape: the stream is not carrying SGML today at all. */
  function storeWithoutTodaysPrint() {
    const store = new Store("/dev/null/manifest.json", { get: () => anchor });
    store.quotes.set("SGML", {
      sym: "SGML", last: 11.0, market: "us", live: false, source: "manifest",
      basis: "EOD", regularSession: "rth", regularSessionDate: "2026-08-06",
      ts: Math.floor(Date.UTC(2026, 7, 7, 0, 0) / 1000),
    });
    return store;
  }

  /** Liquid sibling printing 3s ago — this is what holds the FEED's floor at real-time. */
  const liquidRow = () => row("AAPL", LATE, 3_000);

  it("does NOT adopt a name's hours-old print as real-time, however fresh its siblings are", async () => {
    // The measured failure this bounds: floorLagMs=3000 from AAPL let SGML's 5h55m-old print
    // publish basis:"REALTIME", live:true — a green "Live" chip on a six-hour-old price, with
    // the true age reachable only on hover.
    const feed = feedOf([liquidRow(), quietRow(QUIET_PRINT)]);
    feed.demand("AAPL", LATE); feed.demand("SGML", LATE);
    await feed._flush(LATE);

    assert.equal(feed.verdict(LATE).tier, "realtime", "the FEED is genuinely real-time");

    const out = storeWithoutTodaysPrint().getQuotes(["SGML"], LATE, null, feed);
    assert.equal(out.SGML.basis, "DELAYED_15M", "a stale print cannot ride a fresh floor");
    assert.equal(out.SGML.live, false);
    assert.notEqual(out.SGML.source, "polygon-snapshot-rt");
    // The measurement still rides along — the row is honest about its age either way.
    assert.ok(out.SGML.lagMs > 5 * 3600_000, `lagMs=${out.SGML.lagMs}`);
  });

  it("still adopts the SAME name once its own print is fresh — the bound is not a blanket refusal", async () => {
    // Guards against over-correcting: an ordinarily quiet name that has just printed must still
    // read live, or the fix trades one wrong label for the opposite wrong label.
    const feed = feedOf([liquidRow(), quietRow(LATE - 40_000)]);
    feed.demand("AAPL", LATE); feed.demand("SGML", LATE);
    await feed._flush(LATE);

    const out = storeWithoutTodaysPrint().getQuotes(["SGML"], LATE, null, feed);
    assert.equal(out.SGML.basis, "REALTIME");
    assert.equal(out.SGML.live, true);
    assert.equal(out.SGML.last, 9.5);
  });
});

describe("the freshness floor spans the whole flush, not the last chunk", () => {
  const LATE = Date.UTC(2026, 7, 7, 19, 30);

  it("takes the MINIMUM across chunks, so a trailing quiet chunk cannot demote a live feed", async () => {
    // CHUNK is 50, so 60 symbols are two upstream calls. The youngest print in the batch sits in
    // the FIRST chunk; the second chunk is entirely 10-minute-old prints. A per-chunk write made
    // the last chunk win and graded this feed "delayed" — flapping basis/live/source on every
    // symbol between polls.
    const fresh = row("AAPL", LATE, 3_000);
    const stale = (i) => row(`Q${i}`, LATE, 10 * 60_000);
    const rows = [fresh, ...Array.from({ length: 59 }, (_, i) => stale(i))];
    const bySym = new Map(rows.map((r) => [r.ticker, r]));

    const feed = new SnapshotFeed({
      apiKey: "test-key", realtime: true,
      // Honour the chunking: return only the rows this request actually asked for. A stub that
      // returns every row for every call would put the fresh print in both chunks and the test
      // would pass against the defect.
      fetchJson: async (url) => {
        const asked = decodeURIComponent(new URL(url).searchParams.get("tickers") || "").split(",");
        return { tickers: asked.map((s) => bySym.get(s)).filter(Boolean) };
      },
    });
    for (const r of rows) feed.demand(r.ticker, LATE);
    await feed._flush(LATE);

    const v = feed.verdict(LATE);
    assert.equal(v.floorLagMs, 3_000, "the floor is the youngest print in the whole flush");
    assert.equal(v.tier, "realtime");
  });
});
