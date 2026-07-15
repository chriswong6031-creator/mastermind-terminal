// trend.ts — client-side, descriptive TREND state + its forward-return base rates over the symbol's
// own history. Pure functions over Bar[]; no server compute, no engine-math dependency.
//
// This is deliberately NOT the Golden Oracle (a mean-reversion timing overlay). The TREND state is a
// FACT about the current moving-average structure — "price is above its 200-day, the 50-day is above
// the 200-day and rising" — labeled at a position horizon (weeks–months). It is descriptive, not a
// forecast; the per-state forward-return table is published as honest base rates (a megacap lives
// mostly in uptrends, so every name's base rates skew bullish here — context, not edge).
//
// Design doc: docs/ORACLE_DESK_DIAGNOSIS_2026-07-14.md (step 4). States are frozen ex-ante below.

import type { Bar } from "./fund";

export type TrendState = "UPTREND" | "PULLBACK" | "RANGE" | "DOWNTREND";
export const TREND_STATES: TrendState[] = ["UPTREND", "PULLBACK", "RANGE", "DOWNTREND"];

// Forward horizons, in trading days (position horizon = weeks–months).
export const FWD_SHORT = 20;
export const FWD_LONG = 60;
// Bars over which the 50-day MA's slope is judged rising vs rolling.
const SLOPE_LOOKBACK = 10;
const MIN_HISTORY = 200; // need a warm 200-day MA before any state is defined

// Simple moving average, chronological (oldest→newest); NaN until `len` samples exist. Mirrors the
// primitive in techRating.ts (kept local so trend.ts has zero import coupling to the rating engine).
function sma(src: number[], len: number): number[] {
  const out: number[] = new Array(src.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < src.length; i++) {
    sum += src[i];
    if (i >= len) sum -= src[i - len];
    if (i >= len - 1) out[i] = sum / len;
  }
  return out;
}

// Classify one bar from precomputed SMA arrays. null until the 200-day MA is warm.
// Frozen ex-ante state definitions:
//   UPTREND   price>SMA200 AND SMA50>SMA200 AND SMA50 rising
//   PULLBACK  price>SMA200 AND SMA50>SMA200 AND SMA50 flat/falling  (uptrend structure, near-term stall)
//   DOWNTREND price<SMA200 AND SMA50<SMA200                          (death-cross regime)
//   RANGE     everything else (price and the 50/200 cross disagree — directionless)
// A stock at a 52wk high after a bear bounce that hasn't recrossed its MAs lands in DOWNTREND/RANGE,
// so this cannot collapse to "always Up at highs".
function classifyAt(i: number, close: number[], s50: number[], s200: number[]): TrendState | null {
  const c = close[i], a = s50[i], b = s200[i];
  if (!Number.isFinite(c) || !Number.isFinite(a) || !Number.isFinite(b)) return null;
  const priceAbove200 = c > b;
  const goldenCross = a > b;
  if (priceAbove200 && goldenCross) {
    const j = i - SLOPE_LOOKBACK;
    const rising = j < 0 || !Number.isFinite(s50[j]) ? true : a > s50[j];
    return rising ? "UPTREND" : "PULLBACK";
  }
  if (!priceAbove200 && !goldenCross) return "DOWNTREND";
  return "RANGE";
}

// Current (latest-bar) trend state. null if there isn't a warm 200-day MA.
export function computeTrendState(bars: Bar[]): TrendState | null {
  const close = bars.map((b) => b.c);
  if (close.length < MIN_HISTORY) return null;
  return classifyAt(close.length - 1, close, sma(close, 50), sma(close, 200));
}

export interface StateStat {
  state: TrendState;
  n: number;                 // # historical bars in this state with a full FWD_LONG forward window
  fwd20Mean: number | null;  // mean forward-20d return, PERCENT (null if n==0)
  fwd20Win: number | null;   // fraction of forward-20d windows that were positive, 0..1
  fwd60Mean: number | null;
  fwd60Win: number | null;
  // EXCESS = the state's mean forward return minus the symbol's OWN unconditional mean (baseline).
  // This is the honest headline: a name that lives mostly in uptrends has bullish raw returns in every
  // state (NVDA's "downtrend" bars were still followed by +20% because it rose for 25 years), so raw
  // returns overstate every state. Excess strips the name's own drift out — a value near 0 means the
  // trend state carries no forward edge (the house prior: leader-anticipation is a coin flip).
  fwd20Excess: number | null;
  fwd60Excess: number | null;
}

export interface TrendBacktest {
  current: TrendState | null;
  stats: Record<TrendState, StateStat>;
  bars: number;              // total bars available
  baseline20: number | null; // the symbol's unconditional mean forward-20d return (all states pooled)
  baseline60: number | null;
}

function pctMean(xs: number[]): number | null {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null;
}
function winRate(xs: number[]): number | null {
  return xs.length ? xs.filter((x) => x > 0).length / xs.length : null;
}

// Forward-return-by-state over the full available history. Descriptive base rates; see file header.
export function computeTrendBacktest(bars: Bar[]): TrendBacktest {
  const close = bars.map((b) => b.c);
  const current = computeTrendState(bars);
  const acc: Record<TrendState, { r20: number[]; r60: number[] }> = {
    UPTREND: { r20: [], r60: [] }, PULLBACK: { r20: [], r60: [] },
    RANGE: { r20: [], r60: [] }, DOWNTREND: { r20: [], r60: [] },
  };
  if (close.length >= MIN_HISTORY + FWD_LONG) {
    const s50 = sma(close, 50), s200 = sma(close, 200);
    for (let i = 0; i + FWD_LONG < close.length; i++) {
      const st = classifyAt(i, close, s50, s200);
      if (!st) continue;
      const c0 = close[i];
      if (!(c0 > 0)) continue;
      acc[st].r20.push((close[i + FWD_SHORT] / c0 - 1) * 100);
      acc[st].r60.push((close[i + FWD_LONG] / c0 - 1) * 100);
    }
  }
  // Pooled baseline = the symbol's unconditional mean forward return across every classifiable bar.
  const baseline20 = pctMean(TREND_STATES.flatMap((s) => acc[s].r20));
  const baseline60 = pctMean(TREND_STATES.flatMap((s) => acc[s].r60));
  const stats = {} as Record<TrendState, StateStat>;
  for (const st of TREND_STATES) {
    const { r20, r60 } = acc[st];
    const m20 = pctMean(r20), m60 = pctMean(r60);
    stats[st] = {
      state: st, n: r60.length,
      fwd20Mean: m20, fwd20Win: winRate(r20),
      fwd60Mean: m60, fwd60Win: winRate(r60),
      fwd20Excess: m20 != null && baseline20 != null ? m20 - baseline20 : null,
      fwd60Excess: m60 != null && baseline60 != null ? m60 - baseline60 : null,
    };
  }
  return { current, stats, bars: close.length, baseline20, baseline60 };
}
