// Nearest-bar snapping for signal→bar resolution (ChartPanel resolveSigMarks /
// resolveSideChannels / chart-jump). Bar times are parsed to epoch ms ONCE per bar set;
// each lookup is then a binary search. The old per-signal linear scan allocated two Date
// objects per (signal, bar) pair — ~86ms per resolve on a full-history weekly slice,
// re-paid on every replay tick.
//
// Contract (matches the old near() exactly):
//   • `times` must be ascending calendar dates ("YYYY-MM-DD"). Intraday bar sets carry
//     numeric epoch-second times, which parse NaN → every lookup misses (as before);
//   • a signal snaps only within SNAP_TOLERANCE_MS (~10.4 days: over any weekend/holiday
//     run, under a fortnight resample bucket);
//   • on an exact distance tie between two bars the EARLIER bar wins (the old scan's
//     strict `<` kept the first minimum).

const SNAP_TOLERANCE_MS = 9e8;

/** Build a lookup: ISO date → index of the nearest bar in `times`, or -1 when nothing
 *  is within tolerance (or the input isn't a calendar-dated bar set). */
export function makeNearestBarIndex(times: ReadonlyArray<string | number>): (iso: string) => number {
  const n = times.length;
  const ms = new Array<number>(n);
  for (let i = 0; i < n; i++) ms[i] = Date.parse(String(times[i]) + "T00:00:00Z");
  const usable = n > 0 && Number.isFinite(ms[0]) && Number.isFinite(ms[n - 1]);
  return (iso: string): number => {
    if (!usable) return -1;
    const x = Date.parse(iso + "T00:00:00Z");
    if (!Number.isFinite(x)) return -1;
    // lower bound: first index with ms[lo] >= x (clamped to the last bar)
    let lo = 0, hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (ms[mid] < x) lo = mid + 1;
      else hi = mid;
    }
    // nearest is lo or its left neighbor; `<=` keeps the earlier bar on a tie
    let best = lo;
    if (lo > 0 && Math.abs(ms[lo - 1] - x) <= Math.abs(ms[lo] - x)) best = lo - 1;
    return Math.abs(ms[best] - x) < SNAP_TOLERANCE_MS ? best : -1;
  };
}
