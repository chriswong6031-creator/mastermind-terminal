/**
 * aggTrend — Market Structure Core W2 (history and relationships).
 *
 * The properties worth pinning here are the ones that fail silently: a percentile
 * computed against the wrong reference set, a regression fed multi-day gaps as if they
 * were daily, and a horizon table that reports "no support" when it means "no data".
 */
import { describe, expect, it } from "vitest";
import {
  decimate,
  extremes,
  HORIZONS,
  spotVol,
  SPOTVOL_MIN_N,
  TREND_KEY,
  TREND_GREEKS,
  trendSeries,
  VOL_RESID_Z,
  windowStats,
  type AggPoint,
  type AggTrendPayload,
} from "@/lib/aggTrend";
import { backendPath, fixtureFor, isValidF, r2Key } from "@/lib/flowSource";

// ─── Fixtures ────────────────────────────────────────────────────────────────────────

/** n sessions of business days from 2024-01-01, with a caller-shaped gamma series. */
function makeSeries(n: number, gamma: (i: number) => number): AggPoint[] {
  const out: AggPoint[] = [];
  const d = new Date(Date.UTC(2024, 0, 1));
  for (let i = 0; i < n; i++) {
    while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
    out.push({ d: d.toISOString().slice(0, 10), s: 100 + i * 0.1, iv: 0.2, g: gamma(i) });
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

function payload(series: AggPoint[]): AggTrendPayload {
  return { schema: "options_hub.aggtrend/v1", root: "SPY", series, n_days: series.length };
}

// ─── windowStats ─────────────────────────────────────────────────────────────────────

describe("windowStats", () => {
  it("reports the quantiles of a known sample", () => {
    const s = windowStats([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])!;
    expect(s.n).toBe(10);
    expect(s.min).toBe(1);
    expect(s.max).toBe(10);
    expect(s.p50).toBeCloseTo(5.5, 6);
    expect(s.mean).toBeCloseTo(5.5, 6);
  });

  it("interpolates percentiles the way the publisher's numpy does", () => {
    // numpy.percentile([1..10], 5) == 1.45 on the default linear method. Matching this
    // is what keeps a window's stats comparable to the payload's full-history stats.
    const s = windowStats([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])!;
    expect(s.p05).toBeCloseTo(1.45, 6);
    expect(s.p95).toBeCloseTo(9.55, 6);
  });

  it("places the last value in its own distribution (midrank on ties)", () => {
    // (less + equal/2) / n — the last value always ties itself once, so the max
    // of five reads 90th, the min 10th, and a FLAT series reads 50th instead of
    // the old strict-less 0th ("extreme low" for an unexceptional value).
    expect(windowStats([1, 2, 3, 4, 10])!.pctile).toBeCloseTo(90, 6);
    expect(windowStats([10, 4, 3, 2, 1])!.pctile).toBeCloseTo(10, 6);
    expect(windowStats([5, 5, 5, 5])!.pctile).toBeCloseTo(50, 6);
  });

  it("declines rather than guessing on fewer than two observations", () => {
    expect(windowStats([])).toBeNull();
    expect(windowStats([1])).toBeNull();
    expect(windowStats([NaN, Infinity])).toBeNull();
  });
});

// ─── trendSeries ─────────────────────────────────────────────────────────────────────

describe("trendSeries", () => {
  it("maps every greek to the compact key the publisher writes", () => {
    for (const g of TREND_GREEKS) expect(TREND_KEY[g]).toBeTruthy();
    const p = payload([{ d: "2024-01-02", g: 1, dl: 2, vn: 3, ch: 4, vg: 5 }]);
    expect(trendSeries(p, "gamma").points[0].v).toBe(1);
    expect(trendSeries(p, "delta").points[0].v).toBe(2);
    expect(trendSeries(p, "vanna").points[0].v).toBe(3);
    expect(trendSeries(p, "charm").points[0].v).toBe(4);
    expect(trendSeries(p, "vega").points[0].v).toBe(5);
  });

  it("recomputes the distribution for the window, not the whole series", () => {
    // A ramp from 0..999: over ALL sessions today is the max; over the last 252 it is
    // still the max, but the p05 reference moves a long way. Reporting the full-history
    // p05 next to a 1y chart would be a quiet category error.
    const p = payload(makeSeries(1000, (i) => i));
    const all = trendSeries(p, "gamma", "all");
    const y1 = trendSeries(p, "gamma", "1y");
    expect(all.n).toBe(1000);
    expect(y1.n).toBe(252);
    expect(all.stats!.p05).toBeLessThan(y1.stats!.p05);
    expect(y1.stats!.min).toBe(748);
  });

  it("flags a window the payload cannot fill", () => {
    const p = payload(makeSeries(100, () => 1));
    expect(trendSeries(p, "gamma", "3y").truncated).toBe(true);
    expect(trendSeries(p, "gamma", "3y").n).toBe(100);
    expect(trendSeries(p, "gamma", "all").truncated).toBe(false);
  });

  it("skips sessions with no value for the chosen greek rather than reading them as zero", () => {
    const p = payload([
      { d: "2024-01-02", g: 1 },
      { d: "2024-01-03" },
      { d: "2024-01-04", g: 3 },
    ]);
    const s = trendSeries(p, "gamma");
    expect(s.points.map((x) => x.d)).toEqual(["2024-01-02", "2024-01-04"]);
    expect(s.stats!.mean).toBe(2);
  });

  it("is empty, not thrown, on a missing or malformed payload", () => {
    for (const bad of [null, undefined, {}, { series: [] }, { series: "nope" }]) {
      const s = trendSeries(bad as AggTrendPayload, "gamma");
      expect(s.points).toEqual([]);
      expect(s.stats).toBeNull();
    }
  });
});

// ─── spotVol ─────────────────────────────────────────────────────────────────────────

/** Sequential calendar dates — spotVol drops pairs more than a long weekend apart. */
function seqDate(i: number): string {
  return new Date(Date.UTC(2024, 0, 2) + i * 86_400_000).toISOString().slice(0, 10);
}

/** n sessions where IV change is exactly `beta` vol points per +1% spot, plus noise. */
function spotVolSeries(n: number, beta: number, noise = 0): AggPoint[] {
  const out: AggPoint[] = [];
  let s = 100;
  let iv = 0.2;
  for (let i = 0; i < n; i++) {
    out.push({ d: seqDate(i), s, iv });
    // Deterministic pseudo-random return so the test never flakes.
    const r = Math.sin(i * 1.7) * 1.5;
    const wobble = noise * Math.cos(i * 2.3);
    iv = iv + (beta * r + wobble) / 100;
    s = s * (1 + r / 100);
  }
  return out;
}

describe("spotVol", () => {
  it("recovers a known slope in vol points per +1% spot", () => {
    const r = spotVol(spotVolSeries(300, -0.8), 252);
    expect(r.n).toBe(252);
    expect(r.beta!).toBeCloseTo(-0.8, 6);
    expect(r.r2!).toBeCloseTo(1, 6);
  });

  it("reports R-squared below one once the relationship is noisy", () => {
    const r = spotVol(spotVolSeries(300, -0.8, 0.5), 252);
    expect(r.r2!).toBeLessThan(1);
    expect(r.r2!).toBeGreaterThan(0);
    expect(r.residSd!).toBeGreaterThan(0);
  });

  it("calls a vol move that overshoots the regression 'overvixed'", () => {
    const s = spotVolSeries(200, -0.8, 0.3);
    // Append a session whose IV jumps far more than the spot move implies.
    const last = s[s.length - 1];
    s.push({ d: seqDate(200), s: last.s! * 0.999, iv: last.iv! + 0.05 });
    const r = spotVol(s, 252);
    expect(r.residZ!).toBeGreaterThan(VOL_RESID_Z);
    expect(r.verdict).toBe("overvixed");
    expect(r.gauge!).toBeGreaterThan(0);
    expect(r.gauge!).toBeLessThanOrEqual(1);
  });

  it("calls the mirror case 'undervixed'", () => {
    const s = spotVolSeries(200, -0.8, 0.3);
    const last = s[s.length - 1];
    s.push({ d: seqDate(200), s: last.s! * 0.999, iv: last.iv! - 0.05 });
    const r = spotVol(s, 252);
    expect(r.residZ!).toBeLessThan(-VOL_RESID_Z);
    expect(r.verdict).toBe("undervixed");
    expect(r.gauge!).toBeLessThan(0);
  });

  it("clamps the gauge so one outlier cannot peg the needle", () => {
    const s = spotVolSeries(200, -0.8, 0.3);
    const last = s[s.length - 1];
    s.push({ d: seqDate(200), s: last.s!, iv: last.iv! + 5 }); // absurd
    const r = spotVol(s, 252);
    expect(r.gauge).toBe(1);
  });

  it("skips sessions missing spot or IV rather than pairing across the gap", () => {
    // A gap would otherwise contribute a multi-day change labelled as a daily one,
    // inflating the variance of x and flattening beta toward zero.
    const clean = spotVolSeries(120, -0.8);
    const holed = clean.map((p, i) => (i === 60 ? { d: p.d } : p));
    const r = spotVol(holed, 252);
    expect(r.n).toBe(clean.length - 1 - 2); // two pairs lost around the hole
    expect(r.beta!).toBeCloseTo(-0.8, 6);
  });

  it("declines below the minimum sample rather than reporting a slope", () => {
    const r = spotVol(spotVolSeries(SPOTVOL_MIN_N - 5, -0.8));
    expect(r.beta).toBeNull();
    expect(r.verdict).toBe("unknown");
    expect(r.points.length).toBeGreaterThan(0); // still plottable
  });

  it("is empty, not thrown, on absent input", () => {
    for (const bad of [null, undefined, [], [{ d: "2024-01-02" }]]) {
      expect(spotVol(bad as AggPoint[]).verdict).toBe("unknown");
    }
  });

  it("declines when spot never moves (no variance to regress on)", () => {
    const flat: AggPoint[] = Array.from({ length: 100 }, (_, i) => ({
      d: seqDate(i), s: 100, iv: 0.2 + i / 1000,
    }));
    expect(spotVol(flat).beta).toBeNull();
  });
});

// ─── extremes ────────────────────────────────────────────────────────────────────────

const ASOF = "2026-07-31";

/** gex is WHOLE DOLLARS in the matrix payload, per gexLadder's contract. */
function cell(strike: number, expiry: string, gexMn: number) {
  return { strike, expiry, gex: gexMn * 1e6 };
}

describe("extremes", () => {
  it("splits walls by horizon band", () => {
    const r = extremes(
      {
        cells: [
          // near (0-5d): resistance 105, support 95
          cell(105, "2026-08-03", 40), cell(95, "2026-08-03", -50),
          // swing (6-30d): a DIFFERENT pair, further out
          cell(115, "2026-08-21", 80), cell(85, "2026-08-21", -90),
          // far (31d+)
          cell(130, "2026-12-18", 120), cell(70, "2026-12-18", -140),
        ],
      },
      100,
      ASOF,
    );
    expect(r.available).toBe(true);
    const by = Object.fromEntries(r.rows.map((x) => [x.horizon, x]));
    expect([by.near.resistance, by.near.support]).toEqual([105, 95]);
    expect([by.swing.resistance, by.swing.support]).toEqual([115, 85]);
    expect([by.far.resistance, by.far.support]).toEqual([130, 70]);
  });

  it("sums cells sharing a strike within a band before ranking", () => {
    const r = extremes(
      {
        cells: [
          cell(105, "2026-08-03", 10),
          cell(105, "2026-08-04", 60), // 105 totals 70 -> beats 110's 50
          cell(110, "2026-08-04", 50),
        ],
      },
      100,
      ASOF,
    );
    const near = r.rows.find((x) => x.horizon === "near")!;
    expect(near.resistance).toBe(105);
    expect(near.resistanceMn).toBeCloseTo(70, 6);
  });

  it("picks the heaviest |gamma| on each side regardless of sign", () => {
    // The first pass filtered by sign (above needed +, below needed −), which
    // silently discarded a dominant negative-gamma strike below spot — exactly
    // the strike a short-gamma cascade pivots on — and reported "none".
    const r = extremes(
      {
        cells: [
          cell(105, "2026-08-03", -99), // heaviest above, negative — must win
          cell(107, "2026-08-03", 5),
          cell(95, "2026-08-03", -200), // heaviest below, negative — must win
          cell(97, "2026-08-03", 10),
        ],
      },
      100,
      ASOF,
    );
    const near = r.rows.find((x) => x.horizon === "near")!;
    expect(near.resistance).toBe(105);
    expect(near.resistanceMn).toBeLessThan(0); // the signed value travels with it
    expect(near.support).toBe(95);
    expect(near.supportMn).toBeLessThan(0);
  });

  it("distinguishes 'no data' from 'no wall' via the cell count", () => {
    const r = extremes({ cells: [cell(105, "2026-08-03", 40)] }, 100, ASOF);
    const near = r.rows.find((x) => x.horizon === "near")!;
    const far = r.rows.find((x) => x.horizon === "far")!;
    expect(near.cells).toBe(1);
    expect(near.support).toBeNull(); // covered band, genuinely no put-side wall
    expect(far.cells).toBe(0); // nothing known about this horizon at all
  });

  it("ignores expiries already past", () => {
    const r = extremes({ cells: [cell(105, "2026-07-01", 40)] }, 100, ASOF);
    expect(r.available).toBe(false);
  });

  it("falls back to the matrix's own spot when none is passed", () => {
    const r = extremes({ spot: 100, cells: [cell(105, "2026-08-03", 40)] }, null, ASOF);
    expect(r.rows.find((x) => x.horizon === "near")!.resistance).toBe(105);
  });

  it("reports unavailable rather than empty rows when there is no matrix", () => {
    for (const bad of [null, undefined, {}, { cells: [] }]) {
      const r = extremes(bad, 100, ASOF);
      expect(r.available).toBe(false);
      expect(r.rows).toHaveLength(HORIZONS.length);
      expect(r.rows.every((x) => x.resistance === null && x.support === null)).toBe(true);
    }
    expect(extremes({ cells: [cell(105, "2026-08-03", 1)] }, 100, null).available).toBe(false);
    expect(extremes({ cells: [cell(105, "2026-08-03", 1)] }, 0, ASOF).available).toBe(false);
  });
});

// ─── f-param wiring ──────────────────────────────────────────────────────────────────
//
// The `agg:` prefix has to be disjoint from every `gex*` form already on this route. A
// mis-resolved key does not throw — it falls through to R2, misses, and returns null, so
// the card simply renders empty forever. Pinning the mapping is the only way to catch it.

describe("agg: f-param", () => {
  it("is accepted only with a root", () => {
    expect(isValidF("agg:SPY")).toBe(true);
    expect(isValidF("agg:")).toBe(false);
    expect(isValidF("agg")).toBe(false);
    expect(isValidF("aggtrend:SPY")).toBe(false);
  });

  it("resolves to its own backend and R2 paths", () => {
    expect(backendPath("agg:SPY")).toBe("/api/hub/aggtrend/SPY");
    expect(r2Key("agg:SPY")).toBe("options_hub/aggtrend/SPY.json");
  });

  it("cannot be confused with any gex form", () => {
    for (const other of ["gex:SPY", "gex_dates:SPY", "gex_at:SPY:2026-07-31", "gexstate:SPY"]) {
      expect(backendPath("agg:SPY")).not.toBe(backendPath(other));
      expect(r2Key("agg:SPY")).not.toBe(r2Key(other));
    }
  });

  it("serves a root-keyed fixture and refuses an unknown root", async () => {
    const spy = (await fixtureFor("agg:SPY")) as AggTrendPayload;
    expect(spy.schema).toBe("options_hub.aggtrend/v1");
    expect(spy.root).toBe("SPY");
    expect(Array.isArray(spy.series) && spy.series.length).toBeTruthy();
    // Never another ticker's nine-year history under this ticker's header.
    expect(await fixtureFor("agg:ZZZZ")).toEqual({});
  });

  it("ships a fixture the real math can consume end to end", async () => {
    const p = (await fixtureFor("agg:SPY")) as AggTrendPayload;
    const ts = trendSeries(p, "gamma", "all");
    expect(ts.points.length).toBeGreaterThan(100);
    expect(ts.stats!.p05).toBeLessThan(ts.stats!.p95);
    const sv = spotVol(p.series, 252);
    expect(sv.beta).not.toBeNull();
    // Equity index ATM vol falls when spot rises — the leverage effect. A fixture that
    // did not show it would mean the spot/IV columns had been paired incorrectly.
    expect(sv.beta!).toBeLessThan(0);
  });
});

// ─── decimate ────────────────────────────────────────────────────────────────────────
//
// The failure mode this replaces: dropping every Nth point to fit a long series into a
// narrow plot. That deletes spikes, and on an exposure chart the spikes ARE the signal —
// a decimation that loses the 2020 crash reading would be worse than no chart.

describe("decimate", () => {
  const pts = (vals: number[]) => vals.map((v, i) => ({ d: `d${i}`, v }));

  it("returns the series untouched when it already fits", () => {
    const p = pts([1, 2, 3, 4]);
    expect(decimate(p, 10).map((x) => x.v)).toEqual([1, 2, 3, 4]);
    expect(decimate(p, 10).map((x) => x.i)).toEqual([0, 1, 2, 3]);
  });

  it("preserves the exact vertical envelope", () => {
    const vals = Array.from({ length: 2000 }, (_, i) => Math.sin(i / 7) * 10);
    vals[811] = 999; // a lone spike that naive sampling would drop
    vals[1502] = -999;
    const out = decimate(pts(vals), 200);
    expect(Math.max(...out.map((x) => x.v))).toBe(999);
    expect(Math.min(...out.map((x) => x.v))).toBe(-999);
  });

  it("keeps every point in chronological order", () => {
    const out = decimate(pts(Array.from({ length: 2000 }, (_, i) => Math.cos(i / 3))), 150);
    for (let i = 1; i < out.length; i++) expect(out[i].i).toBeGreaterThanOrEqual(out[i - 1].i);
  });

  it("always keeps the final session — the one everything is compared against", () => {
    const vals = Array.from({ length: 2000 }, (_, i) => i % 17);
    const out = decimate(pts(vals), 100);
    expect(out[out.length - 1].i).toBe(1999);
    expect(out[out.length - 1].v).toBe(vals[1999]);
  });

  it("cuts a nine-year series to roughly two points per column", () => {
    const out = decimate(pts(Array.from({ length: 2407 }, (_, i) => Math.sin(i))), 344);
    expect(out.length).toBeLessThanOrEqual(344 * 2 + 1);
    expect(out.length).toBeGreaterThan(344);
  });

  it("is empty, not thrown, on absent input", () => {
    expect(decimate([], 100)).toEqual([]);
    expect(decimate(null as unknown as { d: string; v: number }[], 100)).toEqual([]);
    expect(decimate(pts([1, 2, 3]), 0).length).toBeGreaterThan(0);
  });
});
