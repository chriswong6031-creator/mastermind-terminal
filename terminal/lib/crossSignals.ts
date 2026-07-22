// Pure crossover detectors shared by ChartPanel's Pine-port signal visuals
// (TH_RSIMACD+ crossover dots · CM_Stochastic crossover highlight bars).
//
// A cross at index i requires BOTH series to have non-null values at i AND i-1
// (a null gap on either side never emits a signal). Equal-then-strict counts as
// a cross: a[i-1] <= b[i-1] && a[i] > b[i] is a crossUp (mirrors Pine ta.crossover,
// which treats a touch-then-break as the crossing bar).

type Num = number | null | undefined;

const ok = (x: Num): x is number => x != null && !Number.isNaN(x);

// True at each index where series `a` crosses ABOVE series `b`
// (prev a<=b, now a>b). Index 0 is always false (no previous bar).
export function crossUps(a: Num[], b: Num[]): boolean[] {
  const n = Math.min(a.length, b.length);
  const out = new Array<boolean>(a.length).fill(false);
  for (let i = 1; i < n; i++) {
    const a0 = a[i - 1], b0 = b[i - 1], a1 = a[i], b1 = b[i];
    if (!ok(a0) || !ok(b0) || !ok(a1) || !ok(b1)) continue;
    if (a0 <= b0 && a1 > b1) out[i] = true;
  }
  return out;
}

// True at each index where series `a` crosses BELOW series `b`
// (prev a>=b, now a<b). Index 0 is always false.
export function crossDowns(a: Num[], b: Num[]): boolean[] {
  const n = Math.min(a.length, b.length);
  const out = new Array<boolean>(a.length).fill(false);
  for (let i = 1; i < n; i++) {
    const a0 = a[i - 1], b0 = b[i - 1], a1 = a[i], b1 = b[i];
    if (!ok(a0) || !ok(b0) || !ok(a1) || !ok(b1)) continue;
    if (a0 >= b0 && a1 < b1) out[i] = true;
  }
  return out;
}

// Threshold-gated crossUp: a crosses above b AND a's value at the cross is
// strictly below `below` (the CM_Stochastic bullish case: %K crosses above %D
// while %K < lowLine).
export function crossUpsBelow(a: Num[], b: Num[], below: number): boolean[] {
  const up = crossUps(a, b);
  return up.map((hit, i) => hit && ok(a[i]) && (a[i] as number) < below);
}

// Threshold-gated crossDown: a crosses below b AND a's value at the cross is
// strictly above `above` (the CM_Stochastic bearish case: %K crosses below %D
// while %K > upLine).
export function crossDownsAbove(a: Num[], b: Num[], above: number): boolean[] {
  const down = crossDowns(a, b);
  return down.map((hit, i) => hit && ok(a[i]) && (a[i] as number) > above);
}
