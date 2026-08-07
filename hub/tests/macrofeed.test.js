"use strict";
// Unit tests for lib/macrofeed.js — Sina parsing, unit scaling, Beijing→epoch,
// Yahoo-spark chunking, LRU demand, and leg preference.
// Run with: node --test "tests/*.test.js"   (Node ≥ 18 built-in test runner)
// Or via:   npm test  (from hub/ directory)
//
// Fully offline: every HTTP transport is injected. No network calls.

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");

const {
  MacroFeed,
  isMacroSymbol,
  SINA_MAP,
  parseSinaPayload,
  parseYahooSpark,
  beijingToEpochSec,
  chunkSyms,
  MACRO_LRU_CAP,
  YAHOO_CHUNK_MAX,
  SINA_STALE_MS,
  SINA_POLL_INTERVAL_MS,
  YAHOO_POLL_INTERVAL_MS,
  SINA_MAX_BACKOFF_MS,
  YAHOO_MAX_BACKOFF_MS,
} = require("../lib/macrofeed");

// ── Live fixture ─────────────────────────────────────────────────────────────
// Captured from https://hq.sinajs.cn/list=... on the production VPS, 2026-07-27.
// Reproduced byte-for-byte (modulo the GBK→UTF-8 name bytes, which we never read).
// hf_PL is included because Sina genuinely returns an empty string for platinum.

const SINA_FIXTURE = [
  'var hq_str_hf_CL="82.543,,82.540,82.550,86.200,82.460,17:32:43,89.310,86.120,0,6,1,2026-07-27,纽约原油,0";',
  'var hq_str_hf_OIL="84.954,,84.950,84.960,88.950,84.910,17:32:35,91.680,88.800,0,2,1,2026-07-27,布伦特原油,169225";',
  'var hq_str_hf_NG="2.776,,2.776,2.777,2.870,2.768,17:32:18,2.888,2.850,0,16,3,2026-07-27,美国天然气,0";',
  'var hq_str_hf_GC="4093.528,,4094.100,4094.200,4119.300,4085.800,17:32:43,4070.800,4097.500,0,2,3,2026-07-27,纽约黄金,0";',
  'var hq_str_hf_SI="59.557,,59.575,59.595,60.395,59.355,17:32:33,58.906,59.810,0,1,4,2026-07-27,纽约白银,0";',
  'var hq_str_hf_HG="640.013,,639.900,640.000,640.650,634.000,17:32:40,635.750,636.200,0,3,5,2026-07-27,美铜,0";',
  'var hq_str_hf_C="485.250,,485.250,485.500,494.250,485.250,17:31:44,496.750,492.250,0,3,5,2026-07-27,美国玉米,0";',
  'var hq_str_hf_S="1215.230,,1215.250,1215.500,1250.000,1215.000,17:32:43,1253.500,1246.000,0,6,12,2026-07-27,美国大豆,0";',
  'var hq_str_hf_W="719.725,,718.500,719.500,729.500,719.500,17:30:23,729.250,729.500,0,8,6,2026-07-27,美国小麦,0";',
  'var hq_str_hf_ES="7518.635,,7518.250,7518.750,7520.000,7486.000,17:32:41,7447.500,7490.000,0,21,18,2026-07-27,标普500指数期货,0";',
  'var hq_str_hf_NQ="28733.170,,28731.000,28732.250,28749.500,28500.000,17:32:43,28282.250,28500.000,0,2,3,2026-07-27,纳斯达克指数期货,0";',
  'var hq_str_hf_YM="52641.880,,52639.000,52642.000,52649.000,52299.000,17:32:42,52124.000,52299.000,0,4,3,2026-07-27,道琼斯指数期货,0";',
  'var hq_str_DINIW="17:32:40,101.2757,101.2757,101.4647,2132,101.2827,101.3280,101.1148,101.2757,美元指数,2026-07-27";',
  'var hq_str_hf_PL="";',
].join("\n");

/** Index the parsed fixture by symbol. */
function parsedBySym(text) {
  const map = new Map();
  for (const q of parseSinaPayload(text, Date.UTC(2026, 6, 27, 9, 33, 0))) map.set(q.sym, q);
  return map;
}

// 2026-07-27 17:32:43 Beijing (UTC+8) === 2026-07-27 09:32:43 UTC
const CL_TS = Math.floor(Date.UTC(2026, 6, 27, 9, 32, 43) / 1000);
const DINIW_TS = Math.floor(Date.UTC(2026, 6, 27, 9, 32, 40) / 1000);

const EPS = 1e-9;
const near = (a, b, eps = EPS) => Math.abs(a - b) < eps;

// ── Sina parsing ─────────────────────────────────────────────────────────────

describe("parseSinaPayload — live 2026-07-27 fixture", () => {
  const bySym = parsedBySym(SINA_FIXTURE);

  it("parses 13 rows (12 hf_* + DINIW); hf_PL is skipped", () => {
    assert.equal(bySym.size, 13, `expected 13 usable rows, got ${bySym.size}`);
  });

  it("maps every Sina code back to its Yahoo-style symbol", () => {
    for (const sym of [
      "CL=F", "BZ=F", "NG=F", "GC=F", "SI=F", "HG=F",
      "ZC=F", "ZS=F", "ZW=F", "ES=F", "NQ=F", "YM=F", "DX-Y.NYB",
    ]) {
      assert.ok(bySym.has(sym), `${sym} must be present (code ${SINA_MAP[sym]})`);
    }
  });

  it("PL=F is absent — Sina returns an empty string for platinum", () => {
    assert.ok(!bySym.has("PL=F"), "platinum is not carried by Sina and must not be invented");
  });

  it("CL=F: every field maps to the documented hf_* layout", () => {
    const q = bySym.get("CL=F");
    assert.equal(q.last, 82.543, "[0] last");
    assert.equal(q.prevClose, 89.31, "[7] prior settle (matches Friday 2026-07-24 CL=F close 89.31)");
    assert.equal(q.open, 86.12, "[8] open");
    assert.equal(q.high, 86.2, "[4] session high");
    assert.equal(q.low, 82.46, "[5] session low");
    assert.equal(q.ts, CL_TS, "[12]+[6] Beijing wall-clock → epoch seconds");
    assert.equal(q.vol, null);
    assert.equal(q.amount, null);
  });

  it("CL=F: chg is computed against the prior settle", () => {
    const q = bySym.get("CL=F");
    const expected = ((82.543 - 89.31) / 89.31) * 100;
    assert.ok(near(q.chg, expected, 1e-9), `chg=${q.chg} expected≈${expected}`);
    assert.ok(q.chg < 0, "82.543 vs a 89.310 settle is a decline");
  });

  it("labels the Sina leg source=sina basis=LIVE live=true market=macro", () => {
    for (const q of bySym.values()) {
      assert.equal(q.source, "sina", `${q.sym} source`);
      assert.equal(q.basis, "LIVE", `${q.sym} basis`);
      assert.equal(q.live, true, `${q.sym} live`);
      assert.equal(q.market, "macro", `${q.sym} market`);
    }
  });

  it("HG=F: COMEX copper is rescaled from US cents/lb to USD/lb (×0.01)", () => {
    const q = bySym.get("HG=F");
    // Sina row: last 640.013, high 640.650, low 634.000, settle 635.750, open 636.200
    assert.ok(near(q.last, 6.40013), `last=${q.last} expected≈6.40013 (raw 640.013)`);
    assert.ok(near(q.high, 6.4065), `high=${q.high} expected≈6.40650`);
    assert.ok(near(q.low, 6.34), `low=${q.low} expected≈6.34000`);
    assert.ok(near(q.prevClose, 6.3575), `prevClose=${q.prevClose} expected≈6.35750`);
    assert.ok(near(q.open, 6.362), `open=${q.open} expected≈6.36200`);
    assert.ok(q.last < 10, "a USD/lb copper print must not look 100× the chart");
  });

  it("HG=F: chg is scale-invariant (identical to the unscaled ratio)", () => {
    const q = bySym.get("HG=F");
    const expected = ((640.013 - 635.75) / 635.75) * 100;
    assert.ok(near(q.chg, expected, 1e-9), `chg=${q.chg} expected≈${expected}`);
  });

  it("no other symbol is rescaled — GC=F keeps its raw magnitude", () => {
    const q = bySym.get("GC=F");
    assert.equal(q.last, 4093.528, "gold must not be touched by the copper scale");
    assert.equal(q.prevClose, 4070.8);
  });

  it("DX-Y.NYB: the DINIW row uses its own field layout", () => {
    const q = bySym.get("DX-Y.NYB");
    assert.equal(q.last, 101.2757, "[1] last");
    assert.equal(q.prevClose, 101.4647, "[3] prev close (Friday close)");
    assert.equal(q.open, 101.2827, "[5] open");
    assert.equal(q.high, 101.328, "[6] high");
    assert.equal(q.low, 101.1148, "[7] low");
    assert.equal(q.ts, DINIW_TS, "[10]+[0] Beijing wall-clock → epoch seconds");
    // Sanity: the last print must sit inside the day's range.
    assert.ok(q.last >= q.low && q.last <= q.high, "last must lie within [low, high]");
  });

  it("index futures carry sane values (ES/NQ/YM)", () => {
    assert.equal(bySym.get("ES=F").last, 7518.635);
    assert.equal(bySym.get("NQ=F").last, 28733.17);
    assert.equal(bySym.get("YM=F").last, 52641.88);
    assert.equal(bySym.get("ES=F").prevClose, 7447.5);
  });
});

describe("parseSinaPayload — skip rules", () => {
  it("skips an empty payload on a MAPPED code", () => {
    // hf_PL exercises the unknown-code branch (PL=F is not in SINA_MAP at all).
    // This case exercises the empty-payload branch for a code we DO map.
    const text = [
      'var hq_str_hf_NG="";',
      'var hq_str_hf_CL="82.543,,82.540,82.550,86.200,82.460,17:32:43,89.310,86.120,0,6,1,2026-07-27,纽约原油,0";',
    ].join("\n");
    const rows = parseSinaPayload(text);
    assert.equal(rows.length, 1, "the empty NG row must be skipped, CL must survive");
    assert.equal(rows[0].sym, "CL=F");
  });

  it("ignores codes we never mapped", () => {
    const rows = parseSinaPayload('var hq_str_hf_ZZZ="1,,2,3,4,5,17:00:00,6,7,0,0,0,2026-07-27,x,0";');
    assert.equal(rows.length, 0);
  });

  it("skips a row whose last is non-finite", () => {
    const rows = parseSinaPayload('var hq_str_hf_CL="n/a,,1,2,3,4,17:00:00,5,6,0,0,0,2026-07-27,x,0";');
    assert.equal(rows.length, 0);
  });

  it("skips a row whose last is zero or negative", () => {
    const zero = parseSinaPayload('var hq_str_hf_CL="0,,1,2,3,4,17:00:00,5,6,0,0,0,2026-07-27,x,0";');
    assert.equal(zero.length, 0, "0 is a placeholder, not a print");
    const neg = parseSinaPayload('var hq_str_hf_CL="-1,,1,2,3,4,17:00:00,5,6,0,0,0,2026-07-27,x,0";');
    assert.equal(neg.length, 0);
  });

  it("skips a truncated row", () => {
    assert.equal(parseSinaPayload('var hq_str_hf_CL="82.543,,82.540";').length, 0);
    assert.equal(parseSinaPayload('var hq_str_DINIW="17:32:40,101.2757";').length, 0);
  });

  it("returns [] for empty / garbage bodies", () => {
    assert.deepEqual(parseSinaPayload(""), []);
    assert.deepEqual(parseSinaPayload(null), []);
    assert.deepEqual(parseSinaPayload("<html>403 forbidden</html>"), []);
  });

  it("null prevClose yields chg=null rather than a fabricated number", () => {
    const rows = parseSinaPayload('var hq_str_hf_CL="82.543,,1,2,3,4,17:00:00,,6,0,0,0,2026-07-27,x,0";');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].prevClose, null);
    assert.equal(rows[0].chg, null, "no reference close → no percent change");
  });

  it("zero prevClose yields chg=null (no divide-by-zero)", () => {
    const rows = parseSinaPayload('var hq_str_hf_CL="82.543,,1,2,3,4,17:00:00,0,6,0,0,0,2026-07-27,x,0";');
    assert.equal(rows[0].chg, null);
  });
});

// ── Beijing → epoch ──────────────────────────────────────────────────────────

describe("beijingToEpochSec — UTC+8, no DST", () => {
  it("2026-07-27 17:32:43 Beijing → 2026-07-27 09:32:43 UTC", () => {
    const ts = beijingToEpochSec("2026-07-27", "17:32:43");
    assert.equal(ts, CL_TS);
    assert.equal(new Date(ts * 1000).toISOString(), "2026-07-27T09:32:43.000Z");
  });

  it("an early-morning Beijing time rolls back to the previous UTC day", () => {
    // 03:00 Beijing on the 27th = 19:00 UTC on the 26th.
    const ts = beijingToEpochSec("2026-07-27", "03:00:00");
    assert.equal(new Date(ts * 1000).toISOString(), "2026-07-26T19:00:00.000Z");
  });

  it("returns null for unparseable date or time", () => {
    assert.equal(beijingToEpochSec("", "17:32:43"), null);
    assert.equal(beijingToEpochSec("2026-07-27", ""), null);
    assert.equal(beijingToEpochSec("27/07/2026", "17:32:43"), null);
    assert.equal(beijingToEpochSec("2026-07-27", "17:32"), null);
    assert.equal(beijingToEpochSec(null, null), null);
  });
});

// ── Symbol routing ───────────────────────────────────────────────────────────

describe("isMacroSymbol", () => {
  it("accepts futures, caret indices, FX pairs and the dollar index", () => {
    for (const s of ["CL=F", "ES=F", "HG=F", "^GSPC", "^TNX", "^VIX", "EURUSD=X", "JPY=X", "DX-Y.NYB"]) {
      assert.equal(isMacroSymbol(s), true, `${s} must be macro`);
    }
  });

  it("rejects equities, crypto and non-US listings", () => {
    for (const s of ["AAPL", "SOFI", "BTC-USD", "ETH-USD", "600519.SS", "0700.HK", "SHOP.TO"]) {
      assert.equal(isMacroSymbol(s), false, `${s} must NOT be macro`);
    }
  });

  it("rejects empty / non-string input", () => {
    assert.equal(isMacroSymbol(""), false);
    assert.equal(isMacroSymbol(null), false);
    assert.equal(isMacroSymbol(undefined), false);
    assert.equal(isMacroSymbol(42), false);
  });
});

// ── Yahoo spark ──────────────────────────────────────────────────────────────

describe("chunkSyms", () => {
  it("splits 20 symbols into 18 + 2 (Yahoo 400s above ~20 per call)", () => {
    const syms = Array.from({ length: 20 }, (_, i) => `S${i}`);
    const chunks = chunkSyms(syms, YAHOO_CHUNK_MAX);
    assert.deepEqual(chunks.map((c) => c.length), [18, 2]);
  });

  it("never emits a chunk above the cap", () => {
    for (const n of [1, 17, 18, 19, 36, 37, 100]) {
      const chunks = chunkSyms(Array.from({ length: n }, (_, i) => `S${i}`), YAHOO_CHUNK_MAX);
      for (const c of chunks) assert.ok(c.length <= YAHOO_CHUNK_MAX, `chunk of ${c.length} exceeds cap`);
      assert.equal(chunks.reduce((a, c) => a + c.length, 0), n, "no symbol lost");
    }
  });

  it("returns [] for an empty list", () => {
    assert.deepEqual(chunkSyms([], YAHOO_CHUNK_MAX), []);
  });
});

describe("parseYahooSpark", () => {
  it("parses the spark envelope form (meta-bearing)", () => {
    const json = {
      spark: {
        result: [
          {
            symbol: "^GSPC",
            response: [
              {
                meta: {
                  symbol: "^GSPC",
                  regularMarketPrice: 7501.25,
                  previousClose: 7447.5,
                  regularMarketTime: 1785144699,
                },
                timestamp: [1785140000, 1785140300],
                indicators: { quote: [{ close: [7490.1, 7501.25] }] },
              },
            ],
          },
        ],
        error: null,
      },
    };
    const rows = parseYahooSpark(json);
    assert.equal(rows.length, 1);
    const q = rows[0];
    assert.equal(q.sym, "^GSPC");
    assert.equal(q.last, 7501.25);
    assert.equal(q.prevClose, 7447.5);
    assert.equal(q.ts, 1785144699);
    assert.ok(near(q.chg, ((7501.25 - 7447.5) / 7447.5) * 100, 1e-9));
  });

  it("parses the flat form, falling back to close[] and chartPreviousClose", () => {
    const json = {
      "^TNX": {
        symbol: "^TNX",
        chartPreviousClose: 4.21,
        previousClose: null,
        close: [4.19, 4.22, null],
        timestamp: [1785140000, 1785140300, 1785140600],
        dataGranularity: 300,
      },
    };
    const rows = parseYahooSpark(json);
    assert.equal(rows.length, 1);
    const q = rows[0];
    assert.equal(q.sym, "^TNX");
    assert.equal(q.last, 4.22, "last finite close wins when meta has no regularMarketPrice");
    assert.equal(q.prevClose, 4.21, "chartPreviousClose is the fallback reference");
    assert.equal(q.ts, 1785140600, "last finite timestamp");
  });

  it("labels the Yahoo leg source=yahoo-spark basis=DELAYED_15M live=false", () => {
    const json = { "^VIX": { symbol: "^VIX", close: [15.2], timestamp: [1785140000], chartPreviousClose: 15.0 } };
    const q = parseYahooSpark(json)[0];
    assert.equal(q.source, "yahoo-spark");
    assert.equal(q.basis, "DELAYED_15M", "a 15-minute-delayed source is NEVER labelled LIVE");
    assert.equal(q.live, false);
    assert.equal(q.market, "macro");
  });

  it("skips rows with no usable price", () => {
    const json = { "^BAD": { symbol: "^BAD", close: [null, null], timestamp: [1] } };
    assert.deepEqual(parseYahooSpark(json), []);
  });

  it("returns [] for empty / garbage payloads", () => {
    assert.deepEqual(parseYahooSpark(null), []);
    assert.deepEqual(parseYahooSpark({}), []);
    assert.deepEqual(parseYahooSpark({ spark: { result: [] } }), []);
  });
});

// ── LRU demand management ────────────────────────────────────────────────────

describe("MacroFeed LRU demand management", () => {
  it("demand registers a symbol", () => {
    const feed = new MacroFeed();
    try {
      assert.equal(feed._subs.size, 0);
      feed.demand("CL=F");
      assert.ok(feed._subs.has("CL=F"));
    } finally { feed.stop(); }
  });

  it("repeated demand is idempotent", () => {
    const feed = new MacroFeed();
    try {
      feed.demand("CL=F");
      feed.demand("CL=F");
      feed.demand("CL=F");
      assert.equal(feed._subs.size, 1);
    } finally { feed.stop(); }
  });

  it(`evicts the LRU symbol at cap (${MACRO_LRU_CAP})`, () => {
    const feed = new MacroFeed();
    try {
      feed.demand("FIRST=F");
      for (let i = 1; i < MACRO_LRU_CAP; i++) feed.demand(`S${i}=F`);
      assert.equal(feed._subs.size, MACRO_LRU_CAP);
      feed.demand("NEWCOMER=F");
      assert.equal(feed._subs.size, MACRO_LRU_CAP, "size must stay at cap");
      assert.ok(!feed._subs.has("FIRST=F"), "the LRU symbol must be evicted");
      assert.ok(feed._subs.has("NEWCOMER=F"));
    } finally { feed.stop(); }
  });

  it("re-demanding promotes to MRU so it survives the next eviction", () => {
    const feed = new MacroFeed();
    try {
      feed.demand("KEEP=F");
      for (let i = 0; i < MACRO_LRU_CAP - 1; i++) feed.demand(`X${i}=F`);
      feed.demand("KEEP=F"); // promote
      feed.demand("NEW=F");
      assert.ok(feed._subs.has("KEEP=F"), "re-demanded symbol must survive");
      assert.ok(!feed._subs.has("X0=F"), "the now-LRU symbol must be evicted instead");
    } finally { feed.stop(); }
  });

  it("eviction drops the evicted symbol's cached quotes from both legs", () => {
    const feed = new MacroFeed();
    try {
      feed.demand("FIRST=F");
      feed._sinaCache.set("FIRST=F", { sym: "FIRST=F", last: 1, ts: 1 });
      feed._yahooCache.set("FIRST=F", { sym: "FIRST=F", last: 1, ts: 1 });
      for (let i = 1; i < MACRO_LRU_CAP; i++) feed.demand(`S${i}=F`);
      feed.demand("NEWCOMER=F");
      assert.ok(!feed._sinaCache.has("FIRST=F"), "sina cache entry must be dropped on eviction");
      assert.ok(!feed._yahooCache.has("FIRST=F"), "yahoo cache entry must be dropped on eviction");
    } finally { feed.stop(); }
  });

  it("_sweepIdle drops symbols idle past 30 min, with their caches", () => {
    const feed = new MacroFeed();
    try {
      feed.demand("CL=F");
      feed.demand("GC=F");
      feed._sinaCache.set("CL=F", { sym: "CL=F", last: 82.5, ts: 1 });
      // Age CL=F past the 30-min idle window; leave GC=F fresh.
      feed._subs.get("CL=F").lastReq = Date.now() - 31 * 60 * 1000;
      const dropped = feed._sweepIdle(Date.now());
      assert.equal(dropped, 1);
      assert.ok(!feed._subs.has("CL=F"), "idle symbol must be unsubscribed");
      assert.ok(!feed._sinaCache.has("CL=F"), "its cache must go with it");
      assert.ok(feed._subs.has("GC=F"), "an actively-demanded symbol must survive");
    } finally { feed.stop(); }
  });
});

// ── Leg preference in getQuote ───────────────────────────────────────────────
//
// Every case below builds its cache state by running the REAL pollers against injected
// transports. Hand-seeding `_yahooCache` for a Sina-mapped symbol is exactly what hid the
// original defect: `_yahooSyms()` excluded SINA_MAP symbols, so the state the old tests
// wrote by hand could never occur in production and the freshness branch they exercised was
// dead code. If the poll paths ever stop populating both legs, these tests go red.

describe("MacroFeed.getQuote — leg preference (state built by the real pollers)", () => {
  const now = Date.UTC(2026, 6, 27, 10, 0, 0);
  const sec = (ms) => Math.floor(ms / 1000);

  /** An hf_CL row stamped with the Beijing (UTC+8) wall clock for `ms`. */
  function sinaRowAt(ms, last = 82.5) {
    const d = new Date(ms + 8 * 60 * 60 * 1000); // shift to Beijing, then read UTC getters
    const p = (n) => String(n).padStart(2, "0");
    const date = `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
    const time = `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
    return `var hq_str_hf_CL="${last},,${last},${last},86.200,82.460,${time},89.310,86.120,0,6,1,${date},x,0";`;
  }

  /** A flat-form spark payload for CL=F printed at `ms`. */
  function sparkAt(ms, last = 82.4) {
    return { "CL=F": { symbol: "CL=F", regularMarketPrice: last, previousClose: 89.31, regularMarketTime: sec(ms) } };
  }

  /**
   * Demand CL=F and run ONE cycle of each poller.
   * `sinaAt: null` → Sina answers with an empty row (contract not carried / no print).
   * `yahooAt: null` → the spark chunk comes back with nothing for the symbol.
   */
  async function polled({ sinaAt = null, yahooAt = null, sinaLast = 82.5, yahooLast = 82.4 } = {}) {
    const feed = new MacroFeed({
      fetchSina: async () => (sinaAt == null ? 'var hq_str_hf_CL="";' : sinaRowAt(sinaAt, sinaLast)),
      fetchYahoo: async () => (yahooAt == null ? {} : sparkAt(yahooAt, yahooLast)),
    });
    feed.demand("CL=F");
    await feed._runSinaPoll();
    await feed._runYahooPoll();
    return feed;
  }

  it("returns null for an unknown symbol", () => {
    const feed = new MacroFeed();
    try { assert.equal(feed.getQuote("CL=F", now), null); } finally { feed.stop(); }
  });

  it("REACHABILITY: one poll cycle populates BOTH legs for a Sina-mapped symbol", async () => {
    // The premise of every fallback below. Before the fix _yahooCache stayed empty for CL=F
    // forever, so no amount of Sina staleness could ever produce a fallback.
    const feed = await polled({ sinaAt: now - 3000, yahooAt: now - 900_000 });
    try {
      assert.ok(feed._sinaCache.has("CL=F"), "sina leg populated");
      assert.ok(feed._yahooCache.has("CL=F"), "yahoo leg populated for a SINA_MAP symbol");
    } finally { feed.stop(); }
  });

  it("serves the Sina leg when only Sina has the symbol", async () => {
    const feed = await polled({ sinaAt: now - 5000 });
    try {
      const q = feed.getQuote("CL=F", now);
      assert.equal(q.source, "sina");
      assert.equal(q.basis, "LIVE");
      assert.equal(q.live, true);
    } finally { feed.stop(); }
  });

  it("serves the Yahoo leg when only Yahoo has the symbol", async () => {
    const feed = await polled({ yahooAt: now - 900_000 });
    try {
      const q = feed.getQuote("CL=F", now);
      assert.equal(q.source, "yahoo-spark");
      assert.equal(q.basis, "DELAYED_15M");
      assert.equal(q.live, false);
    } finally { feed.stop(); }
  });

  it("prefers the fresh LIVE Sina leg over Yahoo when both exist", async () => {
    const feed = await polled({ sinaAt: now - 3000, yahooAt: now - 60_000 });
    try {
      const q = feed.getQuote("CL=F", now);
      assert.equal(q.source, "sina");
      assert.equal(q.basis, "LIVE", "a seconds-old near-live print is genuinely live");
    } finally { feed.stop(); }
  });

  it("falls to Yahoo when the Sina print is stale (>15 min) and Yahoo is fresher", async () => {
    const feed = await polled({ sinaAt: now - SINA_STALE_MS - 60_000, yahooAt: now - 60_000 });
    try {
      const q = feed.getQuote("CL=F", now);
      assert.equal(q.source, "yahoo-spark", "a fresher delayed print beats a 16-min-old LIVE one");
      assert.equal(q.last, 82.4);
    } finally { feed.stop(); }
  });

  it("keeps the stale Sina print when the Yahoo entry is even older — but DEMOTED", async () => {
    const feed = await polled({
      sinaAt: now - SINA_STALE_MS - 60_000,
      yahooAt: now - 3 * 60 * 60 * 1000,
    });
    try {
      const q = feed.getQuote("CL=F", now);
      assert.equal(q.source, "sina", "never trade down to an older print");
      assert.equal(q.basis, "DELAYED_15M", "…but 16 minutes old is not LIVE");
      assert.equal(q.live, false);
    } finally { feed.stop(); }
  });

  it("STALE SINA IS NEVER LIVE: a >15-min print is served DELAYED_15M, price and ts intact", async () => {
    // The reported production shape: Sina answers once, then 4xxs. The last good print ages
    // out but keeps being served — it must not keep wearing the LIVE badge while it does.
    const feed = await polled({ sinaAt: now - 8 * 60 * 60 * 1000, sinaLast: 82.5 });
    try {
      const q = feed.getQuote("CL=F", now);
      assert.equal(q.source, "sina", "the last good print is still the best answer we have");
      assert.equal(q.basis, "DELAYED_15M", "an 8-hour-old print must NOT be labelled LIVE");
      assert.equal(q.live, false);
      assert.equal(q.last, 82.5, "the price itself is untouched — this is a labelling rule");
      assert.equal(q.ts, sec(now - 8 * 60 * 60 * 1000), "and it keeps its own honest timestamp");
    } finally { feed.stop(); }
  });

  it("holds the LIVE label right up to the 15-minute threshold", async () => {
    const fresh = await polled({ sinaAt: now - SINA_STALE_MS + 1000 });
    const stale = await polled({ sinaAt: now - SINA_STALE_MS - 1000 });
    try {
      assert.equal(fresh.getQuote("CL=F", now).basis, "LIVE", "14:59 old is still live");
      assert.equal(stale.getQuote("CL=F", now).basis, "DELAYED_15M", "15:01 old is not");
    } finally { fresh.stop(); stale.stop(); }
  });

  it("the demotion is a serve-time relabel — the cached entry is not mutated", async () => {
    const feed = await polled({ sinaAt: now - SINA_STALE_MS - 60_000 });
    try {
      feed.getQuote("CL=F", now);
      assert.equal(feed._sinaCache.get("CL=F").basis, "LIVE",
        "the cache keeps the row as parsed; only the served copy is relabelled");
      assert.equal(feed._sinaCache.get("CL=F").live, true);
    } finally { feed.stop(); }
  });

  it("a weekend-old print is SERVED (honestly labelled), not suppressed", async () => {
    // Friday's settle is the correct answer all weekend. Hiding it would blank the tape.
    const feed = await polled({ sinaAt: now - 60 * 60 * 60 * 1000, sinaLast: 89.31 });
    try {
      const q = feed.getQuote("CL=F", now);
      assert.ok(q, "a stale quote is still a quote");
      assert.equal(q.last, 89.31);
      assert.equal(q.basis, "DELAYED_15M");
    } finally { feed.stop(); }
  });

  it("getAll returns present entries only", async () => {
    const feed = await polled({ sinaAt: now });
    try {
      const out = feed.getAll(["CL=F", "GC=F", "^GSPC"], now);
      assert.deepEqual(Object.keys(out), ["CL=F"], "absent symbols must simply not appear");
      assert.equal(out["CL=F"].last, 82.5);
    } finally { feed.stop(); }
  });
});

// ── Polling (injected transports — no network) ───────────────────────────────

describe("MacroFeed polling", () => {
  it("Sina poll skips the cycle entirely when nothing Sina-mapped is demanded", async () => {
    let calls = 0;
    const feed = new MacroFeed({ fetchSina: async () => { calls++; return ""; } });
    try {
      feed.demand("^GSPC"); // yahoo-only symbol
      await feed._runSinaPoll();
      assert.equal(calls, 0, "no Sina codes demanded → no request");
    } finally { feed.stop(); }
  });

  it("Sina poll batches every demanded code into ONE request", async () => {
    const seen = [];
    const feed = new MacroFeed({
      fetchSina: async (codes) => { seen.push(codes); return SINA_FIXTURE; },
    });
    try {
      feed.demand("CL=F");
      feed.demand("GC=F");
      feed.demand("HG=F");
      feed.demand("^GSPC"); // not Sina-mapped — must not appear in the code list
      await feed._runSinaPoll();
      assert.equal(seen.length, 1, "exactly one batched request per cycle");
      assert.deepEqual(seen[0], ["hf_CL", "hf_GC", "hf_HG"]);
      assert.ok(feed._sinaCache.has("CL=F"), "parsed rows land in the sina cache");
      assert.ok(near(feed._sinaCache.get("HG=F").last, 6.40013), "scaling applies through the poller");
      assert.ok(feed.lastSinaPollAt > 0, "health timestamp advances on success");
    } finally { feed.stop(); }
  });

  it("a failed Sina poll keeps the cache, counts the error, and never throws", async () => {
    const feed = new MacroFeed({
      fetchSina: async () => { throw new Error("HTTP 403"); },
    });
    try {
      feed.demand("CL=F");
      feed._sinaCache.set("CL=F", { sym: "CL=F", last: 82.5, ts: 1, source: "sina" });
      await feed._runSinaPoll(); // must resolve, not reject
      assert.equal(feed._sinaCache.get("CL=F").last, 82.5, "the last good quote survives the outage");
      assert.equal(feed.sinaConsecutiveErrors, 1);
      await feed._runSinaPoll();
      assert.equal(feed.sinaConsecutiveErrors, 2, "consecutive failures accumulate");
    } finally { feed.stop(); }
  });

  it("a recovered Sina poll resets the error counter", async () => {
    let fail = true;
    const feed = new MacroFeed({
      fetchSina: async () => { if (fail) throw new Error("boom"); return SINA_FIXTURE; },
    });
    try {
      feed.demand("CL=F");
      await feed._runSinaPoll();
      assert.equal(feed.sinaConsecutiveErrors, 1);
      fail = false;
      await feed._runSinaPoll();
      assert.equal(feed.sinaConsecutiveErrors, 0);
    } finally { feed.stop(); }
  });

  it("Yahoo poll chunks demanded symbols at ≤18 per request", async () => {
    const chunkSizes = [];
    const feed = new MacroFeed({
      fetchYahoo: async (syms) => { chunkSizes.push(syms.length); return {}; },
    });
    try {
      for (let i = 0; i < 20; i++) feed.demand(`^IDX${i}`);
      await feed._runYahooPoll();
      assert.deepEqual(chunkSizes, [18, 2], "20 symbols → chunks of 18 and 2");
      for (const n of chunkSizes) assert.ok(n <= YAHOO_CHUNK_MAX);
    } finally { feed.stop(); }
  });

  it("Yahoo poll covers EVERY demanded symbol, Sina-mapped ones included", async () => {
    // Not "everything Sina does not carry". The delayed spark entry is the standby getQuote()
    // falls to when a Sina print goes stale, so excluding SINA_MAP symbols here left that
    // fallback permanently unreachable.
    const seen = [];
    const feed = new MacroFeed({
      fetchYahoo: async (syms) => { seen.push(...syms); return {}; },
    });
    try {
      feed.demand("CL=F");   // sina-mapped — needs a fallback entry too
      feed.demand("^GSPC");  // yahoo-only
      feed.demand("PL=F");   // not carried by Sina → yahoo
      await feed._runYahooPoll();
      assert.deepEqual(seen.sort(), ["CL=F", "PL=F", "^GSPC"]);
    } finally { feed.stop(); }
  });

  it("Yahoo poll still runs when ONLY Sina symbols are demanded", async () => {
    let calls = 0;
    const feed = new MacroFeed({ fetchYahoo: async () => { calls++; return {}; } });
    try {
      feed.demand("CL=F");
      await feed._runYahooPoll();
      assert.equal(calls, 1, "the fallback cache is exactly what a Sina-only symbol needs");
    } finally { feed.stop(); }
  });

  it("Yahoo poll still skips the cycle when NOTHING is demanded", async () => {
    let calls = 0;
    const feed = new MacroFeed({ fetchYahoo: async () => { calls++; return {}; } });
    try {
      await feed._runYahooPoll();
      assert.equal(calls, 0);
    } finally { feed.stop(); }
  });

  it("one failed Yahoo chunk does not abort the remaining chunks", async () => {
    let n = 0;
    const feed = new MacroFeed({
      fetchYahoo: async (syms) => {
        n++;
        if (n === 1) throw new Error("HTTP 429");
        return { [syms[0]]: { symbol: syms[0], close: [10], timestamp: [1], chartPreviousClose: 9 } };
      },
    });
    try {
      for (let i = 0; i < 20; i++) feed.demand(`^IDX${i}`);
      await feed._runYahooPoll();
      assert.equal(n, 2, "both chunks attempted");
      assert.ok(feed._yahooCache.has("^IDX18"), "the surviving chunk still populated the cache");
      assert.equal(feed.yahooConsecutiveErrors, 1);
    } finally { feed.stop(); }
  });

  it("neither poller starts a timer without an explicit start()", () => {
    const feed = new MacroFeed();
    try {
      assert.equal(feed._sinaTimer, null);
      assert.equal(feed._yahooTimer, null);
    } finally { feed.stop(); }
  });
});

// ── Backoff on consecutive failures ──────────────────────────────────────────

describe("MacroFeed poll backoff", () => {
  /**
   * Capture the delay `fn` passes to setTimeout, without letting the callback run.
   * This reads the ACTUAL scheduling call, not a helper the scheduler might not use.
   */
  function armedDelay(fn) {
    const real = global.setTimeout;
    let ms = null;
    global.setTimeout = (cb, delay) => { ms = delay; return real(() => {}, 0); };
    try { fn(); } finally { global.setTimeout = real; }
    return ms;
  }

  it("Sina: a healthy leg re-arms at the base interval", async () => {
    const feed = new MacroFeed({ fetchSina: async () => SINA_FIXTURE });
    try {
      feed.demand("CL=F");
      await feed._runSinaPoll();
      assert.equal(feed.sinaConsecutiveErrors, 0);
      assert.equal(armedDelay(() => feed._scheduleSinaPoll()), SINA_POLL_INTERVAL_MS);
    } finally { feed.stop(); }
  });

  it("Sina: the delay DOUBLES per consecutive failure and caps at 60 s", async () => {
    const feed = new MacroFeed({ fetchSina: async () => { throw new Error("HTTP 429"); } });
    try {
      feed.demand("CL=F");
      const seen = [];
      for (let i = 0; i < 8; i++) {
        await feed._runSinaPoll();
        seen.push(armedDelay(() => feed._scheduleSinaPoll()));
      }
      // 3s × 2^min(n,5): 6, 12, 24, 48, 96→capped 60, then flat at the cap.
      assert.deepEqual(seen, [6000, 12000, 24000, 48000, 60000, 60000, 60000, 60000]);
      for (const d of seen) assert.ok(d <= SINA_MAX_BACKOFF_MS, `${d} exceeds the Sina cap`);
    } finally { feed.stop(); }
  });

  it("Sina: one success resets the delay to the base interval", async () => {
    let fail = true;
    const feed = new MacroFeed({
      fetchSina: async () => { if (fail) throw new Error("boom"); return SINA_FIXTURE; },
    });
    try {
      feed.demand("CL=F");
      await feed._runSinaPoll();
      await feed._runSinaPoll();
      assert.equal(armedDelay(() => feed._scheduleSinaPoll()), 12000, "backed off while failing");
      fail = false;
      await feed._runSinaPoll();
      assert.equal(feed.sinaConsecutiveErrors, 0);
      assert.equal(armedDelay(() => feed._scheduleSinaPoll()), SINA_POLL_INTERVAL_MS,
        "recovery must not leave the leg crawling at the backed-off cadence");
    } finally { feed.stop(); }
  });

  it("Yahoo: the delay DOUBLES per consecutive failure and caps at 300 s", async () => {
    const feed = new MacroFeed({ fetchYahoo: async () => { throw new Error("HTTP 429"); } });
    try {
      feed.demand("^GSPC");
      const seen = [];
      for (let i = 0; i < 7; i++) {
        await feed._runYahooPoll();
        seen.push(armedDelay(() => feed._scheduleYahooPoll()));
      }
      // 15s × 2^min(n,5): 30, 60, 120, 240, 480→capped 300, then flat at the cap.
      assert.deepEqual(seen, [30000, 60000, 120000, 240000, 300000, 300000, 300000]);
      for (const d of seen) assert.ok(d <= YAHOO_MAX_BACKOFF_MS, `${d} exceeds the Yahoo cap`);
    } finally { feed.stop(); }
  });

  it("Yahoo: one clean cycle resets the delay to the base interval", async () => {
    let fail = true;
    const feed = new MacroFeed({
      fetchYahoo: async (syms) => {
        if (fail) throw new Error("HTTP 429");
        return { [syms[0]]: { symbol: syms[0], close: [10], timestamp: [1], chartPreviousClose: 9 } };
      },
    });
    try {
      feed.demand("^GSPC");
      await feed._runYahooPoll();
      assert.equal(armedDelay(() => feed._scheduleYahooPoll()), 30000);
      fail = false;
      await feed._runYahooPoll();
      assert.equal(feed.yahooConsecutiveErrors, 0);
      assert.equal(armedDelay(() => feed._scheduleYahooPoll()), YAHOO_POLL_INTERVAL_MS);
    } finally { feed.stop(); }
  });

  it("a stopped feed arms nothing at all", () => {
    const feed = new MacroFeed();
    feed.stop();
    assert.equal(armedDelay(() => feed._scheduleSinaPoll()), null);
    assert.equal(armedDelay(() => feed._scheduleYahooPoll()), null);
  });
});

// ── health ───────────────────────────────────────────────────────────────────

describe("MacroFeed.health", () => {
  it("reports the documented shape and splits subs by leg", () => {
    const feed = new MacroFeed();
    try {
      feed.demand("CL=F");
      feed.demand("GC=F");
      feed.demand("^GSPC");
      feed._sinaCache.set("CL=F", { sym: "CL=F", last: 1, ts: 1 });
      const h = feed.health();
      assert.equal(h.sinaSubs, 2, "CL=F and GC=F are Sina-mapped");
      assert.equal(h.yahooSubs, 3, "the spark leg covers ALL demanded symbols, not just ^GSPC");
      assert.equal(h.lruCap, 64, "the cap must stay above the 49-symbol macro catalog");
      assert.equal(h.cacheSize, 1);
      assert.equal(h.lastSinaPollAt, null, "null until the first successful poll");
      assert.equal(h.lastYahooPollAt, null);
      assert.equal(h.sinaConsecutiveErrors, 0);
      assert.equal(h.yahooConsecutiveErrors, 0);
    } finally { feed.stop(); }
  });
});

// ── Kill switch ──────────────────────────────────────────────────────────────

describe("MacroFeed disabled (MACRO_FEED_DISABLE=1)", () => {
  before(() => { process.env.MACRO_FEED_DISABLE = "1"; });
  after(() => { delete process.env.MACRO_FEED_DISABLE; });

  it("demand, getQuote, getAll and polling are all no-ops", async () => {
    let calls = 0;
    const feed = new MacroFeed({
      fetchSina: async () => { calls++; return SINA_FIXTURE; },
      fetchYahoo: async () => { calls++; return {}; },
    });
    try {
      assert.equal(feed.disabled, true);
      feed.demand("CL=F");
      assert.equal(feed._subs.size, 0, "demand must not register anything");
      feed.start();
      assert.equal(feed._sinaTimer, null, "start() must not schedule polls");
      assert.equal(feed._yahooTimer, null);
      await feed._runSinaPoll();
      await feed._runYahooPoll();
      assert.equal(calls, 0, "no upstream requests while disabled");
      assert.equal(feed.getQuote("CL=F"), null);
      assert.deepEqual(feed.getAll(["CL=F"]), {});
      assert.deepEqual(feed.health(), { disabled: true });
    } finally { feed.stop(); }
  });
});
