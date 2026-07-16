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
