// Shared oscillator math for the PANE suites (Momentum Matrix, Volume Engine, Flow Oscillator).
//
// Contract: lib/indicator-canvas/types.ts (frozen). Doctrine: lib/indicator-canvas/README.md.
// This file is pure math — no DOM, no CSS, no colors, no wall clock, no randomness, no module-level
// mutable state. Every function is a deterministic function of its arguments alone, so a module that
// composes them inherits determinism for free.
//
// Three conventions run through the whole file and are load-bearing for the non-repaint tests:
//
//  1. WARM-UP IS HONEST. A smoother emits NaN until it has actually seen `len` usable samples. It
//     never back-fills, never seeds from a single value, and never pretends a partial window is a
//     full one. Consumers gate on Number.isFinite() and skip the warm-up region.
//  2. INVALID INPUT IS SKIPPED, NOT ZEROED. A non-finite input contributes nothing to the recurrence
//     and produces NaN at its own index; the smoother resumes from its previous state on the next
//     usable sample. Holes therefore shorten nothing and fabricate nothing (matching the shipped
//     overlay modules, whose loops `continue` on an invalid bar).
//  3. NO LOOKAHEAD. Every value at index i is a function of indices <= i only. Appending bars can
//     never change an already-emitted value — that is what makes the pane modules non-repainting.
//
// Perf: the smoothers are single forward passes (O(n)); the window statistics are O(window) per call
// (O(n·window) when a module walks every bar), which matches the precedent set by trendEngine's
// percentileAt and stays inside the <10ms / 5k bars budget for the windows the modules use (<= 200).
// Nothing allocates inside a per-bar loop beyond the declared outputs.

import type { SuiteBar } from "@/lib/indicator-canvas/types";

// ------------------------------------------------------------------------------------- internals

/** Sanitize a smoothing length: integer, >= 1. Non-finite input falls back to 1 (identity-ish). */
function sanLen(len: number): number {
  const n = Math.floor(Number(len));
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

/** Sanitize a window size: integer, >= 1. */
function sanWin(window: number): number {
  const n = Math.floor(Number(window));
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Below this many usable samples a percentile rank is noise, so we return the neutral 50. */
const MIN_RANK_SAMPLE = 10;

// -------------------------------------------------------------------------------------- smoothers

/**
 * Wilder's smoothing (RMA / SMMA), SMA-seeded — the smoother behind ATR, RSI, ADX and DMI.
 *
 * Recurrence, over USABLE (finite) samples only:
 *
 *   out[first len-th usable] = mean of the first `len` usable samples   (SMA seed)
 *   out[i]                   = (out[prev] * (len - 1) + vals[i]) / len
 *
 * Warm-up: NaN at every index before the seed is complete. Invalid (non-finite) inputs are skipped —
 * they yield NaN at their own index and do not advance the warm-up counter, so a hole in the series
 * delays the seed rather than corrupting it.
 *
 * Equivalent to Pine's `ta.rma(src, len)` on a hole-free series.
 *
 * @param vals series to smooth (Float64Array or plain array)
 * @param len  smoothing length; sanitized to an integer >= 1
 * @returns    a new Float64Array of the same length, NaN where no value exists
 */
export function wilderRma(vals: Float64Array | number[], len: number): Float64Array {
  const n = vals?.length ?? 0;
  const out = new Float64Array(n);
  if (n === 0) return out;
  out.fill(NaN);

  const L = sanLen(len);
  let seen = 0; // usable samples so far
  let seed = 0; // running sum while seeding
  let prev = NaN;

  for (let i = 0; i < n; i++) {
    const v = vals[i];
    if (!Number.isFinite(v)) continue; // hole: out[i] stays NaN, state untouched
    seen++;
    if (seen < L) {
      seed += v;
      continue; // still warming up — honest NaN
    }
    if (seen === L) {
      seed += v;
      prev = seed / L;
    } else {
      prev = (prev * (L - 1) + v) / L;
    }
    out[i] = prev;
  }
  return out;
}

/**
 * Exponential moving average, SMA-seeded — the same convention the shipped overlay modules use
 * (voltixBands seeds its midline EMA from the running mean of the first `len` valid bars).
 *
 *   k        = 2 / (len + 1)
 *   out[seed] = mean of the first `len` usable samples
 *   out[i]    = vals[i] * k + out[prev] * (1 - k)
 *
 * Warm-up and hole handling are identical to {@link wilderRma}: NaN until the seed completes, and a
 * non-finite input is skipped rather than treated as zero.
 *
 * Equivalent to Pine's `ta.ema(src, len)` on a hole-free series.
 *
 * @param vals series to smooth
 * @param len  EMA length; sanitized to an integer >= 1
 * @returns    a new Float64Array of the same length, NaN where no value exists
 */
export function emaArr(vals: number[] | Float64Array, len: number): Float64Array {
  const n = vals?.length ?? 0;
  const out = new Float64Array(n);
  if (n === 0) return out;
  out.fill(NaN);

  const L = sanLen(len);
  const k = 2 / (L + 1);
  let seen = 0;
  let seed = 0;
  let prev = NaN;

  for (let i = 0; i < n; i++) {
    const v = vals[i];
    if (!Number.isFinite(v)) continue;
    seen++;
    if (seen < L) {
      seed += v;
      continue;
    }
    if (seen === L) {
      seed += v;
      prev = seed / L;
    } else {
      prev = v * k + prev * (1 - k);
    }
    out[i] = prev;
  }
  return out;
}

/**
 * Wilder's RSI, built on {@link wilderRma} so the smoothing convention can never drift between the
 * pane suites and the overlay suites.
 *
 *   delta[i] = closes[i] - closes[i-1]         (NaN when either close is unusable)
 *   gain[i]  = max(delta, 0)      loss[i] = max(-delta, 0)
 *   rs       = rma(gain, len) / rma(loss, len)
 *   rsi      = 100 - 100 / (1 + rs)
 *
 * Degenerate branches (matching the convention already shipped in trendEngine's local RSI, so the
 * two never disagree on a flat series):
 *   - avgLoss === 0 and avgGain  >  0  ->  100  (pure advance)
 *   - avgLoss === 0 and avgGain === 0  ->   50  (dead flat: neutral, not 100)
 *
 * Warm-up: NaN for index 0 and until both averages are seeded (index `len` on a hole-free series).
 *
 * NOTE ON PRICE SANITATION (deliberate): only NON-FINITE inputs are treated as missing here. A 0
 * print is passed through untouched, because this helper is also used on signed series (momentum,
 * net delta) where 0 is a real value. Callers feeding equity closes MUST pre-drop 0-prints to NaN
 * per the CN/HK premarket law (`0 = MISSING, not a print`) — every shipped module already does this
 * in its own `validBar` guard.
 *
 * @param closes source series (typically bar closes, pre-sanitized by the caller)
 * @param len    Wilder length; sanitized to an integer >= 1
 * @returns      a new Float64Array of the same length, values in 0..100, NaN during warm-up
 */
export function rsiArr(closes: number[] | Float64Array, len: number): Float64Array {
  const n = closes?.length ?? 0;
  const out = new Float64Array(n);
  if (n === 0) return out;
  out.fill(NaN);
  const L = sanLen(len);

  const gain = new Float64Array(n).fill(NaN);
  const loss = new Float64Array(n).fill(NaN);
  for (let i = 1; i < n; i++) {
    const c = closes[i];
    const p = closes[i - 1];
    if (!Number.isFinite(c) || !Number.isFinite(p)) continue; // hole: both stay NaN, rma skips it
    const d = c - p;
    gain[i] = d > 0 ? d : 0;
    loss[i] = d < 0 ? -d : 0;
  }

  const avgG = wilderRma(gain, L);
  const avgL = wilderRma(loss, L);
  for (let i = 0; i < n; i++) {
    const g = avgG[i];
    const l = avgL[i];
    if (!Number.isFinite(g) || !Number.isFinite(l)) continue;
    out[i] = l > 0 ? 100 - 100 / (1 + g / l) : g > 0 ? 100 : 50;
  }
  return out;
}

// ------------------------------------------------------------------------------ window statistics

/**
 * Percentile RANK (0..100) of `v` inside the trailing window `vals[max(0, i-window+1) .. i]`.
 *
 * Rank is "share of usable samples at or below v", so 100 means v is the window maximum and 0 means
 * every sample is strictly above it. Non-finite samples are skipped, never counted as zero.
 *
 * HONEST-NEUTRAL CONVENTION (from orderBlocks' pctRank): with fewer than 10 usable samples the rank
 * is meaningless, so the function returns exactly 50 — a neutral grade beats a fabricated extreme.
 * The same 50 is returned when `v` itself is not finite or `i` is out of range.
 *
 * `v` is passed in rather than read from `vals[i]` on purpose: modules frequently rank a DERIVED
 * quantity (e.g. |value|, or a candidate threshold) against the raw series.
 *
 * No lookahead: the window ends at i. O(window).
 */
export function rollingPercentile(
  vals: ArrayLike<number>,
  i: number,
  window: number,
  v: number,
): number {
  const n = vals?.length ?? 0;
  if (n === 0 || !Number.isFinite(v)) return 50;
  const idx = Math.floor(i);
  if (!Number.isFinite(idx) || idx < 0 || idx >= n) return 50;

  const W = sanWin(window);
  const from = idx - W + 1 > 0 ? idx - W + 1 : 0;
  let tot = 0;
  let atOrBelow = 0;
  for (let k = from; k <= idx; k++) {
    const x = vals[k];
    if (!Number.isFinite(x)) continue;
    tot++;
    if (x <= v) atOrBelow++;
  }
  if (tot < MIN_RANK_SAMPLE) return 50;
  return (100 * atOrBelow) / tot;
}

/**
 * Scale `vals[i]` into -100..100 against the rolling maximum |value| of the trailing window
 * `[max(0, i-window+1) .. i]`:
 *
 *   normalizeSigned(vals, i, w) = 100 * vals[i] / max(|vals[k]|) for k in the window
 *
 * This is the pane-suite way of turning an unbounded signed series (net delta, momentum, MACD-style
 * histograms) into a bounded oscillator WITHOUT lookahead: the scale at bar i only ever sees bars
 * <= i, so an already-drawn column never moves when new bars arrive. Note the corollary — the same
 * raw value can normalize differently at different bars, because the local scale changes; that is
 * the intended behavior (relative-to-recent, not relative-to-all-time).
 *
 * Returns 0 when the window maximum is 0 or non-finite, and when `vals[i]` itself is not finite or
 * `i` is out of range. Since |vals[i]| <= windowMax by construction the result is already inside
 * -100..100; it is clamped anyway as a defensive measure against float error.
 *
 * O(window), no allocation.
 */
export function normalizeSigned(vals: Float64Array, i: number, window: number): number {
  const n = vals?.length ?? 0;
  if (n === 0) return 0;
  const idx = Math.floor(i);
  if (!Number.isFinite(idx) || idx < 0 || idx >= n) return 0;
  const v = vals[idx];
  if (!Number.isFinite(v)) return 0;

  const W = sanWin(window);
  const from = idx - W + 1 > 0 ? idx - W + 1 : 0;
  let maxAbs = 0;
  for (let k = from; k <= idx; k++) {
    const x = vals[k];
    if (!Number.isFinite(x)) continue;
    const a = x < 0 ? -x : x;
    if (a > maxAbs) maxAbs = a;
  }
  if (!(maxAbs > 0)) return 0;
  return clamp((v / maxAbs) * 100, -100, 100);
}

// ------------------------------------------------------------------------------------ resampling

export interface ResampledOhlcv {
  /** One aggregated bar per COMPLETE group, in ascending time order. */
  groups: SuiteBar[];
  /**
   * `lastSrc[g]` = index (into the SOURCE bars) of the LAST bar of group g.
   *
   * This is the whole point of the return shape. A group's value is only KNOWN once its final source
   * bar has closed, so a consumer must apply group g from `lastSrc[g]` forward and never earlier —
   * the flowBand HTF convention, enforced by the suite tests ("never lets a group's value appear
   * before that group's last source bar").
   */
  lastSrc: Int32Array;
}

/**
 * Fixed-block OHLCV resample anchored at source index 0.
 *
 * Group g covers source bars `[g*factor, g*factor + factor - 1]`:
 *   open   = first usable open in the group
 *   high   = max usable high
 *   low    = min usable low
 *   close  = last usable close
 *   volume = sum of usable volumes (missing volume contributes 0)
 *   time   = the FIRST source bar's `t` (group open time, matching flowBand)
 *
 * Only COMPLETE groups are emitted (`floor(n / factor)` of them). A trailing partial group is
 * dropped on purpose: emitting it would make an in-progress aggregate that MUTATES as bars arrive,
 * which is exactly the repaint the non-repaint tests forbid. Because the grouping is anchored at
 * index 0 with a fixed factor, appending bars can never move an earlier group's contents — the
 * output is a strict prefix of the output computed on a longer series.
 *
 * `factor <= 1` is the identity case: `groups` is the SAME array reference that was passed in (no
 * copy — callers must not mutate it) and `lastSrc[g] === g`.
 *
 * A group whose bars are all unusable yields NaN OHLC and v = 0; downstream smoothers skip it via
 * their normal hole handling rather than being fed a fabricated zero.
 *
 * O(n). Allocation: one SuiteBar per group plus the index array (the declared outputs).
 */
export function resampleOhlcv(
  bars: SuiteBar[],
  factor: number,
): { groups: SuiteBar[]; lastSrc: Int32Array } {
  const n = bars?.length ?? 0;
  const f = Math.floor(Number(factor));

  if (n === 0) return { groups: [], lastSrc: new Int32Array(0) };

  if (!Number.isFinite(f) || f <= 1) {
    const idn = new Int32Array(n);
    for (let i = 0; i < n; i++) idn[i] = i;
    return { groups: bars, lastSrc: idn };
  }

  const g = Math.floor(n / f);
  const groups: SuiteBar[] = new Array(g);
  const lastSrc = new Int32Array(g);

  for (let k = 0; k < g; k++) {
    const a = k * f;
    const end = a + f - 1;
    let o = NaN;
    let h = NaN;
    let l = NaN;
    let c = NaN;
    let v = 0;
    for (let j = a; j <= end; j++) {
      const b = bars[j];
      if (!b) continue;
      if (!Number.isFinite(o) && Number.isFinite(b.o)) o = b.o;
      if (Number.isFinite(b.h)) h = Number.isFinite(h) ? (b.h > h ? b.h : h) : b.h;
      if (Number.isFinite(b.l)) l = Number.isFinite(l) ? (b.l < l ? b.l : l) : b.l;
      if (Number.isFinite(b.c)) c = b.c;
      if (Number.isFinite(b.v)) v += b.v;
    }
    const first = bars[a];
    groups[k] = { t: first ? first.t : 0, o, h, l, c, v };
    lastSrc[k] = end;
  }
  return { groups, lastSrc };
}
