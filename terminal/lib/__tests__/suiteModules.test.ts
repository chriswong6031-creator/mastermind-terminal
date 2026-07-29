// suiteModules.test.ts — deterministic tests for the premium Structure Core suite modules.
//
// Covers: pivots (exact fractals / ties / body-vs-wick), Market Structure (BOS, CHoCH,
// NON-REPAINT), Order Blocks (zone bounds, mitigation, breaker flip, grade monotonicity),
// FVG (zone bounds, partial-fill watermark, iFVG flip, threshold filter), plus contract
// hygiene (prim ids, finite numbers, zero hex literals) and drawn-density caps.
//
// All inputs are crafted or generated from a seeded LCG — no Date.now, no Math.random.

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

import { findPivotsHL, type Pivot } from "../suites/structure/pivots";
import { MARKET_STRUCTURE_MODULE } from "../suites/structure/marketStructure";
import { ORDER_BLOCKS_MODULE } from "../suites/structure/orderBlocks";
import { FVG_MODULE } from "../suites/structure/fvg";
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

// ─── 5. Contract hygiene ──────────────────────────────────────────────────────

const MODULES: SuiteModuleDef[] = [MARKET_STRUCTURE_MODULE, ORDER_BLOCKS_MODULE, FVG_MODULE];

const SRC_FILES = ["pivots.ts", "marketStructure.ts", "orderBlocks.ts", "fvg.ts"];

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
  }
  return out;
}

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
      const src = readFileSync(join(__dirname, "..", "suites", "structure", f), "utf8");
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
      const src = readFileSync(join(__dirname, "..", "suites", "structure", f), "utf8");
      const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
      expect(code.includes("Date.now"), `${f}: Date.now`).toBe(false);
      expect(code.includes("Math.random"), `${f}: Math.random`).toBe(false);
      expect(code.includes("new Date"), `${f}: new Date`).toBe(false);
    }
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
    for (const mod of MODULES) {
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
    for (const mod of MODULES) {
      for (const bars of [[], walkBars(2), walkBars(11)]) {
        const res = run(mod, bars);
        expect(Array.isArray(res.prims)).toBe(true);
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

  it("keeps language-neutral chart microcopy identical across languages", () => {
    const en = run(MARKET_STRUCTURE_MODULE, bars, { swingLen: 15 }, "en");
    const zh = run(MARKET_STRUCTURE_MODULE, bars, { swingLen: 15 }, "zh");
    const tags = (r: ModuleResult) =>
      r.prims.filter((p) => p.kind === "label" && /^ms-(sw|in)-(bos|choch)-l-/.test(p.id)).map((p: any) => p.text);
    expect(tags(en).length).toBeGreaterThan(0);
    expect(tags(zh)).toEqual(tags(en)); // "BOS"/"CHoCH" are not translated
  });
});

// ─── 6. Caps / density ────────────────────────────────────────────────────────

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
