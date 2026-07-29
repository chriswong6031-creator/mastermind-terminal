// candlePaint.ts — turn a suite's CandlePaintEntry[] into Lightweight-Charts price-series data.
//
// Mirrors ChartPanel's existing `applyRibbonCandleColors` contract (components/ChartPanel.tsx):
// the candlestick/bar series is re-fed its FULL data array, where painted bars carry per-point
// color overrides and unpainted bars carry none (so the series-level upColor/downColor apply).
//   candles: { time, open, high, low, close, color, borderColor, wickColor }
//   bars:    { time, open, high, low, close, color }
// Line/area chart types take no paint at all — ChartPanel returns early for those, and so should
// the caller (this helper has no way to express a per-point line color).
//
// Pure, deterministic, DOM-free: no clock, no randomness, no mutation of `rows` or `paint`.

import type { CandlePaintEntry } from "./types";

/**
 * @param rows   the SAME display rows the series is fed (i.e. heikin-transformed already, if the
 *               chart type is Heikin-Ashi) — index i must line up with CandlePaintEntry.i.
 * @param paint  merged paint entries from the host bundle (later modules already resolved).
 * @param family "candles" (candlestick/heikin) or "bars" (OHLC bars — color only).
 */
export function paintCandleData(
  rows: Array<{ time: string | number; o: number; h: number; l: number; c: number; v: number }>,
  paint: CandlePaintEntry[],
  family: "candles" | "bars",
): Array<Record<string, any>> {
  const n = rows.length;
  const byIndex = new Map<number, CandlePaintEntry>();
  if (Array.isArray(paint)) {
    for (const e of paint) {
      if (!e || typeof e.i !== "number" || !isFinite(e.i)) continue;
      const i = Math.trunc(e.i);
      if (i < 0 || i >= n) continue; // out-of-range paint (stale bundle vs. shorter rows) is dropped
      byIndex.set(i, e); // later entry wins — matches the host's merge order
    }
  }

  const out: Array<Record<string, any>> = new Array(n);
  for (let i = 0; i < n; i++) {
    const r = rows[i];
    const pt: Record<string, any> = { time: r.time, open: r.o, high: r.h, low: r.l, close: r.c };
    const e = byIndex.size ? byIndex.get(i) : undefined;
    if (e) {
      if (family === "bars") {
        // OHLC bars have a single color channel.
        const c = e.color || e.borderColor || e.wickColor;
        if (c) pt.color = c;
      } else {
        // Candles: body/border/wick. A module that sets only `color` gets body+border+wick painted
        // together (the ChartPanel ribbon precedent) — otherwise the wick keeps the default
        // up/down hue and the bar reads as two conflicting states.
        const border = e.borderColor || e.color;
        const wick = e.wickColor || e.color;
        if (e.color) pt.color = e.color;
        if (border) pt.borderColor = border;
        if (wick) pt.wickColor = wick;
      }
    }
    out[i] = pt;
  }
  return out;
}
