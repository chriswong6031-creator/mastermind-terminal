import { describe, it, expect } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// Regression guard for ChartPanel's sub-pane index assignment (buildAllIndicators
// loop + Effect-3 tail-append). The real component can't run in vitest (it needs a
// live canvas), so this models the two collaborating pieces faithfully:
//
//   1. lightweight-charts 5.2 getOrCreatePane(index) — verified against the installed
//      source (dist/lightweight-charts.development.mjs):
//          index = Math.min(this._panes.length, index);          // clamp out-of-range
//          if (index < this._panes.length) return panes[index];  // reuse existing
//          return addPane(index);                                // create at the END
//      i.e. a requested index >= panes.length is CLAMPED to panes.length and a new
//      pane is appended there — NOT created at the requested index.
//
//   2. The assignment loop, which decides the pane index BEFORE calling each builder.
//      buildRvol/buildCvd return [] on daily timeframes (intraday-only). The bug: the
//      loop set paneMapRef + advanced the counter unconditionally, so after an empty
//      builder the requested counter ran 1 ahead of the real pane count and a later
//      multi-series builder (ADX with +DI/−DI = 3 series) split across two panes.
//
// The fix ("claim a pane + advance only when the builder returned ≥1 series") makes the
// requested index track the real pane count, keeping each builder's series contiguous.
// ─────────────────────────────────────────────────────────────────────────────

// Faithful model of the chart's pane store. addSeries(paneIndex) returns the ACTUAL
// pane index the series landed in, after getOrCreatePane's clamp.
class FakeChart {
  paneCount = 1; // pane 0 = price pane, always present
  addSeries(requestedPane: number): number {
    const idx = Math.min(this.paneCount, requestedPane); // clamp (mirrors getOrCreatePane)
    if (idx < this.paneCount) return idx; // reuse existing pane
    this.paneCount += 1; // append a new pane at the end
    return idx; // idx === old paneCount
  }
}

// A sub-pane builder: renders `count` series onto `chart` at `pane`, returns the series'
// actual landing pane indices (in render order). Mirrors the real builders' addSeries calls.
function build(chart: FakeChart, pane: number, count: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) out.push(chart.addSeries(pane));
  return out;
}

type Strategy = "buggy" | "fixed";

// Run the assignment loop for an ordered list of [key, seriesCount] sub-panes.
// Returns the paneMap (key→requested index) plus, for each key, the set of ACTUAL
// panes its series landed in — so a split (>1 distinct pane) is detectable.
function assign(subpanes: [string, number][], strategy: Strategy) {
  const chart = new FakeChart();
  const paneMap = new Map<string, number>();
  const landedPanes = new Map<string, number[]>();
  let pane = 1;
  for (const [key, count] of subpanes) {
    const landed = build(chart, pane, count);
    landedPanes.set(key, landed);
    if (strategy === "fixed") {
      // FIX: claim the pane + advance ONLY when the builder actually rendered series.
      if (count > 0) {
        paneMap.set(key, pane);
        pane += 1;
      }
    } else {
      // OLD (buggy): always claim + advance, even for empty (rvol/cvd on daily).
      paneMap.set(key, pane);
      pane += 1;
    }
  }
  return { chart, paneMap, landedPanes };
}

// The concrete repro from the bug report: RVOL (empty on daily) then ADX+DI (3 series).
const DAILY_RVOL_ADX_DI: [string, number][] = [
  ["rvol", 0], // buildRvol returns [] on daily
  ["adx", 3], // buildAdx with showDi=true → ADX line + +DI + −DI
];

describe("ChartPanel sub-pane assignment — empty intraday-only builders on daily", () => {
  it("the OLD unconditional loop splits ADX+DI across two panes (documents the bug)", () => {
    const { paneMap, landedPanes } = assign(DAILY_RVOL_ADX_DI, "buggy");
    // empty rvol wrongly claimed pane 1; adx was told pane 2 while only pane 0 existed
    expect(paneMap.get("rvol")).toBe(1);
    expect(paneMap.get("adx")).toBe(2);
    const adx = landedPanes.get("adx")!;
    // ADX line clamps into pane 1; +DI clamps into pane 2; −DI reuses pane 2 → SPLIT
    expect(adx).toEqual([1, 2, 2]);
    expect(new Set(adx).size).toBe(2); // series split across two distinct panes
  });

  it("the FIXED loop keeps all ADX+DI series in one pane, no phantom pane", () => {
    const { chart, paneMap, landedPanes } = assign(DAILY_RVOL_ADX_DI, "fixed");
    // empty rvol claims no pane; adx gets pane 1 and all three series land there
    expect(paneMap.has("rvol")).toBe(false);
    expect(paneMap.get("adx")).toBe(1);
    const adx = landedPanes.get("adx")!;
    expect(adx).toEqual([1, 1, 1]);
    expect(new Set(adx).size).toBe(1); // contiguous — no split
    // exactly two panes exist: price (0) + adx (1); no phantom pane 2
    expect(chart.paneCount).toBe(2);
  });

  it("fixed: paneMap index matches every builder's actual landing pane (core invariant)", () => {
    // A mixed run: two live builders, an empty one between them, then another live one.
    const subpanes: [string, number][] = [
      ["osc", 2], // rsi + stochrsi
      ["rvol", 0], // empty on daily
      ["adx", 3], // ADX + DI split candidate
      ["cvd", 0], // empty on daily
      ["macd", 3], // macd line + signal + histogram
    ];
    const { chart, paneMap, landedPanes } = assign(subpanes, "fixed");
    for (const [key, count] of subpanes) {
      const landed = landedPanes.get(key)!;
      if (count === 0) {
        expect(paneMap.has(key)).toBe(false); // empty builders claim nothing
        expect(landed).toEqual([]);
      } else {
        // every series lands in exactly the pane paneMap recorded — no clamp drift
        expect(new Set(landed).size).toBe(1);
        expect(landed[0]).toBe(paneMap.get(key));
      }
    }
    // price + osc + adx + macd = 4 panes; the two empty builders added none
    expect(chart.paneCount).toBe(4);
    expect(paneMap.get("osc")).toBe(1);
    expect(paneMap.get("adx")).toBe(2);
    expect(paneMap.get("macd")).toBe(3);
  });

  it("fixed: all-empty daily sub-panes create no phantom panes", () => {
    const { chart, paneMap } = assign([["rvol", 0], ["cvd", 0]], "fixed");
    expect(paneMap.size).toBe(0);
    expect(chart.paneCount).toBe(1); // only the price pane
  });

  it("intraday (builders non-empty) is unaffected by the fix — indices stay dense", () => {
    // On intraday every builder returns series, so buggy and fixed must agree.
    const subpanes: [string, number][] = [["rvol", 2], ["adx", 3], ["cvd", 1]];
    const fixed = assign(subpanes, "fixed");
    const buggy = assign(subpanes, "buggy");
    for (const [key] of subpanes) {
      expect(fixed.paneMap.get(key)).toBe(buggy.paneMap.get(key));
      expect(new Set(fixed.landedPanes.get(key)!).size).toBe(1); // no split
    }
    expect(fixed.paneMap.get("rvol")).toBe(1);
    expect(fixed.paneMap.get("adx")).toBe(2);
    expect(fixed.paneMap.get("cvd")).toBe(3);
    expect(fixed.chart.paneCount).toBe(4);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Regression guard for the INCREMENTAL path's pine-sub-pane drift (Effect 3). This
// needs a richer model than FakeChart because two more lightweight-charts 5.2 mechanics
// are in play (both verified against dist/lightweight-charts.development.mjs):
//
//   • removeSeries → _cleanupIfPaneIsEmpty: when a pane's last series is removed AND
//     panes.length > 1, the pane is spliced out and every higher pane slides DOWN one.
//   • buildPineScript records the REQUESTED sub-pane index; getOrCreatePane may have
//     clamped it on creation, so the stored index can sit ABOVE the real one.
//
// With a pine sub-pane seated above the built-ins, the OLD incremental code drifted the
// stored maps +1 per cycle: the osc in-place rebuild removed osc's series first (emptying
// its pane → auto-removed → pine slid down, then osc re-seated onto pine's slot), and the
// clearAllPine/buildAllPine re-seat recorded requested-not-actual indices. On the next add
// nextFreePane() returned panes.length+1 and buildMacd (histogram+line+signal) split across
// two panes. The FIX rebuilds osc add-before-remove (pane never empties) and re-derives both
// maps from the live pane indices around the re-seat. Expected pane numbers below mirror a
// replay against the real lightweight-charts 5.2.0 library.
// ─────────────────────────────────────────────────────────────────────────────

// Pane store that also models removeSeries + the emptied-pane auto-removal shift.
// addSeries/removeSeries take/return opaque series ids; paneOf(id) is the live index.
class PaneChart {
  private panes: number[] = [1]; // series-count per pane; pane 0 = price series
  private seriesPane = new Map<number, number>();
  private nextId = 1;
  constructor() {
    this.seriesPane.set(0, 0);
  } // the ever-present price series
  addSeries(requestedPane: number): number {
    const idx = Math.min(this.panes.length, requestedPane); // getOrCreatePane clamp
    if (idx < this.panes.length) this.panes[idx]++;
    else this.panes.push(1); // append a new pane at the end
    const id = this.nextId++;
    this.seriesPane.set(id, idx);
    return id;
  }
  removeSeries(id: number): void {
    const p = this.seriesPane.get(id);
    if (p == null) return;
    this.seriesPane.delete(id);
    this.panes[p]--;
    if (this.panes[p] === 0 && this.panes.length > 1) {
      // _cleanupIfPaneIsEmpty: drop the empty pane, slide higher panes down one
      this.panes.splice(p, 1);
      for (const [sid, sp] of this.seriesPane) if (sp > p) this.seriesPane.set(sid, sp - 1);
    }
  }
  paneOf(id: number): number {
    return this.seriesPane.get(id)!;
  }
  get paneCount(): number {
    return this.panes.length;
  }
}

// Replay the reported repro on the incremental path: a pine sub-pane script is active with
// rsi (the osc pane), then the user adds stochrsi (osc membership change), then macd.
function incrementalPineRepro(strategy: Strategy) {
  const chart = new PaneChart();
  const indSeries = new Map<string, number[]>();
  const pineSeries = new Map<string, number[]>();
  const paneMap = new Map<string, number>();
  const pinePaneMap = new Map<string, number>();

  const live = (ids?: number[]): number | null => (ids && ids.length ? chart.paneOf(ids[0]) : null);
  const buildOsc = (pane: number, hasStoch: boolean): number[] => {
    const out: number[] = [];
    if (hasStoch) {
      out.push(chart.addSeries(pane)); // %K
      out.push(chart.addSeries(pane)); // %D
    }
    out.push(chart.addSeries(pane)); // RSI
    return out;
  };
  const buildMacd = (pane: number): number[] => [chart.addSeries(pane), chart.addSeries(pane), chart.addSeries(pane)]; // histogram + line + signal
  const buildPine = (sub: number): number[] => [chart.addSeries(sub)];

  const nextFreePane = (): number => {
    let mx = 0;
    for (const v of paneMap.values()) mx = Math.max(mx, v);
    for (const v of pinePaneMap.values()) mx = Math.max(mx, v);
    return mx ? mx + 1 : 1;
  };
  const clearAllPine = (): void => {
    for (const ids of pineSeries.values()) for (const id of ids) chart.removeSeries(id);
    pineSeries.clear();
    pinePaneMap.clear();
  };
  const buildAllPine = (): void => {
    let pane = 1;
    for (const v of paneMap.values()) pane = Math.max(pane, v + 1);
    const ids = buildPine(pane); // buildPineScript records the REQUESTED subPane
    pineSeries.set("pine1", ids);
    if (ids.length) pinePaneMap.set("pine1", pane);
  };
  const reindex = (): void => {
    for (const [k, ids] of indSeries) {
      if (!paneMap.has(k)) continue;
      const p = live(ids);
      if (p != null) paneMap.set(k, p);
    }
    for (const id of [...pinePaneMap.keys()]) {
      const p = live(pineSeries.get(id));
      if (p != null) pinePaneMap.set(id, p);
    }
  };
  const oscInPlace = (): void => {
    if (strategy === "buggy") {
      for (const id of indSeries.get("osc")!) chart.removeSeries(id); // remove BEFORE build → pane empties
      const pane = paneMap.get("osc")!;
      indSeries.set("osc", buildOsc(pane, true));
      paneMap.set("osc", pane); // stores the REQUESTED index
    } else {
      const stale = indSeries.get("osc")!;
      const pane = paneMap.get("osc")!;
      const fresh = buildOsc(pane, true); // build BEFORE remove → pane never empties
      for (const id of stale) chart.removeSeries(id);
      indSeries.set("osc", fresh);
      paneMap.set("osc", live(fresh) ?? pane); // stores the ACTUAL index
    }
  };

  // initial full build: osc(rsi) at pane 1, then the pine sub-pane seated above it
  paneMap.set("osc", 1);
  indSeries.set("osc", buildOsc(1, false));
  buildAllPine();

  // +stochrsi — osc membership change (no add/remove of the pane, no pine re-seat)
  oscInPlace();

  // +macd — osc in-place fires again, macd is tail-appended, then pine is re-seated above it
  oscInPlace();
  {
    const pane = nextFreePane();
    const m = buildMacd(pane);
    indSeries.set("macd", m);
    paneMap.set("macd", strategy === "fixed" ? (live(m) ?? pane) : pane);
  }
  clearAllPine();
  if (strategy === "fixed") reindex();
  buildAllPine();
  if (strategy === "fixed") reindex();

  return {
    macdPanes: indSeries.get("macd")!.map((id) => chart.paneOf(id)),
    oscPane: live(indSeries.get("osc")),
    pinePane: live(pineSeries.get("pine1")),
    paneCount: chart.paneCount,
    storedOsc: paneMap.get("osc"),
    storedMacd: paneMap.get("macd"),
    storedPine: pinePaneMap.get("pine1"),
  };
}

describe("ChartPanel incremental sub-pane assignment — pine sub-pane + osc in-place drift", () => {
  it("the OLD incremental path splits macd across two panes (documents the bug)", () => {
    const r = incrementalPineRepro("buggy");
    // histogram clamps into one pane; line + signal into the next → SPLIT + an orphan pane
    expect(r.macdPanes).toEqual([2, 3, 3]);
    expect(new Set(r.macdPanes).size).toBe(2);
    expect(r.paneCount).toBe(5);
  });

  it("the FIXED path keeps macd contiguous with truthful pane maps", () => {
    const r = incrementalPineRepro("fixed");
    // all three macd series in one pane; panes are price + osc + macd + pine
    expect(r.macdPanes).toEqual([2, 2, 2]);
    expect(new Set(r.macdPanes).size).toBe(1);
    expect(r.paneCount).toBe(4);
    // stored indices equal the live ones — no requested-vs-actual drift left behind
    expect(r.oscPane).toBe(1);
    expect(r.storedOsc).toBe(1);
    expect(r.storedMacd).toBe(2);
    expect(r.pinePane).toBe(3);
    expect(r.storedPine).toBe(3);
  });
});
