// Shared pivot engine for the premium suites (Structure Core and friends).
//
// Supersedes `findPivots` in lib/drawings.ts for suite modules: same classic fractal scan, but with
// CONFIRMATION-BAR semantics. A pivot at bar `i` with a right window of `right` bars is only known
// at bar `i + right` — `confirmedAt`. Every consumer must gate on `confirmedAt` so that a level can
// never "fire" on a bar where the pivot was still in the future. That is what makes the structure
// modules non-repainting: replaying the same series bar-by-bar reproduces the identical event list.
//
// Contract: lib/indicator-canvas/types.ts (SuiteBar). Pure, deterministic, no DOM/CSS/clock.

import type { SuiteBar } from "@/lib/indicator-canvas/types";

export interface Pivot {
  i: number;                 // bar index of the extreme
  p: number;                 // pivot price (wick or body extreme, per `source`)
  kind: "high" | "low";
  confirmedAt: number;       // i + right — the bar at which this pivot became knowable
}

const MAX_WING = 200;

function wing(v: number, fallback: number): number {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(MAX_WING, n);
}

/**
 * Classic fractal pivots.
 *
 * Bar `i` is a pivot high when its high (body top when `source === "body"`) is the strict maximum of
 * the window [i-left, i+right]. Ties resolve to the FIRST bar of a plateau: the left window is
 * compared with `>=` (an earlier equal bar disqualifies `i`) and the right window with `>` (a later
 * equal bar does not, but that later bar disqualifies itself against its own left window).
 * Pivot lows mirror this exactly.
 *
 * Only fully-confirmed pivots are returned (`i + right <= bars.length - 1`); there is no lookahead
 * beyond the declared right window — that window IS the confirmation lag.
 *
 * Complexity O(n·(left+right)) worst case with early exits; ~2M comparisons for 10k bars at len 50,
 * comfortably inside the module perf budget.
 */
export function findPivotsHL(
  bars: SuiteBar[],
  left: number,
  right: number,
  source: "wick" | "body" = "wick",
): Pivot[] {
  const n = bars?.length ?? 0;
  const L = wing(left, 5);
  const R = wing(right, 5);
  if (n < L + R + 1) return [];

  const useBody = source === "body";
  const hi = new Float64Array(n);
  const lo = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    if (useBody) {
      const o = b.o, c = b.c;
      hi[i] = o > c ? o : c;
      lo[i] = o < c ? o : c;
    } else {
      hi[i] = b.h;
      lo[i] = b.l;
    }
  }

  const out: Pivot[] = [];
  const last = n - 1 - R;
  for (let i = L; i <= last; i++) {
    const hv = hi[i];
    if (Number.isFinite(hv)) {
      let ok = true;
      for (let j = i - L; j < i; j++) if (hi[j] >= hv) { ok = false; break; }
      if (ok) for (let j = i + 1; j <= i + R; j++) if (hi[j] > hv) { ok = false; break; }
      if (ok) out.push({ i, p: hv, kind: "high", confirmedAt: i + R });
    }
    const lv = lo[i];
    if (Number.isFinite(lv)) {
      let ok = true;
      for (let j = i - L; j < i; j++) if (lo[j] <= lv) { ok = false; break; }
      if (ok) for (let j = i + 1; j <= i + R; j++) if (lo[j] < lv) { ok = false; break; }
      if (ok) out.push({ i, p: lv, kind: "low", confirmedAt: i + R });
    }
  }
  // Sorted by bar index (high before low when one bar is both) — deterministic ordering for consumers.
  return out;
}
