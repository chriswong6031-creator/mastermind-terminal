import { describe, it, expect } from "vitest";
import { compilePine, runPine, type Bar } from "../pine-engine";
import { FLAGSHIP_PINE, ORACLE_V1_PINE } from "../pine";

// Synthetic daily bars: uptrend + multi-period oscillation so RSI/MACD/Stoch produce
// real crossovers (and therefore B1/S1 → B2/S2 → BUY★/SELL★ signals) to exercise the engine.
function genBars(n: number): Bar[] {
  const bars: Bar[] = [];
  const start = Date.UTC(2021, 0, 4);
  for (let i = 0; i < n; i++) {
    const osc = Math.sin(i / 9) * 3 + Math.sin(i / 23) * 7 + Math.sin(i / 61) * 12;
    const c = 100 + i * 0.05 + osc;
    const o = c - Math.sin(i / 9) * 0.6;
    const h = Math.max(o, c) + 1.3;
    const l = Math.min(o, c) - 1.3;
    const time = new Date(start + i * 86400000).toISOString().slice(0, 10);
    bars.push({ time, o, h, l, c, v: 1_000_000 + (i % 5) * 100_000 });
  }
  return bars;
}

describe("FLAGSHIP_PINE (v1 Golden Oracle confluence)", () => {
  it("compiles cleanly in the engine", () => {
    const c = compilePine(FLAGSHIP_PINE);
    expect(c.ok, "compile errors: " + JSON.stringify(c.errors)).toBe(true);
  });

  it("runs on daily bars without a runtime error and emits signal shapes", () => {
    const bars = genBars(720);
    const out = runPine(FLAGSHIP_PINE, bars, { timeframe: "D", symbol: "TEST" });
    expect(out.ok, "run errors: " + JSON.stringify(out.errors)).toBe(true);
    expect(out.result).toBeTruthy();
    const r = out.result!;
    // eslint-disable-next-line no-console
    console.log("[flagship] plots=%d shapes=%d hlines=%d warnings=%s",
      r.plots.length, r.shapes.length, r.hlines.length, JSON.stringify(r.warnings.slice(0, 8)));
    // eslint-disable-next-line no-console
    console.log("[flagship] shape texts:", Array.from(new Set(r.shapes.map((s) => s.text).filter(Boolean))).slice(0, 20));
    expect(r.barCount).toBe(bars.length);
  });
});

describe("ORACLE_V1_PINE (overlay-only Golden Oracle derived from the flagship)", () => {
  it("compiles cleanly", () => {
    const c = compilePine(ORACLE_V1_PINE);
    expect(c.ok, "compile errors: " + JSON.stringify(c.errors)).toBe(true);
  });

  it("is overlay=true, drops the oscillator pane, and still emits the price signal markers", () => {
    const bars = genBars(720);
    const out = runPine(ORACLE_V1_PINE, bars, { timeframe: "D", symbol: "TEST" });
    expect(out.ok, "run errors: " + JSON.stringify(out.errors)).toBe(true);
    const r = out.result!;
    // eslint-disable-next-line no-console
    console.log("[oracle-v1] overlay=%s plots=%d shapes=%d texts=%s",
      r.meta.overlay, r.plots.length, r.shapes.length,
      JSON.stringify(Array.from(new Set(r.shapes.map((s) => s.text).filter(Boolean))).slice(0, 20)));
    expect(r.meta.overlay).toBe(true);                         // draws on the price pane, no sub-pane
    expect(r.plots.length).toBeLessThanOrEqual(1);             // oscillator plots gone (only the 200-day MA may remain)
    expect(r.shapes.length).toBeGreaterThan(0);                // still produces BUY/SELL/etc. markers
    // the confluence star signals survive the trim
    const texts = new Set(r.shapes.map((s) => s.text));
    expect(texts.has("★")).toBe(true);
  });
});
