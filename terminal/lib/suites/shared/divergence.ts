// Shared 4-class divergence detector for the PANE suites (Momentum Matrix, Volume Engine, Flow
// Oscillator all reuse this — one detector so the three panes can never disagree about what a
// divergence is).
//
// Contract: lib/indicator-canvas/types.ts (SuiteBar). Doctrine: lib/indicator-canvas/README.md.
// Pure and deterministic: no DOM, no CSS, no colors, no wall clock, no randomness, no module-level
// mutable state.
//
// ─── What a divergence is here ────────────────────────────────────────────────────────────────
//
// We pivot the OSCILLATOR (not price), then compare each pair of CONSECUTIVE same-kind oscillator
// pivots and read price at those same two bars:
//
//   regular bull   osc lows    price lower-low   (pB < pA)   while osc higher-low  (oB > oA)
//   regular bear   osc highs   price higher-high (pB > pA)   while osc lower-high  (oB < oA)
//   hidden  bull   osc lows    price higher-low  (pB > pA)   while osc lower-low   (oB < oA)
//   hidden  bear   osc highs   price lower-high  (pB < pA)   while osc higher-high (oB > oA)
//
// Price is read at the pivot bars' LOWS for the low-pivot classes (bull, hiddenBull) and at their
// HIGHS for the high-pivot classes (bear, hiddenBear) — the extreme the swing actually printed.
// All four comparisons are STRICT: an exactly-equal pair is not a divergence.
//
// ─── Non-repaint ──────────────────────────────────────────────────────────────────────────────
//
// A fractal pivot at bar i with wing w is only knowable at bar i + w. `confirmedAt` on the event is
// the SECOND pivot's confirmation bar, and consumers must gate every draw/event on it. Nothing in
// the detector looks past `iB + wing`, so replaying the series bar by bar reproduces the identical
// list and appending bars never edits an earlier event.
//
// ─── Why a local fractal instead of findPivotsHL ──────────────────────────────────────────────
//
// The brief allowed either mapping the oscillator into synthetic `SuiteBar`s (h = l = osc) and
// calling `findPivotsHL`, or writing a small local fractal. We do the latter, for three reasons:
//
//   1. NaN semantics. `findPivotsHL` only checks that the CANDIDATE value is finite; a NaN neighbour
//      compares false in every `>=` / `>` test and therefore fails to disqualify it, so an
//      oscillator's warm-up region would sprout spurious pivots. The brief requires NaN values to
//      break pivot eligibility, which needs an explicit window scan.
//   2. Allocation. The synthetic route builds n throwaway bar objects per call, on a path three
//      suites hit on every recompute.
//   3. Clarity. One symmetric wing over a flat Float64Array is ~20 lines and reads as what it is.
//
// The TIE RULE is copied from `findPivotsHL` verbatim so the two engines stay consistent: the left
// window disqualifies on `>=` (an earlier equal bar wins the plateau) and the right window on `>`,
// so the FIRST bar of a flat plateau is the pivot. Lows mirror it.

import type { SuiteBar } from "@/lib/indicator-canvas/types";

// ------------------------------------------------------------------------------------ public types

export interface DivergenceEvent {
  /** Which of the four classes fired. */
  kind: "bull" | "bear" | "hiddenBull" | "hiddenBear";
  /** Price at the FIRST pivot (bar low for bull/hiddenBull, bar high for bear/hiddenBear). */
  priceA: number;
  /** Price at the SECOND pivot, same extreme as `priceA`. */
  priceB: number;
  /** Oscillator value at the first pivot. */
  oscA: number;
  /** Oscillator value at the second pivot. */
  oscB: number;
  /** Bar index of the first pivot. */
  iA: number;
  /** Bar index of the second pivot. */
  iB: number;
  /** `iB + wing` — the bar at which this divergence became knowable. Gate all output on it. */
  confirmedAt: number;
}

export interface DivergenceOpts {
  /**
   * Trailing bars to scan, counted back from the end of `bars`. `<= 0` or omitted = the ENTIRE
   * series (the default, and the prefix-stable choice: a bounded lookback is a moving window, so
   * old events drop off the front as bars append). Use it only as a perf lever; when set it is
   * widened internally so a pair straddling the boundary can still form.
   */
  lookback?: number;
  /** Fractal wing applied to the oscillator, both sides. Default 5, clamped 1..50. */
  wing?: number;
  /** Maximum distance in bars between the two pivots. Default 60, clamped 2..1000. */
  maxSpan?: number;
  /** Emit the hidden (continuation) classes as well. Default true. */
  hidden?: boolean;
}

// -------------------------------------------------------------------------------------- internals

const DEF_WING = 5;
const DEF_MAX_SPAN = 60;
const MAX_WING = 50;
const MAX_SPAN_CAP = 1000;

interface OscPivot {
  i: number;
  v: number; // oscillator value at the pivot
  high: boolean; // true = oscillator swing high, false = swing low
  confirmedAt: number; // i + wing
}

function intOpt(v: unknown, d: number, lo: number, hi: number): number {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return d;
  return n < lo ? lo : n > hi ? hi : n;
}

/**
 * Price at a pivot bar: the LOW for oscillator-low pivots, the HIGH for oscillator-high pivots.
 * Returns NaN when the bar is missing or the extreme is unusable — a 0 or non-finite price is
 * MISSING, not a print (CN/HK premarket pushes OHLC=0; see the shipped modules' `validBar`).
 */
function pivotPrice(bars: SuiteBar[], i: number, high: boolean): number {
  const b = bars[i];
  if (!b) return NaN;
  const p = high ? b.h : b.l;
  return Number.isFinite(p) && p > 0 ? p : NaN;
}

/**
 * Symmetric fractal pivots over a plain numeric series.
 *
 * Bar i is an oscillator swing HIGH when `osc[i]` and its whole `[i-wing, i+wing]` window are finite,
 * no earlier bar in the window is `>=` it, and no later bar is `>` it. Swing lows mirror this.
 * A single NaN anywhere in the window disqualifies the candidate outright, so the warm-up region of
 * an oscillator can never produce pivots.
 *
 * Only fully-confirmed pivots are returned (`i + wing <= n - 1`): the right wing IS the confirmation
 * lag, and there is no lookahead beyond it. Output is sorted by bar index, highs before lows when a
 * single bar somehow qualifies as both (only possible on a degenerate flat window). O(n·wing).
 *
 * @param scanFrom first index eligible to be a pivot (used by the `lookback` option)
 */
function oscPivots(osc: Float64Array, wing: number, scanFrom: number): OscPivot[] {
  const n = osc.length;
  const out: OscPivot[] = [];
  if (n < wing * 2 + 1) return out;

  const start = Math.max(wing, scanFrom);
  const last = n - 1 - wing;
  for (let i = start; i <= last; i++) {
    const v = osc[i];
    if (!Number.isFinite(v)) continue;

    // The whole window must be usable — one NaN neighbour kills the candidate (both kinds).
    let windowOk = true;
    for (let j = i - wing; j <= i + wing; j++) {
      if (!Number.isFinite(osc[j])) {
        windowOk = false;
        break;
      }
    }
    if (!windowOk) continue;

    let isHigh = true;
    for (let j = i - wing; j < i; j++) {
      if (osc[j] >= v) {
        isHigh = false;
        break;
      }
    }
    if (isHigh) {
      for (let j = i + 1; j <= i + wing; j++) {
        if (osc[j] > v) {
          isHigh = false;
          break;
        }
      }
    }
    if (isHigh) out.push({ i, v, high: true, confirmedAt: i + wing });

    let isLow = true;
    for (let j = i - wing; j < i; j++) {
      if (osc[j] <= v) {
        isLow = false;
        break;
      }
    }
    if (isLow) {
      for (let j = i + 1; j <= i + wing; j++) {
        if (osc[j] < v) {
          isLow = false;
          break;
        }
      }
    }
    if (isLow) out.push({ i, v, high: false, confirmedAt: i + wing });
  }
  return out;
}

// ------------------------------------------------------------------------------------ public API

/**
 * The shared 4-class divergence detector.
 *
 * Method (fully deterministic, no lookahead beyond the fractal wing):
 *   1. Fractal-pivot the OSCILLATOR with a symmetric `wing` (see {@link oscPivots}); NaN oscillator
 *      values break pivot eligibility, so warm-up regions produce nothing.
 *   2. Split the pivots into highs and lows, preserving bar order.
 *   3. Walk each list and compare CONSECUTIVE same-kind pivots (A = earlier, B = later) whose
 *      separation is `0 < iB - iA <= maxSpan`, reading price at the pivot bars' lows (low pivots) or
 *      highs (high pivots). Pairs with an unusable price at either end are skipped.
 *   4. Emit the class implied by the sign pattern. Regular and hidden are mutually exclusive on the
 *      same pair (they require opposite price directions), so a pair yields at most one event.
 *
 * `confirmedAt` is the SECOND pivot's confirmation bar — always gate drawing and event emission on
 * it, otherwise the module repaints.
 *
 * Output is sorted by `confirmedAt`, then `iB`, then `iA`, then class name — a total order, so two
 * runs on identical input always produce byte-identical lists.
 *
 * @param bars source bars (price side of the comparison)
 * @param osc  oscillator series, index-aligned with `bars` (NaN during warm-up is expected)
 * @param opts see {@link DivergenceOpts}
 */
export function findDivergences(
  bars: SuiteBar[],
  osc: Float64Array,
  opts: { lookback?: number; wing?: number; maxSpan?: number; hidden?: boolean } = {},
): DivergenceEvent[] {
  const n = Math.min(bars?.length ?? 0, osc?.length ?? 0);
  if (n < 3) return [];

  const wing = intOpt(opts.wing, DEF_WING, 1, MAX_WING);
  const maxSpan = intOpt(opts.maxSpan, DEF_MAX_SPAN, 2, MAX_SPAN_CAP);
  const wantHidden = typeof opts.hidden === "boolean" ? opts.hidden : true;

  // lookback <= 0 (or omitted) = whole series. When set, widen by maxSpan + 2*wing so a pair whose
  // first pivot sits just outside the requested window still forms.
  const rawLb = Math.floor(Number(opts.lookback));
  let scanFrom = 0;
  if (Number.isFinite(rawLb) && rawLb > 0) {
    scanFrom = Math.max(0, n - (rawLb + maxSpan + wing * 2));
  }

  const view = osc.length === n ? osc : osc.subarray(0, n);
  const pivots = oscPivots(view, wing, scanFrom);
  if (pivots.length < 2) return [];

  const highs: OscPivot[] = [];
  const lows: OscPivot[] = [];
  for (const p of pivots) (p.high ? highs : lows).push(p);

  const out: DivergenceEvent[] = [];

  const push = (
    kind: DivergenceEvent["kind"],
    a: OscPivot,
    b: OscPivot,
    pA: number,
    pB: number,
  ): void => {
    out.push({
      kind,
      priceA: pA,
      priceB: pB,
      oscA: a.v,
      oscB: b.v,
      iA: a.i,
      iB: b.i,
      confirmedAt: b.confirmedAt,
    });
  };

  // ---- low pivots -> bull (reversal) and hiddenBull (continuation) ----------------------------
  for (let k = 1; k < lows.length; k++) {
    const a = lows[k - 1];
    const b = lows[k];
    const span = b.i - a.i;
    if (span <= 0 || span > maxSpan) continue;
    const pA = pivotPrice(bars, a.i, false);
    const pB = pivotPrice(bars, b.i, false);
    if (!Number.isFinite(pA) || !Number.isFinite(pB)) continue;

    if (pB < pA && b.v > a.v) push("bull", a, b, pA, pB);
    else if (wantHidden && pB > pA && b.v < a.v) push("hiddenBull", a, b, pA, pB);
  }

  // ---- high pivots -> bear (reversal) and hiddenBear (continuation) ---------------------------
  for (let k = 1; k < highs.length; k++) {
    const a = highs[k - 1];
    const b = highs[k];
    const span = b.i - a.i;
    if (span <= 0 || span > maxSpan) continue;
    const pA = pivotPrice(bars, a.i, true);
    const pB = pivotPrice(bars, b.i, true);
    if (!Number.isFinite(pA) || !Number.isFinite(pB)) continue;

    if (pB > pA && b.v < a.v) push("bear", a, b, pA, pB);
    else if (wantHidden && pB < pA && b.v > a.v) push("hiddenBear", a, b, pA, pB);
  }

  out.sort(
    (x, y) =>
      x.confirmedAt - y.confirmedAt ||
      x.iB - y.iB ||
      x.iA - y.iA ||
      (x.kind < y.kind ? -1 : x.kind > y.kind ? 1 : 0),
  );
  return out;
}

/**
 * Score a divergence 0..100 — how much of the local move the disagreement actually accounts for.
 *
 * FORMULA (deterministic, uses only the event and bars <= iB, so it never repaints):
 *
 *   priceGap   = |priceB - priceA|
 *   priceRange = max(high) - min(low) over the usable bars in [iA .. iB]   (the swing's own range)
 *   priceScore = clamp(priceGap / priceRange, 0, 1)                        (0 when priceRange <= 0)
 *
 *   oscGap     = |oscB - oscA|
 *   oscScale   = max(|oscA|, |oscB|)                                       (scale-free reference)
 *   oscScore   = clamp(oscGap / oscScale, 0, 1)                            (0 when oscScale <= 0)
 *
 *   strength   = round(100 * (0.5 * priceScore + 0.5 * oscScore))
 *
 * Both legs are normalized into 0..1 before blending, so an RSI pane (0..100) and a normalized net-
 * delta pane (-100..100) produce comparable scores. `priceGap` is by construction a subset of
 * `priceRange`, which makes `priceScore` a genuine "fraction of the swing" reading: a wide price
 * separation across a tight range scores high, a hairline separation across a wild range scores low.
 *
 * DEVIATION FROM THE BRIEF (deliberate, documented): the brief asked for both gaps to be normalized
 * by "their trailing ranges". The event carries no oscillator series, and `bars` cannot supply one,
 * so the oscillator leg is normalized by the larger pivot magnitude instead of a trailing range.
 * That keeps the function's signature honest (event + bars is all it needs), stays scale-free, and
 * avoids the alternative of re-deriving the oscillator here. The price leg does use the true
 * trailing range spanned by the divergence.
 *
 * Returns 0 for an event whose indices fall outside `bars` or whose numbers are unusable.
 */
export function divergenceStrength(e: DivergenceEvent, bars: SuiteBar[]): number {
  if (!e || !bars) return 0;
  const n = bars.length;
  const iA = Math.floor(e.iA);
  const iB = Math.floor(e.iB);
  if (!(iA >= 0 && iB > iA && iB < n)) return 0;
  if (!Number.isFinite(e.priceA) || !Number.isFinite(e.priceB)) return 0;
  if (!Number.isFinite(e.oscA) || !Number.isFinite(e.oscB)) return 0;

  // price leg — gap as a fraction of the range the divergence spans
  let hi = NaN;
  let lo = NaN;
  for (let i = iA; i <= iB; i++) {
    const b = bars[i];
    if (!b) continue;
    if (Number.isFinite(b.h) && b.h > 0) hi = Number.isFinite(hi) ? (b.h > hi ? b.h : hi) : b.h;
    if (Number.isFinite(b.l) && b.l > 0) lo = Number.isFinite(lo) ? (b.l < lo ? b.l : lo) : b.l;
  }
  const priceRange = Number.isFinite(hi) && Number.isFinite(lo) ? hi - lo : 0;
  const priceGap = Math.abs(e.priceB - e.priceA);
  const priceScore = priceRange > 0 ? Math.min(1, priceGap / priceRange) : 0;

  // oscillator leg — gap as a fraction of the larger pivot magnitude
  const oscScale = Math.max(Math.abs(e.oscA), Math.abs(e.oscB));
  const oscGap = Math.abs(e.oscB - e.oscA);
  const oscScore = oscScale > 0 ? Math.min(1, oscGap / oscScale) : 0;

  const blend = 0.5 * priceScore + 0.5 * oscScore;
  const v = Math.round(blend * 100);
  return v < 0 ? 0 : v > 100 ? 100 : v;
}
