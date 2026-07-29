// suiteModules.test.ts — deterministic tests for the premium suite modules (W0 + W1).
//
// W0 (Structure Core): pivots (exact fractals / ties / body-vs-wick), Market Structure (BOS,
// CHoCH, NON-REPAINT), Order Blocks (zone bounds, mitigation, breaker flip, grade monotonicity),
// FVG (zone bounds, partial-fill watermark, iFVG flip, threshold filter).
// W1: Premium & Discount (range + fib arithmetic), Liquidity (clustering tolerance, grabs, caps),
// SFP (confirm-bar semantics, reclaim speed, invalidation), Trend Engine (flip engine, TP ladder,
// NON-REPAINT), Volt Bands (expansion memory), Candle Painter (coverage + intensity tiers),
// Flow Band (HMA vs a reference WMA-of-WMA, HTF no-lookahead).
// Plus contract hygiene (prim ids, finite numbers, zero hex literals, token-only colors, settings
// schema) and drawn-density caps.
//
// All inputs are crafted or generated from a seeded LCG — no Date.now, no Math.random.
//
// Fixture note: several W1 fixtures are built by `levelBars`, whose bars have a true range of
// EXACTLY 2 on every bar (bar i spans [L, L+2], closes at L+1, and |ΔL| <= 1 keeps
// max(h-l, |h-prevClose|, |l-prevClose|) pinned at 2). ATR is therefore exactly 2 everywhere,
// which makes every ATR-scaled threshold in the modules hand-computable.

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

import { findPivotsHL, type Pivot } from "../suites/structure/pivots";
import { MARKET_STRUCTURE_MODULE } from "../suites/structure/marketStructure";
import { ORDER_BLOCKS_MODULE } from "../suites/structure/orderBlocks";
import { FVG_MODULE } from "../suites/structure/fvg";
import { PREMIUM_DISCOUNT_MODULE } from "../suites/structure/premiumDiscount";
import { LIQUIDITY_MODULE } from "../suites/structure/liquidity";
import { SFP_MODULE } from "../suites/structure/sfp";
import { TREND_ENGINE_MODULE } from "../suites/trend/trendEngine";
import { VOLT_BANDS_MODULE } from "../suites/trend/voltixBands";
import { CANDLE_PAINTER_MODULE } from "../suites/trend/candlePainter";
import { FLOW_BAND_MODULE } from "../suites/trend/flowBand";
import {
  MAX_PRIMS_PER_MODULE,
  type ModuleCtx,
  type ModuleResult,
  type Prim,
  type SuiteBar,
  type SuiteColors,
  type SuiteEvent,
  type SuiteModuleDef,
} from "../indicator-canvas/types";

// ─── Harness ──────────────────────────────────────────────────────────────────

/** Token-shaped color strings: distinct, non-hex, and traceable back to their slot. */
const COLORS: SuiteColors = {
  up: "var(--up)",
  down: "var(--down)",
  flowBuy: "var(--flow-buy)",
  flowSell: "var(--flow-sell)",
  warn: "var(--warn)",
  brand: "var(--brand-2)",
  text: "var(--text)",
  muted: "var(--muted)",
  neutral: "var(--text-dim)",
};

function ctxFor(
  mod: SuiteModuleDef,
  bars: SuiteBar[],
  overrides: Record<string, any> = {},
  lang: "en" | "zh" = "en",
): ModuleCtx {
  return {
    bars,
    tf: "1D",
    symbol: "TEST",
    isIntraday: false,
    s: { ...mod.defaults, ...overrides },
    colors: COLORS,
    lang,
  };
}

const run = (mod: SuiteModuleDef, bars: SuiteBar[], overrides: Record<string, any> = {}, lang: "en" | "zh" = "en"):
  ModuleResult => mod.compute(ctxFor(mod, bars, overrides, lang));

/** Explicit OHLCV rows -> SuiteBar[] with a monotonic synthetic time axis. */
function mkBars(rows: Array<[number, number, number, number, number?]>): SuiteBar[] {
  return rows.map((r, i) => ({ t: 86400 * (i + 1), o: r[0], h: r[1], l: r[2], c: r[3], v: r[4] ?? 1000 }));
}

/** Close-path -> valid OHLC bars (o = previous close, ±0.2 wicks). */
function pathBars(prices: number[], vol = 1000): SuiteBar[] {
  return prices.map((p, i) => {
    const o = i === 0 ? p : prices[i - 1];
    return {
      t: 86400 * (i + 1),
      o,
      h: Math.max(o, p) + 0.2,
      l: Math.min(o, p) - 0.2,
      c: p,
      v: vol,
    };
  });
}

/** Deterministic LCG — reproducible "noise" without Math.random. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Seeded random walk with a deterministic swing carrier — produces real structure.
 * `shockEvery > 0` injects a periodic alternating-direction impulse bar on heavy volume so that
 * Order Blocks actually fire (a smooth walk never clears the ATR + volume-percentile gates).
 */
function walkBars(n: number, seed = 20260728, shockEvery = 0): SuiteBar[] {
  const rnd = lcg(seed);
  const out: SuiteBar[] = [];
  let p = 100;
  for (let i = 0; i < n; i++) {
    const r1 = rnd(), r2 = rnd(), r3 = rnd(), r4 = rnd();
    const shock = shockEvery > 0 && i > 24 && i % shockEvery === 0;
    const drift = Math.sin(i / 5) * 0.8;
    const o = p;
    const c = shock
      ? Math.max(5, p + (i % (2 * shockEvery) === 0 ? 3.4 : -3.4))
      : Math.max(5, p + (r1 - 0.5) * 1.2 + drift);
    const h = Math.max(o, c) + r2 * 0.7;
    const l = Math.max(0.5, Math.min(o, c) - r3 * 0.7);
    out.push({ t: 86400 * (i + 1), o, h, l, c, v: shock ? 9000 : 800 + Math.floor(r4 * 1400) });
    p = c;
  }
  return out;
}

const structural = (evs: SuiteEvent[] | undefined) =>
  (evs ?? []).filter((e) => e.type === "bos" || e.type === "choch");

/**
 * Level path -> bars whose TRUE RANGE is exactly 2 on every bar (see the file header), so every
 * ATR-derived threshold in a module is exact. Requires |L[i] - L[i-1]| <= 1.
 */
function levelBars(Ls: number[], vols?: number[]): SuiteBar[] {
  return Ls.map((L, i) => ({
    t: 86400 * (i + 1),
    o: i === 0 ? L + 1 : Ls[i - 1] + 1,
    h: L + 2,
    l: L,
    c: L + 1,
    v: vols?.[i] ?? 1000,
  }));
}

/** `steps` values walking from `from` (exclusive) to `to` (inclusive). */
function ramp(from: number, to: number, steps: number): number[] {
  const out: number[] = [];
  for (let k = 1; k <= steps; k++) out.push(from + ((to - from) * k) / steps);
  return out;
}

/** [high, low, close] rows -> bars (open = previous close). */
function hlcBars(rows: Array<[number, number, number]>, vols: number[] = []): SuiteBar[] {
  return rows.map((r, i) => ({
    t: 86400 * (i + 1),
    o: i === 0 ? r[2] : rows[i - 1][2],
    h: r[0],
    l: r[1],
    c: r[2],
    v: vols[i] ?? 1000,
  }));
}

const evOf = (res: ModuleResult, type: string) => (res.events ?? []).filter((e) => e.type === type);
const primOf = (res: ModuleResult, id: string) => res.prims.find((p) => p.id === id) as any;

// ─── 1. pivots ────────────────────────────────────────────────────────────────

describe("findPivotsHL", () => {
  // idx:   0     1     2     3     4     5     6     7     8     9    10
  // h:    10    11    15    11    10     9     8    12     9    10     9
  // l:     5     6     7     6     5     2     4     6     5     6     5
  const CRAFTED = mkBars([
    [7, 10, 5, 8], [8, 11, 6, 9], [9, 15, 7, 11], [11, 11, 6, 8], [8, 10, 5, 7],
    [7, 9, 2, 4], [4, 8, 4, 6], [6, 12, 6, 10], [10, 9, 5, 7], [7, 10, 6, 8], [8, 9, 5, 7],
  ]);

  it("finds the exact fractal highs and lows with confirmation bars", () => {
    expect(findPivotsHL(CRAFTED, 2, 2)).toEqual<Pivot[]>([
      { i: 2, p: 15, kind: "high", confirmedAt: 4 },
      { i: 5, p: 2, kind: "low", confirmedAt: 7 },
      { i: 7, p: 12, kind: "high", confirmedAt: 9 },
    ]);
  });

  it("never returns a pivot whose right window runs past the last bar", () => {
    for (const R of [1, 2, 3, 4]) {
      for (const pv of findPivotsHL(CRAFTED, 2, R)) {
        expect(pv.confirmedAt).toBe(pv.i + R);
        expect(pv.confirmedAt).toBeLessThanOrEqual(CRAFTED.length - 1);
      }
    }
  });

  it("returns nothing when the series is shorter than left+right+1", () => {
    expect(findPivotsHL(CRAFTED.slice(0, 4), 2, 2)).toEqual([]);
    expect(findPivotsHL([], 2, 2)).toEqual([]);
  });

  it("resolves plateau ties to the FIRST bar of the run", () => {
    // highs 1, 5, 5, 1, 1 — the two 5s tie; only the earlier one is a pivot.
    const tie = mkBars([
      [1, 1, 0.5, 1], [3, 5, 2.5, 4], [4, 5, 2.6, 4], [4, 1, 0.6, 1], [1, 1, 0.7, 1],
    ]);
    const highs = findPivotsHL(tie, 1, 1).filter((p) => p.kind === "high");
    expect(highs).toEqual<Pivot[]>([{ i: 1, p: 5, kind: "high", confirmedAt: 2 }]);
  });

  it("distinguishes wick source from body source", () => {
    // Bar 2 has a 20-high spike but a body top of 11 (lower than both neighbours).
    const src = mkBars([
      [9.5, 10.5, 9, 10],
      [11, 12.5, 10.5, 12],
      [11, 20, 10, 10.5],
      [12, 13, 11.5, 12.5],
      [10, 10.5, 9.5, 9.8],
    ]);
    const wick = findPivotsHL(src, 1, 1, "wick").filter((p) => p.kind === "high");
    const body = findPivotsHL(src, 1, 1, "body").filter((p) => p.kind === "high");
    expect(wick.map((p) => p.i)).toEqual([2]);
    expect(wick[0].p).toBe(20);
    expect(body.map((p) => p.i)).toEqual([1, 3]);
    expect(body.map((p) => p.p)).toEqual([12, 12.5]);
  });

  it("sanitizes out-of-range wings instead of throwing", () => {
    const bars = walkBars(80);
    expect(() => findPivotsHL(bars, 0, 0)).not.toThrow();
    expect(() => findPivotsHL(bars, -5, 1e9)).not.toThrow();
    expect(findPivotsHL(bars, 0, 0)).toEqual(findPivotsHL(bars, 5, 5)); // wing(0) -> fallback 5
  });
});

// ─── 2. marketStructure ───────────────────────────────────────────────────────

/**
 * Close path with one confirmed swing high (bar 21, wick 101.2) that is closed through at bar 40.
 * Wings of 10 bars on either side of every extreme; no swing low is ever taken out.
 */
function bosPath(): number[] {
  const p: number[] = [];
  for (let i = 0; i <= 10; i++) p.push(100 - i);              // 100 → 90
  for (let i = 11; i <= 21; i++) p.push(90 + (i - 10));       // 91 → 101 (swing high @21)
  for (let i = 22; i <= 32; i++) p.push(101 - (i - 21));      // 100 → 90 (swing low @32)
  for (let i = 33; i <= 44; i++) p.push(90 + 1.5 * (i - 32)); // 91.5 → 108 (breaks 101.2 at bar 40)
  return p;
}

/** bosPath + a reversal leg: swing low @55 (96.8) is closed through at bar 74 while trend = up. */
function chochPath(): number[] {
  const p = bosPath();
  for (let i = 45; i <= 55; i++) p.push(108 - (i - 44));        // 107 → 97 (swing low @55)
  for (let i = 56; i <= 66; i++) p.push(97 + (i - 55));         // 98 → 108
  for (let i = 67; i <= 80; i++) p.push(108 - 1.5 * (i - 66));  // 106.5 → 87
  return p;
}

const MS_S = { swingLen: 10, internalLen: 5, showLast: 40 };

describe("marketStructure — break detection", () => {
  it("prints exactly one bullish BOS at the expected bar and level", () => {
    const bars = pathBars(bosPath());
    const evs = structural(run(MARKET_STRUCTURE_MODULE, bars, MS_S).events);
    expect(evs.length).toBe(1);
    expect(evs[0].type).toBe("bos");
    expect(evs[0].dir).toBe("bull");
    expect(evs[0].i).toBe(40);
    expect(evs[0].p).toBeCloseTo(101.2, 9);
  });

  it("emits the matching BOS line + label prims", () => {
    const bars = pathBars(bosPath());
    const { prims } = run(MARKET_STRUCTURE_MODULE, bars, MS_S);
    const line = prims.find((p) => p.id === "ms-sw-bos-40");
    expect(line).toBeDefined();
    expect(line!.kind).toBe("line");
    const label = prims.find((p) => p.id === "ms-sw-bos-l-40");
    expect(label).toBeDefined();
    expect((label as any).text).toBe("BOS");
  });

  it("calls the counter-trend break a CHoCH", () => {
    const bars = pathBars(chochPath());
    const evs = structural(run(MARKET_STRUCTURE_MODULE, bars, MS_S).events);
    expect(evs.map((e) => [e.type, e.dir, e.i])).toEqual([
      ["bos", "bull", 40],
      ["choch", "bear", 74],
    ]);
    expect(evs[1].p).toBeCloseTo(96.8, 9);
  });

  it("honours the direction filter without changing detection", () => {
    const bars = pathBars(chochPath());
    const bull = run(MARKET_STRUCTURE_MODULE, bars, { ...MS_S, filter: "bull" });
    // events are the full tape; only the drawn set is filtered
    expect(structural(bull.events).length).toBe(2);
    expect(bull.prims.some((p) => p.id === "ms-sw-choch-74")).toBe(false);
    expect(bull.prims.some((p) => p.id === "ms-sw-bos-40")).toBe(true);
  });

  it("is deterministic across repeated computes", () => {
    const bars = pathBars(chochPath());
    expect(run(MARKET_STRUCTURE_MODULE, bars, MS_S)).toEqual(run(MARKET_STRUCTURE_MODULE, bars, MS_S));
  });
});

describe("marketStructure — non-repaint", () => {
  it("keeps every settled event identical when 40 future bars are appended", () => {
    const swingLen = 20;
    const full = walkBars(340, 991);
    const short = full.slice(0, 300);
    const cut = 300 - swingLen; // events at or before this bar can no longer change

    const a = run(MARKET_STRUCTURE_MODULE, short, { swingLen, showLast: 40 }).events ?? [];
    const b = run(MARKET_STRUCTURE_MODULE, full, { swingLen, showLast: 40 }).events ?? [];

    const key = (e: SuiteEvent) => `${e.type}|${e.dir}|${e.i}|${e.p}`;
    const settledA = a.filter((e) => e.i <= cut).map(key);
    const settledB = b.filter((e) => e.i <= cut).map(key);

    expect(structural(a).length).toBeGreaterThanOrEqual(3); // the fixture must actually exercise this
    expect(settledA.length).toBeGreaterThan(0);
    expect(settledB).toEqual(settledA);
  });
});

// ─── 3. orderBlocks ───────────────────────────────────────────────────────────

/**
 * 40 quiet up-candles, one opposing (down) candle at bar 40, then a 2.5-point bullish body
 * (~5× ATR) on 5× volume at bar 41 — one, and only one, bullish order block.
 * `tailFrom` optionally replaces the post-impulse plateau with a slow decline that eventually
 * closes below the block.
 */
function obBars(opts: { decline?: boolean } = {}): SuiteBar[] {
  const rows: Array<[number, number, number, number, number?]> = [];
  // Two volume regimes (heavy 0..19, light 20..39) keep the trailing volume percentile off its
  // ceiling, so the grade actually responds to the formation window's volume.
  for (let i = 0; i < 40; i++) rows.push([100.0, 100.3, 99.8, 100.1, i < 20 ? 2000 : 500]);
  rows.push([100.1, 100.3, 99.7, 99.9, 500]);   // 40 — anchor (last opposing candle)
  rows.push([99.9, 102.5, 99.8, 102.4, 2000]);  // 41 — impulse (~5x ATR body, top-decile volume)
  if (!opts.decline) {
    for (let i = 42; i < 60; i++) rows.push([102.4, 102.7, 102.2, 102.5, 500]);
  } else {
    let prev = 102.4;
    for (let i = 42; i < 75; i++) {
      const c = 102.4 - 0.15 * (i - 41);
      rows.push([prev, Math.max(prev, c) + 0.1, Math.min(prev, c) - 0.1, c, 500]);
      prev = c;
    }
  }
  return mkBars(rows);
}

const obZone = (prims: Prim[]) => prims.filter((p) => p.kind === "zone" && /^ob:\d+:z$/.test(p.id));

describe("orderBlocks", () => {
  it("creates exactly one block whose zone bounds are the anchor candle's range", () => {
    const bars = obBars();
    const { prims, events } = run(ORDER_BLOCKS_MODULE, bars);
    const created = (events ?? []).filter((e) => e.type === "ob_created");
    expect(created.length).toBe(1);
    expect(created[0].dir).toBe("bull");
    expect(created[0].i).toBe(41);

    const zones = obZone(prims) as any[];
    expect(zones.length).toBe(1);
    expect(zones[0].i1).toBe(40);           // anchor candle
    expect(zones[0].p1).toBeCloseTo(99.7, 9);  // anchor low
    expect(zones[0].p2).toBeCloseTo(100.3, 9); // anchor high
    expect(zones[0].i2).toBe("right");
  });

  it("uses body bounds when boundsMode = body", () => {
    const zones = obZone(run(ORDER_BLOCKS_MODULE, obBars(), { boundsMode: "body" }).prims) as any[];
    expect(zones.length).toBe(1);
    expect(zones[0].p1).toBeCloseTo(99.9, 9);  // min(o,c) of the anchor
    expect(zones[0].p2).toBeCloseTo(100.1, 9); // max(o,c) of the anchor
  });

  it("removes the block when price closes through it (breaker off)", () => {
    const bars = obBars({ decline: true });
    const { prims, events } = run(ORDER_BLOCKS_MODULE, bars, { breaker: false });
    const broke = (events ?? []).filter((e) => e.type === "ob_break");
    expect(broke.length).toBe(1);
    expect(broke[0].dir).toBe("bull");
    expect(obZone(prims).length).toBe(0);
    expect(prims.length).toBe(0);
  });

  it("converts the mitigated block into a breaker when enabled", () => {
    const bars = obBars({ decline: true });
    const { prims } = run(ORDER_BLOCKS_MODULE, bars, { breaker: true });
    expect(obZone(prims).length).toBe(0); // no longer a live block
    const brk = prims.find((p) => /^ob:\d+:brk$/.test(p.id)) as any;
    expect(brk).toBeDefined();
    expect(brk.kind).toBe("zone");
    expect(brk.p1).toBeCloseTo(99.7, 9);
    expect(brk.p2).toBeCloseTo(100.3, 9);
    expect(brk.fill).toBe(COLORS.down); // role-flipped from a bullish block

    const lbl = prims.find((p) => /^ob:\d+:brklbl$/.test(p.id)) as any;
    expect(lbl?.text).toBe("Breaker Block");
    const zhLbl = run(ORDER_BLOCKS_MODULE, bars, { breaker: true }, "zh").prims
      .find((p) => /^ob:\d+:brklbl$/.test(p.id)) as any;
    expect(zhLbl?.text).toBe("破位块");
    expect(zhLbl?.text).not.toBe(lbl?.text);
  });

  it("does not lower the grade when the formation volume is doubled", () => {
    const base = obBars();
    const doubled = base.map((b, i) => (i >= 38 && i <= 41 ? { ...b, v: b.v * 2 } : b));

    const g = (bars: SuiteBar[]) => {
      const ev = (run(ORDER_BLOCKS_MODULE, bars).events ?? []).find((e) => e.type === "ob_created");
      expect(ev).toBeDefined();
      return ev!;
    };
    const a = g(base);
    const b = g(doubled);
    expect(a.strength).toBeLessThan(100); // the measurement must not be pinned at its ceiling
    expect(b.strength!).toBeGreaterThanOrEqual(a.strength!);

    const RANK = ["WEAK", "BALANCED", "HIGH", "STRONG"];
    const tierOf = (e: SuiteEvent) => RANK.findIndex((t) => (e.label ?? "").endsWith(t));
    expect(tierOf(a)).toBeGreaterThanOrEqual(0);
    expect(tierOf(b)).toBeGreaterThanOrEqual(tierOf(a));
  });

  it("returns nothing below the minimum bar count", () => {
    expect(run(ORDER_BLOCKS_MODULE, obBars().slice(0, 20)).prims).toEqual([]);
  });
});

// ─── 4. fvg ───────────────────────────────────────────────────────────────────

type FvgTail = "clean" | "half" | "invert" | "tiny";

/**
 * Bars 0..19 quiet, then a 3-candle bullish imbalance closing on bar 21:
 * high[19] = 100.5, low[21] = 103.0 → zone [100.5, 103.0] anchored at bar 20, size 2.5 (≈2.1× ATR).
 */
function fvgBars(tail: FvgTail): SuiteBar[] {
  const rows: Array<[number, number, number, number, number?]> = [];
  for (let i = 0; i < 20; i++) rows.push([100.0, 100.5, 99.5, 100.2, 1000]); // 0..19
  if (tail === "tiny") {
    rows.push([100.4, 100.6, 100.4, 100.55, 1000]);   // 20 — micro imbalance candle
    rows.push([100.55, 100.8, 100.55, 100.7, 1000]);  // 21 — gap of only 0.05
    for (let i = 22; i <= 29; i++) rows.push([100.7, 100.9, 100.6, 100.8, 1000]);
    return mkBars(rows);
  }
  rows.push([100.2, 103.6, 100.1, 103.5, 3000]); // 20 — imbalance candle
  rows.push([103.5, 104.2, 103.0, 104.0, 2000]); // 21 — gap closes here
  for (let i = 22; i <= 29; i++) {
    if (tail === "half" && i === 25) rows.push([103.3, 103.6, 101.75, 103.4, 1000]);       // fills 50%
    else if (tail === "invert" && i === 25) rows.push([100.3, 100.4, 99.5, 100.0, 1000]);  // body below the gap
    else if (tail === "invert" && i > 25) rows.push([100.0, 100.2, 99.6, 99.8, 1000]);     // stays below
    else rows.push([103.6, 104.0, 103.2, 103.8, 1000]);
  }
  return mkBars(rows);
}

const fvgZones = (prims: Prim[]) => prims.filter((p) => p.kind === "zone" && /-z$/.test(p.id)) as any[];

describe("fvg", () => {
  it("anchors the zone at [high[j-2], low[j]] on the imbalance candle", () => {
    const { prims, events } = run(FVG_MODULE, fvgBars("clean"));
    const created = (events ?? []).filter((e) => e.type === "fvg_created");
    expect(created.length).toBe(1);
    expect(created[0].dir).toBe("bull");
    expect(created[0].i).toBe(21);

    const zones = fvgZones(prims);
    expect(zones.length).toBe(1);
    expect(zones[0].i1).toBe(20); // anchored at the middle (imbalance) candle
    expect(zones[0].p1).toBeCloseTo(100.5, 9);
    expect(zones[0].p2).toBeCloseTo(103.0, 9);
    expect(zones[0].fill).toBe(COLORS.up);
  });

  it("tracks the fill watermark: a bar covering half the gap reads 50% filled", () => {
    const { prims, tooltips } = run(FVG_MODULE, fvgBars("half"));
    const tip = (tooltips ?? []).find((t) => /^fvg-b21$/.test(t.id));
    expect(tip).toBeDefined();
    const filledRow = tip!.rows.find((r) => r.k === "Filled");
    expect(filledRow).toBeDefined();
    const frac = parseFloat(filledRow!.v) / 100;
    expect(frac).toBeGreaterThan(0.49);
    expect(frac).toBeLessThan(0.51);

    const chip = prims.find((p) => p.id === "fvg-b21-fc") as any;
    expect(chip?.text).toBe("50% filled");
    const sub = prims.find((p) => p.id === "fvg-b21-f") as any; // partial-fill sub-zone
    expect(sub?.kind).toBe("zone");
    expect(sub.p1).toBeCloseTo(101.75, 9); // watermark
    expect(sub.p2).toBeCloseTo(103.0, 9);  // far edge
  });

  it("flips to an iFVG when a full body closes through the far edge", () => {
    const { prims, events } = run(FVG_MODULE, fvgBars("invert"));
    const inv = (events ?? []).filter((e) => e.type === "ifvg");
    expect(inv.length).toBe(1);
    expect(inv[0].dir).toBe("bear"); // a bullish gap inverts bearish
    expect(inv[0].i).toBe(25);

    const lab = prims.find((p) => p.id === "fvg-b21-inv") as any;
    expect(lab?.text).toBe("iFVG");
    const zone = fvgZones(prims).find((z) => z.id === "fvg-b21-z");
    expect(zone.fill).toBe(COLORS.down); // role-flipped
    expect(zone.dash).toBe("4 3");
  });

  it("deletes rather than flips the zone when iFvg is off", () => {
    const { prims, events } = run(FVG_MODULE, fvgBars("invert"), { iFvg: false });
    expect((events ?? []).some((e) => e.type === "ifvg")).toBe(false);
    expect(fvgZones(prims).some((z) => z.id === "fvg-b21-z")).toBe(false);
  });

  it("filters a sub-threshold gap and keeps it once the threshold is removed", () => {
    const bars = fvgBars("tiny");
    const gated = run(FVG_MODULE, bars, { thresholdATR: 0.25 });
    expect((gated.events ?? []).filter((e) => e.type === "fvg_created").length).toBe(0);
    expect(fvgZones(gated.prims).length).toBe(0);

    const open = run(FVG_MODULE, bars, { thresholdATR: 0 });
    const created = (open.events ?? []).filter((e) => e.type === "fvg_created");
    expect(created.length).toBeGreaterThan(0);
    expect(created[0].i).toBe(21);
  });

  it("is deterministic across repeated computes", () => {
    const bars = fvgBars("half");
    expect(run(FVG_MODULE, bars)).toEqual(run(FVG_MODULE, bars));
  });
});

// ─── 5. premiumDiscount ───────────────────────────────────────────────────────

/**
 * One clean dealing range, hand-built for exact fib arithmetic.
 *   pivot low  @4  = 100 (wings of 3, confirmed on bar 7)
 *   pivot high @12 = 200 (wings of 3, confirmed on bar 15)
 * -> range [100, 200], span 100, uptrend (the high is the newer pivot), startBar 12,
 *    activeFrom 15. Premium >= 170, discount <= 130, EQ 150,
 *    0.618 -> 138.2, 0.650 -> 135, 0.786 -> 121.4 (measured DOWN from the high).
 * The tail descends monotonically (no further pivots) through premium, the pocket and discount.
 */
const PD_ROWS: Array<[number, number, number]> = [
  [160, 150, 155], [155, 145, 150], [150, 140, 145], [145, 130, 140], [140, 100, 120],
  [145, 120, 130], [150, 130, 140], [155, 140, 150], [160, 150, 155], [170, 155, 165],
  [180, 160, 170], [190, 170, 180], [200, 180, 190], [195, 175, 185], [190, 170, 180],
  [185, 165, 175], [180, 160, 170], [175, 155, 165], [170, 150, 160], [165, 145, 155],
  [160, 140, 150], [155, 135, 145], [150, 130, 140], [145, 125, 135], [140, 120, 130],
  [135, 115, 125], [130, 110, 120], [125, 105, 115],
];
/** Same geometry mirrored about 150: pivot HIGH @4, pivot LOW @12 -> the same range, downtrend. */
const PD_ROWS_DOWN: Array<[number, number, number]> = PD_ROWS.map(([h, l, c]) => [300 - l, 300 - h, 300 - c]);

const PD_S = { rangeLen: 3 };

describe("premiumDiscount — range geometry", () => {
  it("stripes the upper and lower 30% of the last confirmed swing pair", () => {
    const res = run(PREMIUM_DISCOUNT_MODULE, hlcBars(PD_ROWS), PD_S);
    const prem = primOf(res, "pd-12-prem");
    const disc = primOf(res, "pd-12-disc");
    expect(prem.kind).toBe("zone");
    expect(prem.i1).toBe(12);       // the newer pivot's bar is the range's left edge
    expect(prem.i2).toBe("right");
    expect(prem.p1).toBeCloseTo(170, 9); // hi - 0.30 * span
    expect(prem.p2).toBeCloseTo(200, 9);
    expect(prem.fill).toBe(COLORS.down);
    expect(disc.p1).toBeCloseTo(100, 9);
    expect(disc.p2).toBeCloseTo(130, 9); // lo + 0.30 * span
    expect(disc.fill).toBe(COLORS.up);
  });

  it("prices 0.618 / 0.650 / 0.786 DOWN from the high in an uptrend", () => {
    const res = run(PREMIUM_DISCOUNT_MODULE, hlcBars(PD_ROWS), PD_S);
    const gp = primOf(res, "pd-12-gp");
    expect(gp.p1).toBeCloseTo(135, 9);    // 200 - 0.650 * 100
    expect(gp.p2).toBeCloseTo(138.2, 9);  // 200 - 0.618 * 100
    expect(gp.fill).toBe(COLORS.warn);
    expect(primOf(res, "pd-12-f786").a.p).toBeCloseTo(121.4, 9); // 200 - 0.786 * 100
    expect(primOf(res, "pd-12-eq").a.p).toBeCloseTo(150, 9);
    expect(primOf(res, "pd-12-l618").text).toBe("0.618 138.20");
    expect(primOf(res, "pd-12-l786").text).toBe("0.786 121.40");
    expect(primOf(res, "pd-12-leq").text).toBe("EQ 150.00");
  });

  it("measures the retracement UP from the low in a downtrend", () => {
    const res = run(PREMIUM_DISCOUNT_MODULE, hlcBars(PD_ROWS_DOWN), PD_S);
    const gp = primOf(res, "pd-12-gp");
    expect(gp.p1).toBeCloseTo(161.8, 9);  // 100 + 0.618 * 100
    expect(gp.p2).toBeCloseTo(165, 9);    // 100 + 0.650 * 100
    expect(primOf(res, "pd-12-f786").a.p).toBeCloseTo(178.6, 9);
    // the stripes are orientation-independent — only the fib anchor flips
    expect(primOf(res, "pd-12-prem").p1).toBeCloseTo(170, 9);
    expect(primOf(res, "pd-12-disc").p2).toBeCloseTo(130, 9);
    const tip = (res.tooltips ?? [])[0];
    expect(tip.rows.find((r) => r.k === "Trend")!.v).toBe("Down");
    expect(tip.rows.find((r) => r.k === "Range")!.v).toBe("100.00 – 200.00");
  });
});

describe("premiumDiscount — events", () => {
  it("fires premium / golden-pocket / discount exactly once each, never before activeFrom", () => {
    const evs = run(PREMIUM_DISCOUNT_MODULE, hlcBars(PD_ROWS), PD_S).events ?? [];
    expect(evs.map((e) => [e.type, e.i, e.strength])).toEqual([
      // bars 13 (close 185) and 14 (close 180) are ALSO inside premium, but the range only
      // becomes knowable on bar 15 = confirmedAt of the pivot that completed it.
      ["pd_enter_premium", 15, 75],   // (175 - 100) / 100
      ["pd_golden_touch", 21, 73],    // close 145 sits 6.8 above the pocket: 100 - 6.8/100*400
      ["pd_enter_discount", 24, 70],  // close 130 -> 30% of range -> 100 - 30
    ]);
    expect(evs[0].dir).toBe("bear");
    expect(evs[2].dir).toBe("bull");
  });

  it("mirrors the event tape on the mirrored range", () => {
    const evs = run(PREMIUM_DISCOUNT_MODULE, hlcBars(PD_ROWS_DOWN), PD_S).events ?? [];
    expect(evs.map((e) => [e.type, e.i, e.strength])).toEqual([
      ["pd_enter_discount", 15, 75],
      ["pd_golden_touch", 21, 73],
      ["pd_enter_premium", 24, 70],
    ]);
  });

  it("drops fib + equilibrium geometry (and the tooltip) when those toggles are off", () => {
    const res = run(PREMIUM_DISCOUNT_MODULE, hlcBars(PD_ROWS), {
      ...PD_S, showFib: false, equilibrium: false,
    });
    expect(res.prims.map((p) => p.id)).toEqual(["pd-12-prem", "pd-12-disc", "pd-12-cprem", "pd-12-cdisc"]);
    expect(res.tooltips).toEqual([]);
  });

  it("returns nothing before a range can be confirmed", () => {
    const res = run(PREMIUM_DISCOUNT_MODULE, hlcBars(PD_ROWS).slice(0, 7), PD_S);
    expect(res.prims).toEqual([]);
    expect(res.events).toEqual([]);
  });

  it("is deterministic across repeated computes", () => {
    const bars = hlcBars(PD_ROWS);
    expect(run(PREMIUM_DISCOUNT_MODULE, bars, PD_S)).toEqual(run(PREMIUM_DISCOUNT_MODULE, bars, PD_S));
  });
});

// ─── 6. liquidity ─────────────────────────────────────────────────────────────

/**
 * TR == 2 everywhere (ATR == 2), so tolerance 0.25 -> 0.5 and grabSens 0.5 -> 1.0 exactly.
 *   pivot high @10 = 107.0 (confirmed 20) and @31 = 107.4 (confirmed 41)  -> 0.4 apart -> cluster
 *   pivot low  @20 =  95.0 (confirmed 30) and @41 =  95.4 (confirmed 51)  -> 0.4 apart -> cluster
 *   bar 52 wicks to 108.0 (= level + 1.0 = grabSens x ATR) and closes at 107 -> buyside grab
 */
const LIQ_LEVELS = [
  95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105,
  104, 103, 102, 101, 100, 99, 98, 97, 96, 95,
  95.4, 96.4, 97.4, 98.4, 99.4, 100.4, 101.4, 102.4, 103.4, 104.4, 105.4,
  104.4, 103.4, 102.4, 101.4, 100.4, 99.4, 98.4, 97.4, 96.4, 95.4,
  96.4, 97.4, 98.4, 99.4, 100.4, 101.4, 102.4, 103.4, 104.4, 105.4,
  106,
  105, 104, 103, 102, 101, 100, 99, 98,
];
const liqBars = () => levelBars(LIQ_LEVELS);

/** Eight descending double-tops: eight equal-high pools that later price never closes back above. */
function liqStaircase(): SuiteBar[] {
  const peaks = [200, 180, 160, 140, 120, 100, 80, 60];
  const Ls: number[] = [peaks[0] - 12];
  for (let k = 0; k < peaks.length; k++) {
    const p = peaks[k];
    const t = p - 12;
    const tNext = k + 1 < peaks.length ? peaks[k + 1] - 12 : t;
    Ls.push(...ramp(t, p, 11), ...ramp(p, t, 11), ...ramp(t, p, 11), ...ramp(p, tNext, 11));
  }
  return levelBars(Ls);
}

const liqLines = (res: ModuleResult) => res.prims.filter((p) => /^liq-[hl]\d+-l$/.test(p.id)) as any[];

describe("liquidity — clustering", () => {
  it("freezes the pool at the FIRST pivot of the cluster and counts the touches", () => {
    const res = run(LIQUIDITY_MODULE, liqBars());
    const line = primOf(res, "liq-h10-l");
    expect(line.a.i).toBe(10);            // anchored at the first pivot, not the newest
    expect(line.a.p).toBeCloseTo(107, 9); // level FROZEN at 107 — never the 107.2 mean
    expect(primOf(res, "liq-h10-c").text).toBe("EQH ×2");

    const created = evOf(res, "liq_created");
    expect(created.map((e) => [e.dir, e.i, e.p, e.strength])).toEqual([
      ["bear", 41, 107, 50],  // published on the CONFIRM bar of the second pivot (31 + 10)
      ["bull", 51, 95, 50],
    ]);
    expect(primOf(res, "liq-l20-l").a.p).toBeCloseTo(95, 9);
    expect(primOf(res, "liq-l20-c").text).toBe("EQL ×2");
  });

  it("refuses to cluster pivots further apart than tolerance x ATR", () => {
    // 0.4 apart, ATR 2: tolerance 0.25 -> 0.50 clusters; 0.15 -> 0.30 does not.
    const wide = run(LIQUIDITY_MODULE, liqBars(), { tolerance: 0.15 });
    expect(evOf(wide, "liq_created")).toEqual([]);
    expect(liqLines(wide)).toEqual([]);
    expect(evOf(run(LIQUIDITY_MODULE, liqBars(), { tolerance: 0.25 }), "liq_created").length).toBe(2);
  });
});

describe("liquidity — grabs", () => {
  it("sweeps the pool when a wick clears it by grabSens x ATR and closes back inside", () => {
    const res = run(LIQUIDITY_MODULE, liqBars());
    const grabs = evOf(res, "liq_grab");
    expect(grabs.length).toBe(1);
    expect(grabs[0].i).toBe(52);
    expect(grabs[0].dir).toBe("bear"); // buyside liquidity taken
    expect(grabs[0].p).toBeCloseTo(107, 9);
    expect(grabs[0].strength).toBe(17); // (108 - 107) / 2 = 0.50x ATR -> round(0.5 * 33)
    expect(grabs[0].label).toContain("0.50× ATR");

    const line = primOf(res, "liq-h10-l");
    expect(line.b.i).toBe(52);          // a swept line stops at the sweeping wick
    expect(line.dash).toBe("4 3");
    expect(line.alpha).toBeCloseTo(0.3, 9);
    const mark = primOf(res, "liq-h10-g");
    expect(mark.shape).toBe("tri-down");
    expect(mark.i).toBe(52);
    expect(mark.p).toBeCloseTo(108.7, 9); // wick tip + 0.35 x ATR
    expect(mark.fill).toBe(COLORS.down);
  });

  it("leaves the pool resting and edge-anchored when grabs are off", () => {
    const res = run(LIQUIDITY_MODULE, liqBars(), { grabs: false });
    expect(evOf(res, "liq_grab")).toEqual([]);
    const line = primOf(res, "liq-h10-l");
    expect(line.b.i).toBe("right");
    expect(line.dash).toBeUndefined();
  });

  it("circles each confirmed pivot when bubbles are on", () => {
    const res = run(LIQUIDITY_MODULE, liqBars(), { bubbles: true });
    const bubbles = res.prims.filter((p) => p.id.startsWith("liqb-")) as any[];
    expect(bubbles.map((b) => [b.id, b.i, b.shape])).toEqual([
      ["liqb-h10", 10, "circle"], ["liqb-l20", 20, "circle"],
      ["liqb-h31", 31, "circle"], ["liqb-l41", 41, "circle"],
    ]);
    expect(bubbles.every((b) => b.size === 8)).toBe(true); // flat volume -> top percentile
    expect(run(LIQUIDITY_MODULE, liqBars()).prims.some((p) => p.id.startsWith("liqb-"))).toBe(false);
  });
});

describe("liquidity — caps", () => {
  const STAIRS = liqStaircase();

  it("tracks at most maxLines pools at once and draws at most showLast", () => {
    // 15 pools are detected over the fixture; 9 are still alive at the last bar.
    expect(evOf(run(LIQUIDITY_MODULE, STAIRS, { maxLines: 20, showLast: 24 }), "liq_created").length).toBe(15);
    for (const maxLines of [4, 6, 10, 20]) {
      const n = liqLines(run(LIQUIDITY_MODULE, STAIRS, { maxLines, showLast: 24 })).length;
      expect(n, `maxLines=${maxLines}`).toBeLessThanOrEqual(maxLines);
      expect(n, `maxLines=${maxLines} drew nothing`).toBeGreaterThan(0);
    }
    expect(liqLines(run(LIQUIDITY_MODULE, STAIRS, { maxLines: 4, showLast: 24 })).length).toBe(4);
    for (const showLast of [4, 8, 24]) {
      const res = run(LIQUIDITY_MODULE, STAIRS, { maxLines: 20, showLast });
      expect(liqLines(res).length).toBeLessThanOrEqual(showLast);
      expect(res.prims.length).toBeLessThanOrEqual(showLast * 3);
    }
  });

  it("is deterministic across repeated computes", () => {
    expect(run(LIQUIDITY_MODULE, STAIRS)).toEqual(run(LIQUIDITY_MODULE, STAIRS));
  });
});

// ─── 7. sfp ───────────────────────────────────────────────────────────────────

/**
 * Pivot low @6 = 90 with wings of 5 -> confirmed on bar 11. Bar 13 sweeps it.
 * Volumes are flat 1000 with 1500 on the sweep bar, so the volume percentile is exactly 100
 * (13 usable trailing bars, all below) and Volume Strength = 0.7 x 100 + 0.3 x speed.
 */
const SFP_BASE: Array<[number, number, number]> = [
  [110, 105, 108], [108, 103, 105], [106, 100, 102], [104, 98, 100], [102, 96, 98],
  [100, 94, 96], [98, 90, 95], [100, 93, 97], [102, 95, 99], [104, 97, 101],
  [106, 99, 103], [108, 101, 105], [107, 100, 103],
];
const SFP_QUIET: Array<[number, number, number]> = Array.from({ length: 8 }, () => [104, 96, 100] as [number, number, number]);
const SFP_VOLS = (() => { const v = new Array(40).fill(1000); v[13] = 1500; return v; })();
const sfpBars = (tail: Array<[number, number, number]>) => hlcBars([...SFP_BASE, ...tail], SFP_VOLS);

const SFP_S = { swingLen: 5 };

describe("sfp — reclaim semantics", () => {
  it("records a same-bar reclaim on the sweep bar with full speed credit", () => {
    const res = run(SFP_MODULE, sfpBars([[104, 89, 95], ...SFP_QUIET]), SFP_S);
    const evs = evOf(res, "sfp");
    expect(evs.length).toBe(1);
    expect(evs[0].dir).toBe("bull");
    expect(evs[0].i).toBe(13);            // the reclaim bar, not the pivot bar
    expect(evs[0].p).toBeCloseTo(90, 9);
    expect(evs[0].strength).toBe(100);    // 0.7 * 100 percentile + 0.3 * 100 same-bar speed

    const line = primOf(res, "sfp-b13-l");
    expect([line.a.i, line.b.i]).toEqual([6, 13]); // origin swing -> sweep bar
    expect(line.a.p).toBeCloseTo(90, 9);
    const zone = primOf(res, "sfp-b13-z");
    expect(zone.p1).toBeCloseTo(89, 9);   // sweep extreme
    expect(zone.p2).toBeCloseTo(90, 9);   // swept level
    expect(zone.i1).toBe(13);
    expect(zone.i2).toBe(25);             // 12 bars wide — never "right"
    const mark = primOf(res, "sfp-b13-m");
    expect(mark.shape).toBe("tri-up");
    expect(mark.p).toBeLessThan(89);      // stands off BELOW the wick tip
    expect(primOf(res, "sfp-b13-t").text).toBe("+SFP");
    const tip = (res.tooltips ?? [])[0];
    expect(tip.rows.find((r) => r.k === "Reclaim")!.v).toBe("Same bar");
  });

  it("scores a next-bar reclaim lower and dates it on the reclaim bar", () => {
    const res = run(SFP_MODULE, sfpBars([[104, 89, 89.5], [100, 92, 95], ...SFP_QUIET]), SFP_S);
    const evs = evOf(res, "sfp");
    expect(evs.length).toBe(1);
    expect(evs[0].i).toBe(14);            // reclaim bar
    expect(evs[0].strength).toBe(88);     // 0.7 * 100 + 0.3 * 60 next-bar speed
    expect((res.tooltips ?? [])[0].rows.find((r) => r.k === "Reclaim")!.v).toBe("Next bar");
    // the pattern is unknown until the reclaim CLOSES: truncating at the sweep bar prints nothing
    const upTo13 = run(SFP_MODULE, sfpBars([[104, 89, 89.5]]), SFP_S);
    expect(evOf(upTo13, "sfp")).toEqual([]);
    expect(upTo13.prims).toEqual([]);
  });

  it("never fires before the swept swing's confirmation bar", () => {
    const bars = sfpBars([[104, 89, 95], ...SFP_QUIET]);
    const pivot = findPivotsHL(bars, 5, 5, "wick").find((p) => p.kind === "low" && p.i === 6)!;
    expect(pivot.confirmedAt).toBe(11);
    for (const e of evOf(run(SFP_MODULE, bars, SFP_S), "sfp")) {
      expect(e.i).toBeGreaterThan(pivot.confirmedAt);
    }
  });

  it("spends the level when the close never reclaims it", () => {
    const res = run(SFP_MODULE, sfpBars([[104, 89, 89.5], [100, 88, 88], [100, 94, 95], ...SFP_QUIET]), SFP_S);
    expect(res.events).toEqual([]); // the break is real: no retro-fire when price comes back
    expect(res.prims).toEqual([]);
  });
});

describe("sfp — invalidation, threshold, filters", () => {
  const INVAL = sfpBars([
    [104, 89, 95], [104, 96, 100], [104, 96, 100], [104, 96, 100], [104, 96, 100],
    [100, 84, 85], [104, 96, 100], [104, 96, 100],
  ]);

  it("invalidates on a close through the sweep extreme and drops the mark by default", () => {
    const res = run(SFP_MODULE, INVAL, SFP_S);
    expect((res.events ?? []).map((e) => [e.type, e.dir, e.i])).toEqual([
      ["sfp", "bull", 13],
      ["sfp_invalidated", "bear", 18], // close 85 < sweep extreme 89
    ]);
    expect(res.prims).toEqual([]);
    expect(res.tooltips).toEqual([]);

    const kept = run(SFP_MODULE, INVAL, { ...SFP_S, showInvalid: true });
    expect(kept.prims.map((p) => p.id)).toEqual(["sfp-b13-l", "sfp-b13-b", "sfp-b13-m", "sfp-b13-t"]);
    expect(primOf(kept, "sfp-b13-l").color).toBe(COLORS.muted);
    expect(primOf(kept, "sfp-b13-l").dash).toBe("4 3");
    expect(primOf(kept, "sfp-b13-t").text).toBe("SFP"); // loses the "+" tier
    expect(kept.prims.some((p) => p.id === "sfp-b13-z")).toBe(false); // no deviation zone
  });

  it("hides sweeps below the Volume Strength threshold without un-spending the level", () => {
    const same = sfpBars([[104, 89, 95], ...SFP_QUIET]);
    const next = sfpBars([[104, 89, 89.5], [100, 92, 95], ...SFP_QUIET]);
    expect(evOf(run(SFP_MODULE, same, { ...SFP_S, threshold: 95 }), "sfp").length).toBe(1); // 100
    expect(evOf(run(SFP_MODULE, next, { ...SFP_S, threshold: 95 }), "sfp").length).toBe(0); // 88
    expect(run(SFP_MODULE, next, { ...SFP_S, threshold: 95 }).prims).toEqual([]);
  });

  it("partitions — never invents — detections under the trend filter", () => {
    const bars = walkBars(400, 4242, 31);
    const key = (e: SuiteEvent) => `${e.i}|${e.p}`;
    const all = new Set(evOf(run(SFP_MODULE, bars), "sfp").map(key));
    const withT = evOf(run(SFP_MODULE, bars, { filter: "withTrend" }), "sfp").map(key);
    const counter = evOf(run(SFP_MODULE, bars, { filter: "counterTrend" }), "sfp").map(key);
    expect(all.size).toBeGreaterThan(0);
    expect(withT.every((k) => all.has(k))).toBe(true);
    expect(counter.every((k) => all.has(k))).toBe(true);
    expect(withT.filter((k) => counter.includes(k))).toEqual([]);
  });

  it("keeps settled events identical when 50 future bars are appended", () => {
    const full = walkBars(400, 4242, 31);
    const short = full.slice(0, 350);
    const key = (e: SuiteEvent) => `${e.type}|${e.dir}|${e.i}|${e.p}|${e.strength}`;
    const a = (run(SFP_MODULE, short).events ?? []).filter((e) => e.i <= 330).map(key);
    const b = (run(SFP_MODULE, full).events ?? []).filter((e) => e.i <= 330).map(key);
    expect(a.length).toBeGreaterThan(0);
    expect(b).toEqual(a);
  });
});

// ─── 8. trendEngine ───────────────────────────────────────────────────────────

/**
 * TR == 2 (ATR == 2) with sensitivity 1 -> mult 1.48, so the trailing stop is hl2 -/+ 2.96 and
 * every flip is hand-computable:
 *   up leg 100..110 (bars 0..10), down leg 109..100 (11..20), up leg 101..110 (21..30).
 *   bar 13 (close 108) is the first close under the ratcheted stop 108.04 -> SELL flip.
 *   bar 23 (close 104) is the first close over the ratcheted stop 103.96 -> BUY flip.
 */
const TE_LEVELS = [
  100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110,
  109, 108, 107, 106, 105, 104, 103, 102, 101, 100,
  101, 102, 103, 104, 105, 106, 107, 108, 109, 110,
];
const TE_S = { sensitivity: 1 };

describe("trendEngine — flip engine", () => {
  it("flips only when a close breaks the ratcheted ATR stop", () => {
    const res = run(TREND_ENGINE_MODULE, levelBars(TE_LEVELS), TE_S);
    const flips = evOf(res, "te_flip");
    expect(flips.map((e) => [e.dir, e.i, e.p])).toEqual([
      ["bear", 13, 108],
      ["bull", 23, 104],
    ]);
    // one marker + one pill per flip, both anchored on the flip bar
    expect(primOf(res, "te-f13-m").shape).toBe("tri-down");
    expect(primOf(res, "te-f23-m").shape).toBe("tri-up");
    expect(primOf(res, "te-f13-p").text.startsWith("SELL")).toBe(true);
    expect(primOf(res, "te-f23-p").text.startsWith("BUY")).toBe(true);
    expect(primOf(res, "te-f13-p").bg).toBe(COLORS.down);
    expect(primOf(res, "te-f23-p").bg).toBe(COLORS.up);
  });

  it("walks the dynamic TP ladder at k x ATR from the entry", () => {
    const res = run(TREND_ENGINE_MODULE, levelBars(TE_LEVELS), { ...TE_S, tpMode: "dynamic", tpCount: 3 });
    // short from 108 with ATR 2: TP1 105, TP2 103, TP3 101 — first touched at bars 15/17/19.
    expect(evOf(res, "te_tp_hit").map((e) => [e.i, e.p, e.label])).toEqual([
      [15, 105, "TP1"], [17, 103, "TP2"], [19, 101, "TP3"],
      // long from 104: TP1 107, TP2 109, TP3 111 — first touched at bars 25/27/29.
      [25, 107, "TP1"], [27, 109, "TP2"], [29, 111, "TP3"],
    ]);
    expect(primOf(res, "te-tpc13-0").text).toBe("TP1 ✓");
    expect(primOf(res, "te-tp13-0").b.i).toBe(15); // the line stops at the touch
  });

  it("never loosens the stop inside a regime", () => {
    const res = run(TREND_ENGINE_MODULE, walkBars(600, 77, 29), { sensitivity: 4 });
    const bands = res.prims.filter((p) => p.id.startsWith("te-band")) as any[];
    expect(bands.length).toBeGreaterThan(2);
    for (const band of bands) {
      const rising = band.colors[0] === COLORS.up;
      for (let k = 1; k < band.pts.length; k++) {
        if (rising) expect(band.pts[k].p).toBeGreaterThanOrEqual(band.pts[k - 1].p - 1e-9);
        else expect(band.pts[k].p).toBeLessThanOrEqual(band.pts[k - 1].p + 1e-9);
      }
    }
  });
});

describe("trendEngine — non-repaint", () => {
  const key = (e: SuiteEvent) => `${e.type}|${e.dir}|${e.i}|${e.p}|${e.strength}`;

  it("keeps every settled event identical when 40 future bars are appended (autoOpt off)", () => {
    const full = walkBars(340, 991);
    const short = full.slice(0, 300);
    const cut = 300 - 30;
    for (const opt of [{}, { showLast: 6 }, { showLast: 6, tpMode: "fixed", slMode: "fixed" }]) {
      const a = (run(TREND_ENGINE_MODULE, short, opt).events ?? []).filter((e) => e.i <= cut).map(key);
      const b = (run(TREND_ENGINE_MODULE, full, opt).events ?? []).filter((e) => e.i <= cut).map(key);
      expect(a.length, `${JSON.stringify(opt)}: nothing settled`).toBeGreaterThan(10);
      expect(a.some((k) => k.startsWith("te_flip"))).toBe(true);
      expect(b, `${JSON.stringify(opt)}`).toEqual(a);
    }
  });

  it("keeps TP hits on episodes that have scrolled out of the drawn window", () => {
    // the drawn ladder is capped by showLast; the event TAPE is not (the W2 alert bridge reads it)
    const bars = walkBars(340, 991);
    const one = run(TREND_ENGINE_MODULE, bars, { showLast: 1 });
    const six = run(TREND_ENGINE_MODULE, bars, { showLast: 6 });
    expect(one.events).toEqual(six.events);
    expect(one.prims.length).toBeLessThan(six.prims.length);
  });

  it("is deterministic across repeated computes", () => {
    const bars = walkBars(400, 4242, 31);
    expect(run(TREND_ENGINE_MODULE, bars)).toEqual(run(TREND_ENGINE_MODULE, bars));
  });
});

// ─── 9. voltixBands ───────────────────────────────────────────────────────────

/** 40 quiet bars, one 120-wide shock bar, then 40 quiet bars again. */
function vbShockBars(): SuiteBar[] {
  const out: SuiteBar[] = [];
  for (let i = 0; i < 40; i++) out.push({ t: 86400 * (i + 1), o: 100, h: 101, l: 99, c: 100, v: 1000 });
  out.push({ t: 86400 * 41, o: 100, h: 160, l: 40, c: 100, v: 5000 });
  for (let i = 0; i < 40; i++) out.push({ t: 86400 * (42 + i), o: 100, h: 101, l: 99, c: 100, v: 1000 });
  return out;
}

/** half-widths of the rendered envelope, indexed by bar. */
function vbHalves(res: ModuleResult): Array<{ i: number; h: number }> {
  const up = res.prims.find((p) => p.id === "vb-upper") as any;
  const lo = res.prims.find((p) => p.id === "vb-lower") as any;
  return up.pts.map((q: any, k: number) => ({ i: q.i, h: (q.p - lo.pts[k].p) / 2 }));
}

describe("voltixBands — expansion memory", () => {
  it("inflates at once on a volatility burst and then deflates at exactly 3% per bar", () => {
    const res = run(VOLT_BANDS_MODULE, vbShockBars(), { length: 10, mult: 2 });
    const halves = vbHalves(res);
    const shock = halves.findIndex((x) => x.i === 40);
    expect(shock).toBeGreaterThan(0);
    expect(halves[shock].h / halves[shock - 1].h).toBeGreaterThan(3); // instant expansion
    for (let k = shock + 1; k < shock + 20; k++) {
      // raw ATR collapses far faster than the floor, so the memory floor binds exactly
      expect(halves[k].h / halves[k - 1].h, `bar ${halves[k].i}`).toBeCloseTo(0.97, 10);
    }
  });

  it("never deflates faster than 3% per bar on a noisy series", () => {
    for (const mult of [1, 2.2, 4]) {
      const halves = vbHalves(run(VOLT_BANDS_MODULE, walkBars(600, 77, 29), { mult }));
      expect(halves.length).toBeGreaterThan(100);
      for (let k = 1; k < halves.length; k++) {
        expect(halves[k].h / halves[k - 1].h, `mult=${mult} bar ${halves[k].i}`).toBeGreaterThanOrEqual(0.97 - 1e-9);
      }
    }
  });

  it("keeps the rails symmetric about the midline", () => {
    const res = run(VOLT_BANDS_MODULE, walkBars(400, 4242, 31));
    const up = res.prims.find((p) => p.id === "vb-upper") as any;
    const lo = res.prims.find((p) => p.id === "vb-lower") as any;
    const mid = new Map<number, number>();
    for (const p of res.prims.filter((x) => x.id === "vb-mid" || x.id.startsWith("vb-mid-")) as any[]) {
      for (const q of p.pts) mid.set(q.i, q.p);
    }
    expect(mid.size).toBeGreaterThan(100);
    let checked = 0;
    up.pts.forEach((q: any, k: number) => {
      const m = mid.get(q.i);
      if (m === undefined) return;
      expect((q.p + lo.pts[k].p) / 2).toBeCloseTo(m, 9);
      checked++;
    });
    expect(checked).toBeGreaterThan(100);
  });
});

describe("voltixBands — excursions", () => {
  it("pairs every re-entry with a preceding break of the opposite implication", () => {
    const res = run(VOLT_BANDS_MODULE, walkBars(600, 77, 29));
    const evs = (res.events ?? []).filter((e) => e.type === "vb_break" || e.type === "vb_retest");
    expect(evs.filter((e) => e.type === "vb_retest").length).toBeGreaterThan(3);
    let open: SuiteEvent | null = null;
    for (const e of evs) {
      if (e.type === "vb_break") {
        expect(open, "two breaks without a re-entry between them").toBeNull();
        open = e;
      } else {
        expect(open, "re-entry without a break").not.toBeNull();
        expect(e.dir).not.toBe(open!.dir); // a fade of the excursion
        expect(e.i).toBeGreaterThan(open!.i);
        open = null;
      }
    }
  });

  it("draws one warn triangle per kept re-entry, pointing back at the band", () => {
    const bars = walkBars(600, 77, 29);
    for (const showLast of [2, 5, 20]) {
      const res = run(VOLT_BANDS_MODULE, bars, { showLast });
      const marks = res.prims.filter((p) => p.kind === "marker") as any[];
      const retests = evOf(res, "vb_retest");
      expect(marks.length).toBe(Math.min(showLast, retests.length));
      for (const m of marks) {
        expect(m.fill).toBe(COLORS.warn);
        const ev = retests.find((e) => e.i === m.i)!;
        expect(ev, `no retest event for marker at ${m.i}`).toBeDefined();
        expect(m.shape).toBe(ev.dir === "bull" ? "tri-up" : "tri-down");
      }
    }
  });

  it("is deterministic across repeated computes", () => {
    const bars = walkBars(400, 4242, 31);
    expect(run(VOLT_BANDS_MODULE, bars)).toEqual(run(VOLT_BANDS_MODULE, bars));
  });
});

// ─── 10. candlePainter ────────────────────────────────────────────────────────

describe("candlePainter", () => {
  const RISE = pathBars(Array.from({ length: 80 }, (_, i) => 100 + i));
  const FALL = pathBars(Array.from({ length: 80 }, (_, i) => 200 - i));

  it("paints every bar exactly once and draws nothing else", () => {
    for (const mode of ["trend", "momentum", "trendVolume", "momentumVolume"]) {
      const res = run(CANDLE_PAINTER_MODULE, RISE, { mode });
      expect(res.prims).toEqual([]);
      expect(res.tooltips).toBeUndefined();
      expect(res.events).toBeUndefined();
      expect(res.candlePaint!.length).toBe(RISE.length);
      res.candlePaint!.forEach((e, i) => expect(e.i).toBe(i));
    }
  });

  it("separates the trend and momentum modes", () => {
    const bars = walkBars(300, 5, 31);
    const hue = (mode: string) => run(CANDLE_PAINTER_MODULE, bars, { mode }).candlePaint!.map((e) => e.color).join(",");
    expect(hue("momentum")).not.toBe(hue("trend"));
    // momentum carries the "weakening" shade; trend has only up / down / muted
    const momentum = run(CANDLE_PAINTER_MODULE, bars, { mode: "momentum" }).candlePaint!;
    expect(momentum.some((e) => e.color === COLORS.warn)).toBe(true);
    const trend = run(CANDLE_PAINTER_MODULE, bars, { mode: "trend" }).candlePaint!;
    expect(trend.every((e) => [COLORS.up, COLORS.down, COLORS.muted].includes(e.color!))).toBe(true);
  });

  it("colours a clean trend and stays neutral through the warm-up", () => {
    for (const mode of ["trend", "momentum"]) {
      const up = run(CANDLE_PAINTER_MODULE, RISE, { mode }).candlePaint!;
      const down = run(CANDLE_PAINTER_MODULE, FALL, { mode }).candlePaint!;
      expect(up[79].color).toBe(COLORS.up);
      expect(down[79].color).toBe(COLORS.down);
      expect(up[0].color).toBe(COLORS.muted); // no average yet
      expect(up[0].borderColor).toBe(COLORS.muted);
      expect(up[0].wickColor).toBe(COLORS.muted);
    }
  });

  it("encodes volume intensity by how much of the candle the hue takes over", () => {
    // 40 alternating 500/1500 bars, then one median / one heavy / one light bar
    const rows: SuiteBar[] = [];
    for (let i = 0; i < 40; i++) {
      rows.push({ t: 86400 * (i + 1), o: 100, h: 101, l: 99, c: 100, v: i % 2 === 0 ? 500 : 1500 });
    }
    rows.push({ t: 1, o: 100, h: 101, l: 99, c: 100, v: 1000 }); // 40 — 50th pct  -> normal
    rows.push({ t: 2, o: 100, h: 101, l: 99, c: 100, v: 2000 }); // 41 — 100th pct -> high
    rows.push({ t: 3, o: 100, h: 101, l: 99, c: 100, v: 100 });  // 42 — 0th pct   -> low
    const paint = run(CANDLE_PAINTER_MODULE, rows, { mode: "momentumVolume" }).candlePaint!;

    expect(Object.keys(paint[40]).sort()).toEqual(["borderColor", "color", "i"]);      // body + border
    expect(Object.keys(paint[41]).sort()).toEqual(["borderColor", "color", "i", "wickColor"]);
    expect(Object.keys(paint[42]).sort()).toEqual(["borderColor", "i", "wickColor"]);  // outline only
    // the non-volume modes always paint all three
    const flat = run(CANDLE_PAINTER_MODULE, rows, { mode: "momentum" }).candlePaint!;
    for (const e of flat) expect(Object.keys(e).sort()).toEqual(["borderColor", "color", "i", "wickColor"]);
  });

  it("is deterministic and survives dirty bars", () => {
    const bars = dirtyBars();
    expect(run(CANDLE_PAINTER_MODULE, bars)).toEqual(run(CANDLE_PAINTER_MODULE, bars));
    const paint = run(CANDLE_PAINTER_MODULE, bars).candlePaint!;
    expect(paint.length).toBe(bars.length);
    expect(paint[120].color).toBe(COLORS.muted); // OHLC = 0 is MISSING, never a print
  });
});

// ─── 11. flowBand ─────────────────────────────────────────────────────────────

/** Naive O(n·len) weighted MA — the independent reference the module's rolling update is checked against. */
function wmaRef(src: number[], len: number): Array<number | null> {
  const out: Array<number | null> = new Array(src.length).fill(null);
  const denom = (len * (len + 1)) / 2;
  for (let i = len - 1; i < src.length; i++) {
    let s = 0;
    for (let k = 0; k < len; k++) s += src[i - len + 1 + k] * (k + 1);
    out[i] = s / denom;
  }
  return out;
}

/** HMA = WMA(2·WMA(n/2) − WMA(n), round(√n)), computed from the naive reference above. */
function hmaRef(src: number[], len: number): Array<number | null> {
  const half = Math.round(len / 2);
  const sq = Math.round(Math.sqrt(len));
  const w1 = wmaRef(src, half);
  const w2 = wmaRef(src, len);
  const raw: number[] = [];
  for (let i = len - 1; i < src.length; i++) raw.push(2 * (w1[i] as number) - (w2[i] as number));
  const w3 = wmaRef(raw, sq);
  const out: Array<number | null> = new Array(src.length).fill(null);
  for (let i = len - 1; i < src.length; i++) out[i] = w3[i - (len - 1)];
  return out;
}

const fbPts = (res: ModuleResult, id: string) => (res.prims.find((p) => p.id === id) as any)?.pts as Array<{ i: number; p: number }>;

describe("flowBand — midline", () => {
  it("matches an independent WMA-of-WMA Hull reference", () => {
    const bars = walkBars(400, 991);
    for (const length of [20, 50, 100]) {
      const mid = fbPts(run(FLOW_BAND_MODULE, bars, { length }), "fb:mid");
      const ref = hmaRef(bars.map((b) => b.c), length);
      expect(mid.length).toBeGreaterThan(100);
      for (const q of mid) {
        expect(ref[q.i], `length=${length} bar ${q.i} has no reference value`).not.toBeNull();
        expect(q.p, `length=${length} bar ${q.i}`).toBeCloseTo(ref[q.i] as number, 8);
      }
    }
  });

  it("centres the envelope on the midline and puts the bright edge on the far side of price", () => {
    const res = run(FLOW_BAND_MODULE, walkBars(400, 991));
    const mid = fbPts(res, "fb:mid");
    const edge = fbPts(res, "fb:edge");
    const cloud = res.prims.find((p) => p.id === "fb:cloud") as any;
    expect(cloud.upper.length).toBe(mid.length);
    for (let k = 0; k < mid.length; k++) {
      expect((cloud.upper[k].p + cloud.lower[k].p) / 2).toBeCloseTo(mid[k].p, 9);
      expect(cloud.upper[k].p).toBeGreaterThan(cloud.lower[k].p);
      // the edge rides the lower rail in an uptrend, the upper rail in a downtrend
      expect([cloud.upper[k].p, cloud.lower[k].p]).toContain(edge[k].p);
    }
  });
});

describe("flowBand — HTF resampling", () => {
  const FULL = walkBars(840, 991);

  it("never lets a group's value appear before that group's last source bar", () => {
    for (const [htf, f] of [["chart", 1], ["2x", 2], ["4x", 4]] as Array<[string, number]>) {
      const mid = fbPts(run(FLOW_BAND_MODULE, FULL, { htf }), "fb:mid");
      const byI = new Map(mid.map((q) => [q.i, q.p]));
      expect(mid.length).toBeGreaterThan(50);
      for (const q of mid) {
        const g = Math.floor((q.i + 1) / f) - 1;   // group whose value bar q.i carries
        expect((g + 1) * f - 1, `htf=${htf} bar ${q.i} peeks`).toBeLessThanOrEqual(q.i);
        const next = byI.get(q.i + 1);             // same group -> the value must repeat, not move
        if (next !== undefined && Math.floor((q.i + 2) / f) - 1 === g) expect(next).toBe(q.p);
      }
    }
  });

  it("is prefix-stable: appending 40 bars never moves an earlier value", () => {
    for (const htf of ["chart", "2x", "4x"]) {
      const a = fbPts(run(FLOW_BAND_MODULE, FULL.slice(0, 800), { htf }), "fb:mid");
      const b = new Map(fbPts(run(FLOW_BAND_MODULE, FULL, { htf }), "fb:mid").map((q) => [q.i, q.p]));
      let shared = 0;
      for (const q of a) {
        if (!b.has(q.i)) continue;
        expect(b.get(q.i), `htf=${htf} bar ${q.i}`).toBe(q.p);
        shared++;
      }
      expect(shared, `htf=${htf}`).toBeGreaterThan(50);
    }
  });
});

describe("flowBand — signals", () => {
  const BARS = walkBars(600, 77, 29);

  it("scores retests 0-100 and prints the score on the chip", () => {
    const res = run(FLOW_BAND_MODULE, BARS);
    const retests = evOf(res, "fb_retest");
    expect(retests.length).toBeGreaterThan(2);
    for (const e of retests) {
      expect(e.strength).toBeGreaterThanOrEqual(0);
      expect(e.strength).toBeLessThanOrEqual(100);
      const chip = primOf(res, `fb:r${e.i}:q`);
      if (chip) expect(chip.text).toBe(String(e.strength));
    }
  });

  it("caps retests per trend segment (forward, so a confirmed mark is never pruned)", () => {
    const res = run(FLOW_BAND_MODULE, BARS);
    const turns = evOf(res, "fb_turn").map((e) => e.i);
    const counts = new Map<number, number>();
    for (const e of evOf(res, "fb_retest")) {
      let seg = -1;
      for (const t of turns) if (t <= e.i) seg = t;
      counts.set(seg, (counts.get(seg) ?? 0) + 1);
    }
    for (const [seg, n] of counts) expect(n, `segment @${seg}`).toBeLessThanOrEqual(6);
  });

  it("windows the drawn markers by showLast without changing the tape", () => {
    const few = run(FLOW_BAND_MODULE, BARS, { showLast: 2 });
    const many = run(FLOW_BAND_MODULE, BARS, { showLast: 16 });
    expect(few.events).toEqual(many.events);
    expect(few.prims.length).toBeLessThan(many.prims.length);
    expect(run(FLOW_BAND_MODULE, BARS, { turnSignals: false, retestSignals: false }).prims
      .every((p) => p.id.startsWith("fb:"))).toBe(true);
  });

  it("is deterministic across repeated computes", () => {
    expect(run(FLOW_BAND_MODULE, BARS)).toEqual(run(FLOW_BAND_MODULE, BARS));
  });
});

// ─── 12. Contract hygiene ─────────────────────────────────────────────────────

const MODULES: SuiteModuleDef[] = [MARKET_STRUCTURE_MODULE, ORDER_BLOCKS_MODULE, FVG_MODULE];

/** Every W1 module. `cp` paints candles instead of drawing prims — see its own describe. */
const W1_MODULES: SuiteModuleDef[] = [
  PREMIUM_DISCOUNT_MODULE, LIQUIDITY_MODULE, SFP_MODULE,
  TREND_ENGINE_MODULE, VOLT_BANDS_MODULE, CANDLE_PAINTER_MODULE, FLOW_BAND_MODULE,
];
const ALL_MODULES: SuiteModuleDef[] = [...MODULES, ...W1_MODULES];

const SRC_FILES = [
  "structure/pivots.ts", "structure/marketStructure.ts", "structure/orderBlocks.ts", "structure/fvg.ts",
  "structure/premiumDiscount.ts", "structure/liquidity.ts", "structure/sfp.ts",
  "trend/trendEngine.ts", "trend/voltixBands.ts", "trend/candlePainter.ts", "trend/flowBand.ts",
];

function scanNumbers(v: any, path: string, out: string[]): void {
  if (typeof v === "number") {
    if (!Number.isFinite(v)) out.push(path);
    return;
  }
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) scanNumbers(v[i], `${path}[${i}]`, out);
    return;
  }
  if (v && typeof v === "object") for (const k of Object.keys(v)) scanNumbers(v[k], `${path}.${k}`, out);
}

/** Exercise every optional surface of every module on one noisy fixture. */
function allResults(): Array<{ mod: string; res: ModuleResult }> {
  const bars = walkBars(600, 77, 29);
  const out: Array<{ mod: string; res: ModuleResult }> = [];
  for (const lang of ["en", "zh"] as const) {
    out.push({
      mod: `ms/${lang}`,
      res: run(MARKET_STRUCTURE_MODULE, bars, {
        swingLen: 15, internalLen: 4, mapping: true, strongWeak: true, structCandles: true, showLast: 20,
      }, lang),
    });
    for (const method of ["volume", "priceAction", "peak"]) {
      out.push({ mod: `ob/${method}/${lang}`, res: run(ORDER_BLOCKS_MODULE, bars, { method, extendRight: false, sizeDetail: "large" }, lang) });
    }
    for (const extend of ["right", "limited"]) {
      out.push({ mod: `fvg/${extend}/${lang}`, res: run(FVG_MODULE, bars, { extend, signals: "both", showPoc: "mean", hideOverlap: false }, lang) });
    }
    // W1 — every optional surface on (cp draws no prims and is checked in its own describe)
    out.push({ mod: `pd/${lang}`, res: run(PREMIUM_DISCOUNT_MODULE, bars, { rangeLen: 4, showLast: 3 }, lang) });
    out.push({ mod: `liq/${lang}`, res: run(LIQUIDITY_MODULE, bars, { bubbles: true, showLast: 24, maxLines: 20 }, lang) });
    out.push({ mod: `sfp/${lang}`, res: run(SFP_MODULE, bars, { showInvalid: true, swingLen: 8, textSize: "large" }, lang) });
    out.push({ mod: `te/${lang}`, res: run(TREND_ENGINE_MODULE, bars, { shadow: true, slMode: "fixed", tpMode: "fixed", showLast: 4 }, lang) });
    out.push({ mod: `vb/${lang}`, res: run(VOLT_BANDS_MODULE, bars, { showLast: 20 }, lang) });
    for (const htf of ["chart", "2x"]) {
      out.push({ mod: `fb/${htf}/${lang}`, res: run(FLOW_BAND_MODULE, bars, { htf, showLast: 16 }, lang) });
    }
  }
  return out;
}

/** Colors may only ever be the token strings the host resolved — no hex, rgb() or CSS names. */
const COLOR_KEYS = ["color", "fill", "stroke", "bg", "accent", "borderColor", "wickColor", "overlayColor"];
function scanColors(v: any, path: string, out: string[]): void {
  if (Array.isArray(v)) {
    v.forEach((x, i) => scanColors(x, `${path}[${i}]`, out));
    return;
  }
  if (v && typeof v === "object") {
    for (const k of Object.keys(v)) scanColors(v[k], `${path}.${k}`, out);
    return;
  }
  if (typeof v !== "string") return;
  const leaf = (path.split(".").pop() ?? "").replace(/\[\d+\]$/, "");
  if (!COLOR_KEYS.includes(leaf) && leaf !== "colors" && leaf !== "segColors") return;
  if (!TOKEN_VALUES.has(v)) out.push(`${path}=${v}`);
}
const TOKEN_VALUES = new Set(Object.values(COLORS));

describe("contract hygiene", () => {
  it("every prim carries a non-empty id and only finite numbers", () => {
    for (const { mod, res } of allResults()) {
      expect(res.prims.length, `${mod}: drew nothing — fixture no longer exercises the module`).toBeGreaterThan(0);
      for (const p of res.prims) {
        expect(typeof p.id, `${mod}: prim id type`).toBe("string");
        expect(p.id.length, `${mod}: empty prim id`).toBeGreaterThan(0);
        const bad: string[] = [];
        scanNumbers(p, `${mod}:${p.id}`, bad);
        expect(bad, `${mod}: non-finite numbers`).toEqual([]);
      }
      for (const c of res.candlePaint ?? []) expect(Number.isFinite(c.i)).toBe(true);
      for (const e of res.events ?? []) {
        const bad: string[] = [];
        scanNumbers(e, `${mod}:event`, bad);
        expect(bad, `${mod}: non-finite event numbers`).toEqual([]);
      }
    }
  });

  it("prim ids are unique within one compute pass", () => {
    for (const { mod, res } of allResults()) {
      const seen = new Set<string>();
      const dupes: string[] = [];
      for (const p of res.prims) {
        if (seen.has(p.id)) dupes.push(p.id);
        seen.add(p.id);
      }
      expect(dupes, `${mod}: duplicate prim ids`).toEqual([]);
    }
  });

  it("every tooltipId resolves to a declared tooltip", () => {
    for (const { mod, res } of allResults()) {
      const ids = new Set((res.tooltips ?? []).map((t) => t.id));
      for (const p of res.prims) {
        const tid = (p as any).tooltipId;
        if (tid) expect(ids.has(tid), `${mod}: dangling tooltipId ${tid}`).toBe(true);
      }
    }
  });

  it("respects the alpha discipline (zone fills <= 0.18, bgshade <= 0.10)", () => {
    for (const { mod, res } of allResults()) {
      for (const p of res.prims) {
        if (p.kind === "zone" && p.fillAlpha !== undefined) {
          expect(p.fillAlpha, `${mod}: ${p.id}`).toBeLessThanOrEqual(0.18);
        }
        if (p.kind === "bgshade") expect(p.alpha, `${mod}: ${p.id}`).toBeLessThanOrEqual(0.1);
      }
    }
  });

  it("module sources contain zero hex color literals", () => {
    for (const f of SRC_FILES) {
      const src = readFileSync(join(__dirname, "..", "suites", f), "utf8");
      const code = src
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1");
      const hits = code.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
      expect(hits, `${f} hex literals`).toEqual([]);
      expect(code.match(/\brgba?\s*\(/g) ?? [], `${f} rgb()/rgba() literals`).toEqual([]);
    }
  });

  it("module sources contain no clock or randomness", () => {
    for (const f of SRC_FILES) {
      const src = readFileSync(join(__dirname, "..", "suites", f), "utf8");
      const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
      expect(code.includes("Date.now"), `${f}: Date.now`).toBe(false);
      expect(code.includes("Math.random"), `${f}: Math.random`).toBe(false);
      expect(code.includes("new Date"), `${f}: new Date`).toBe(false);
    }
  });

  it("module sources name no CSS colour outside ctx.colors", () => {
    // catches named colours ("red", "white", …) that the hex/rgb scan would miss
    const NAMED = /\b(?:red|green|blue|white|black|gray|grey|orange|yellow|purple|cyan|magenta|lime|teal|navy|silver|gold|pink|brown|maroon|olive|aqua|fuchsia|transparent|currentColor)\b\s*['"]/i;
    for (const f of SRC_FILES) {
      const code = readFileSync(join(__dirname, "..", "suites", f), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1");
      const strings = code.match(/(['"`])(?:\\.|(?!\1)[^\\])*\1/g) ?? [];
      const hits = strings.filter((s) => NAMED.test(`${s.slice(1, -1)}"`) || /^["'`]#/.test(s));
      expect(hits, `${f}: literal colour strings`).toEqual([]);
    }
  });

  it("emits only host-resolved colour tokens", () => {
    for (const { mod, res } of allResults()) {
      const bad: string[] = [];
      scanColors(res.prims, `${mod}:prims`, bad);
      scanColors(res.tooltips ?? [], `${mod}:tooltips`, bad);
      scanColors(res.candlePaint ?? [], `${mod}:paint`, bad);
      expect(bad, `${mod}: non-token colours`).toEqual([]);
    }
    const paint = run(CANDLE_PAINTER_MODULE, walkBars(600, 77, 29), { mode: "trendVolume" }).candlePaint ?? [];
    const bad: string[] = [];
    scanColors(paint, "cp:paint", bad);
    expect(bad).toEqual([]);
  });

  it("declares unique tooltip ids", () => {
    for (const { mod, res } of allResults()) {
      const ids = (res.tooltips ?? []).map((t) => t.id);
      expect(new Set(ids).size, `${mod}: duplicate tooltip ids`).toBe(ids.length);
    }
  });

  it("ships a complete, self-consistent settings schema", () => {
    for (const m of ALL_MODULES) {
      const fieldKeys = m.fields.map((f) => f.key).sort();
      expect(Object.keys(m.defaults).sort(), `${m.key}: fields vs defaults`).toEqual(fieldKeys);
      expect(new Set(fieldKeys).size, `${m.key}: duplicate field keys`).toBe(fieldKeys.length);
      for (const f of m.fields) {
        expect(f.key, `${m.key}.${f.key}: prefixed key`).not.toContain(".");
        expect(f.label.length, `${m.key}.${f.key}: empty label`).toBeGreaterThan(0);
        if (f.type === "number") {
          expect(typeof f.min, `${m.key}.${f.key}: min`).toBe("number");
          expect(typeof f.max, `${m.key}.${f.key}: max`).toBe("number");
          expect(m.defaults[f.key], `${m.key}.${f.key}: default below min`).toBeGreaterThanOrEqual(f.min!);
          expect(m.defaults[f.key], `${m.key}.${f.key}: default above max`).toBeLessThanOrEqual(f.max!);
        }
        if (f.type === "select") {
          expect(f.options?.some((o) => o.v === m.defaults[f.key]), `${m.key}.${f.key}: default not an option`).toBe(true);
        }
        if (f.showIf) expect(fieldKeys, `${m.key}.${f.key}: showIf target`).toContain(f.showIf.key);
      }
    }
  });

  it("carries the registered identity for every W1 module", () => {
    const idOf = (m: SuiteModuleDef) => [m.key, m.label, m.tag, m.tier, m.defaultOn];
    expect(W1_MODULES.map(idOf)).toEqual([
      ["pd", "Premium & Discount", "PD", "insider", false],
      ["liq", "Liquidity", "LIQ", "pro", false],
      ["sfp", "Swing Failure", "SFP", "pro", false],
      ["te", "Trend Engine", "TE", "insider", true],
      ["vb", "Volt Bands", "VB", "insider", false],
      ["cp", "Candle Painter", "CP", "free", true],
      ["fb", "Flow Band", "FB", "insider", false],
    ]);
    expect(new Set(ALL_MODULES.map((m) => m.key)).size).toBe(ALL_MODULES.length);
    expect(new Set(ALL_MODULES.map((m) => m.tag)).size).toBe(ALL_MODULES.length);
  });
});

// ─── 5b. Robustness & i18n ────────────────────────────────────────────────────

/** Splice CN/HK-style dirty bars (OHLC = 0 = MISSING) and NaNs into a clean series. */
function dirtyBars(): SuiteBar[] {
  const bars = walkBars(400, 4242, 31).map((b) => ({ ...b }));
  bars[120] = { ...bars[120], o: 0, h: 0, l: 0, c: 0, v: 0 };
  bars[121] = { ...bars[121], h: NaN, l: NaN };
  bars[200] = { ...bars[200], v: NaN };
  bars[201] = { ...bars[201], o: bars[201].c, h: bars[201].c, l: bars[201].c }; // zero range
  return bars;
}

describe("robustness", () => {
  it("survives zero / NaN / zero-range bars without emitting non-finite geometry", () => {
    const bars = dirtyBars();
    for (const mod of ALL_MODULES) {
      let res!: ModuleResult;
      expect(() => { res = run(mod, bars); }, `${mod.key} threw`).not.toThrow();
      for (const p of res.prims) {
        const bad: string[] = [];
        scanNumbers(p, `${mod.key}:${p.id}`, bad);
        expect(bad, `${mod.key}: non-finite prim geometry`).toEqual([]);
      }
      for (const t of res.tooltips ?? []) {
        for (const r of t.rows) expect(r.v.includes("NaN"), `${mod.key}: NaN leaked into ${t.id}/${r.k}`).toBe(false);
      }
    }
  });

  it("returns an empty result for degenerate inputs instead of throwing", () => {
    for (const mod of ALL_MODULES) {
      for (const bars of [[], walkBars(2), walkBars(11)]) {
        const res = run(mod, bars);
        expect(Array.isArray(res.prims), `${mod.key}`).toBe(true);
      }
    }
  });

  it("never plots a zero or negative price on a series with missing prints", () => {
    const bars = dirtyBars();
    for (const mod of ALL_MODULES) {
      for (const p of run(mod, bars).prims as any[]) {
        for (const arr of [p.pts, p.upper, p.lower]) {
          if (!Array.isArray(arr)) continue;
          for (const q of arr) expect(q.p, `${mod.key}:${p.id}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it("paints exactly one candle entry per bar when structure candles are on", () => {
    const bars = walkBars(200, 5, 31);
    const res = run(MARKET_STRUCTURE_MODULE, bars, { structCandles: true, swingLen: 15 });
    expect(res.candlePaint?.length).toBe(bars.length);
    res.candlePaint!.forEach((e, i) => {
      expect(e.i).toBe(i);
      expect([COLORS.up, COLORS.down, COLORS.neutral]).toContain(e.color);
    });
    expect(run(MARKET_STRUCTURE_MODULE, bars, { structCandles: false }).candlePaint).toBeUndefined();
  });
});

describe("i18n", () => {
  const bars = walkBars(400, 4242, 31);

  it("localizes tooltip copy without leaking the other language", () => {
    for (const mod of MODULES) {
      const en = run(mod, bars, mod === MARKET_STRUCTURE_MODULE ? { swingLen: 15 } : {}, "en");
      const zh = run(mod, bars, mod === MARKET_STRUCTURE_MODULE ? { swingLen: 15 } : {}, "zh");
      expect(en.tooltips?.length, `${mod.key}: no tooltips to compare`).toBeGreaterThan(0);
      expect(zh.tooltips?.length).toBe(en.tooltips?.length);
      const enText = JSON.stringify(en.tooltips);
      const zhText = JSON.stringify(zh.tooltips);
      expect(zhText, `${mod.key}: zh output identical to en`).not.toBe(enText);
      expect(/[\u4e00-\u9fff]/.test(enText), `${mod.key}: CJK leaked into the en tooltip`).toBe(false);
      expect(/[\u4e00-\u9fff]/.test(zhText), `${mod.key}: zh tooltip has no CJK`).toBe(true);
    }
  });

  it("localizes every W1 module's tooltips and event copy", () => {
    const cases: Array<[SuiteModuleDef, SuiteBar[], Record<string, any>]> = [
      [PREMIUM_DISCOUNT_MODULE, hlcBars(PD_ROWS), PD_S],
      [LIQUIDITY_MODULE, liqBars(), { bubbles: true }],
      [SFP_MODULE, sfpBars([[104, 89, 95], ...SFP_QUIET]), SFP_S],
      [TREND_ENGINE_MODULE, bars, {}],
      [VOLT_BANDS_MODULE, bars, {}],
      [FLOW_BAND_MODULE, bars, {}],
    ];
    for (const [mod, fixture, opts] of cases) {
      const en = run(mod, fixture, opts, "en");
      const zh = run(mod, fixture, opts, "zh");
      expect(en.tooltips?.length, `${mod.key}: no tooltips to compare`).toBeGreaterThan(0);
      expect(zh.tooltips?.length).toBe(en.tooltips?.length);
      for (const [a, b] of [[en.tooltips, zh.tooltips], [en.events, zh.events]] as const) {
        const at = JSON.stringify(a);
        const bt = JSON.stringify(b);
        expect(bt, `${mod.key}: zh output identical to en`).not.toBe(at);
        expect(/[一-鿿]/.test(at), `${mod.key}: CJK leaked into the en output`).toBe(false);
        expect(/[一-鿿]/.test(bt), `${mod.key}: zh output has no CJK`).toBe(true);
      }
      // geometry is language-independent
      const strip = (r: ModuleResult) => r.prims.filter((p) => p.kind !== "label").length;
      expect(strip(zh)).toBe(strip(en));
    }
  });

  it("keeps the W1 chart tags language-neutral", () => {
    const teBars = levelBars(TE_LEVELS);
    const tags = (lang: "en" | "zh") =>
      run(TREND_ENGINE_MODULE, teBars, TE_S, lang).prims
        .filter((p) => p.kind === "label").map((p: any) => p.text);
    expect(tags("en").length).toBeGreaterThan(0);
    expect(tags("zh")).toEqual(tags("en")); // BUY / SELL / TP1 ✓ are not translated
    const sfpEn = run(SFP_MODULE, sfpBars([[104, 89, 95], ...SFP_QUIET]), SFP_S, "en");
    const sfpZh = run(SFP_MODULE, sfpBars([[104, 89, 95], ...SFP_QUIET]), SFP_S, "zh");
    expect(primOf(sfpZh, "sfp-b13-t").text).toBe(primOf(sfpEn, "sfp-b13-t").text);
  });

  it("keeps language-neutral chart microcopy identical across languages", () => {
    const en = run(MARKET_STRUCTURE_MODULE, bars, { swingLen: 15 }, "en");
    const zh = run(MARKET_STRUCTURE_MODULE, bars, { swingLen: 15 }, "zh");
    const tags = (r: ModuleResult) =>
      r.prims.filter((p) => p.kind === "label" && /^ms-(sw|in)-(bos|choch)-l-/.test(p.id)).map((p: any) => p.text);
    expect(tags(en).length).toBeGreaterThan(0);
    expect(tags(zh)).toEqual(tags(en)); // "BOS"/"CHoCH" are not translated
  });
});

// ─── 13. Caps / density ───────────────────────────────────────────────────────

describe("drawn-density caps", () => {
  const PATHOLOGICAL = walkBars(5000, 991, 37);

  it("keeps each module under MAX_PRIMS_PER_MODULE on a 5000-bar series", () => {
    for (const mod of MODULES) {
      const res = run(mod, PATHOLOGICAL, mod === MARKET_STRUCTURE_MODULE
        ? { swingLen: 12, internalLen: 3, mapping: true, strongWeak: true, showLast: 40 }
        : {});
      expect(res.prims.length, `${mod.key} drew nothing`).toBeGreaterThan(0);
      expect(res.prims.length, `${mod.key} prim count`).toBeLessThanOrEqual(MAX_PRIMS_PER_MODULE);
    }
  });

  it("keeps every W1 module under MAX_PRIMS_PER_MODULE with every surface on", () => {
    const heavy: Record<string, Record<string, any>> = {
      pd: { showLast: 3, rangeLen: 3 },
      liq: { bubbles: true, showLast: 24, maxLines: 20 },
      sfp: { showLast: 16, showInvalid: true, swingLen: 8 },
      te: { showLast: 6, shadow: true, slMode: "fixed", tpMode: "dynamic", tpCount: 6, sensitivity: 2 },
      vb: { showLast: 20 },
      fb: { showLast: 16, htf: "2x" },
    };
    for (const mod of W1_MODULES) {
      const res = run(mod, PATHOLOGICAL, heavy[mod.key] ?? {});
      if (mod === CANDLE_PAINTER_MODULE) {
        // the candles ARE the drawing: no prims, one paint entry per bar
        expect(res.prims).toEqual([]);
        expect(res.candlePaint?.length).toBe(PATHOLOGICAL.length);
        continue;
      }
      expect(res.prims.length, `${mod.key} drew nothing`).toBeGreaterThan(0);
      expect(res.prims.length, `${mod.key} prim count`).toBeLessThanOrEqual(MAX_PRIMS_PER_MODULE);
    }
  });

  it("bounds W1 prims by a small multiple of showLast", () => {
    // per drawn item: pd range <= 10, liq line <= 3, sfp pattern <= 5, vb triangle 1 (+262 fixed
    // rails/midline/glow), fb turn 2 + <=6 retests x 2, te ladder <= 13 (+240 fixed chrome).
    const bounds: Array<[SuiteModuleDef, number[], number, number, Record<string, any>]> = [
      [PREMIUM_DISCOUNT_MODULE, [1, 2, 3], 10, 0, { rangeLen: 3 }],
      [LIQUIDITY_MODULE, [4, 8, 24], 3, 0, { maxLines: 20 }],
      [SFP_MODULE, [2, 8, 16], 5, 0, { showInvalid: true, swingLen: 8 }],
      [TREND_ENGINE_MODULE, [1, 2, 6], 14, 240, { shadow: true, slMode: "fixed" }],
      [VOLT_BANDS_MODULE, [2, 10, 20], 1, 262, {}],
      [FLOW_BAND_MODULE, [2, 8, 16], 14, 3, {}],
    ];
    for (const [mod, showLasts, per, fixed, opts] of bounds) {
      for (const showLast of showLasts) {
        const res = run(mod, PATHOLOGICAL, { ...opts, showLast });
        expect(res.prims.length, `${mod.key} showLast=${showLast} drew nothing`).toBeGreaterThan(0);
        expect(res.prims.length, `${mod.key} showLast=${showLast}`).toBeLessThanOrEqual(showLast * per + fixed);
      }
    }
  });

  it("stays deterministic on the pathological fixture (W1)", () => {
    for (const mod of W1_MODULES) {
      expect(run(mod, PATHOLOGICAL), `${mod.key}`).toEqual(run(mod, PATHOLOGICAL));
    }
  });

  it("bounds order-block prims by a small multiple of showLast", () => {
    for (const showLast of [1, 3, 6, 12]) {
      const res = run(ORDER_BLOCKS_MODULE, PATHOLOGICAL, { showLast });
      // per drawn block: zone + tick + 4 internals + 2 chips + 2 rating + tier = 11
      // plus up to `showLast` breakers at 2 prims each.
      expect(res.prims.length, `ob showLast=${showLast} drew nothing`).toBeGreaterThan(0);
      expect(res.prims.length, `ob showLast=${showLast}`).toBeLessThanOrEqual(showLast * 16);
    }
  });

  it("bounds fvg prims by a small multiple of showLast", () => {
    for (const showLast of [2, 5, 8, 20]) {
      const res = run(FVG_MODULE, PATHOLOGICAL, { showLast, signals: "both" });
      // per zone: box + fill box + chip + poc + iFVG label + creation glyph + <=3 retests = 9
      expect(res.prims.length, `fvg showLast=${showLast} drew nothing`).toBeGreaterThan(0);
      expect(res.prims.length, `fvg showLast=${showLast}`).toBeLessThanOrEqual(showLast * 12);
    }
  });

  it("bounds market-structure prims by showLast plus the fixed pivot-mark ceiling", () => {
    for (const showLast of [4, 12, 40]) {
      const res = run(MARKET_STRUCTURE_MODULE, PATHOLOGICAL, {
        swingLen: 12, internalLen: 3, mapping: true, showLast,
      });
      // 2 prims per drawn swing break + 2 per drawn internal break (<= showLast each),
      // + <= 24 pivot marks x 4 families + a fixed <= 20 for projections / DT-DB.
      expect(res.prims.length, `ms showLast=${showLast} drew nothing`).toBeGreaterThan(0);
      expect(res.prims.length, `ms showLast=${showLast}`).toBeLessThanOrEqual(showLast * 4 + 24 * 4 + 20);
    }
  });

  it("stays deterministic on the pathological fixture", () => {
    for (const mod of MODULES) {
      expect(run(mod, PATHOLOGICAL)).toEqual(run(mod, PATHOLOGICAL));
    }
  });
});
