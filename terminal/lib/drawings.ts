// Drawing primitives + the swing/pivot detection engine (HANDOFF §7.1–7.2).
// Anchors live in DATA space (bar time + price) so they survive zoom/pan/resize.

export type Pt = { t: string; p: number };
export type DrawKind = "trendline" | "ray" | "hline" | "rect" | "fib" | "text" | "measure";
export type Drawing = {
  id: string;
  kind: DrawKind;
  points: Pt[];
  color?: string;
  text?: string;
  auto?: boolean;          // produced by detection (vs hand-drawn)
  meta?: Record<string, unknown>;
};
export type Bar = { time: string; o: number; h: number; l: number; c: number; v: number };

export const uid = () =>
  (globalThis.crypto?.randomUUID?.() ?? "d_" + Math.random().toString(36).slice(2, 11));

export const FIB = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

// ---- pivots (fractal highs/lows) ----
export function findPivots(bars: Bar[], k = 5): { highs: number[]; lows: number[] } {
  const highs: number[] = [], lows: number[] = [];
  for (let i = k; i < bars.length - k; i++) {
    let ph = true, pl = true;
    for (let j = i - k; j <= i + k; j++) {
      if (j === i) continue;
      if (bars[j].h >= bars[i].h) ph = false;
      if (bars[j].l <= bars[i].l) pl = false;
    }
    if (ph) highs.push(i);
    if (pl) lows.push(i);
  }
  return { highs, lows };
}

// ---- auto trendlines: connect the two most recent significant pivots on each side ----
export function autoTrendlines(bars: Bar[]): Drawing[] {
  if (bars.length < 30) return [];
  const { highs, lows } = findPivots(bars, Math.max(3, Math.round(bars.length / 40)));
  const out: Drawing[] = [];
  const line = (idx: number[], pick: (b: Bar) => number, color: string): Drawing | null => {
    if (idx.length < 2) return null;
    const a = idx[idx.length - 2], b = idx[idx.length - 1];
    return { id: uid(), kind: "trendline", auto: true, color,
      points: [{ t: bars[a].time, p: pick(bars[a]) }, { t: bars[b].time, p: pick(bars[b]) }],
      meta: { label: color === "var(--up)" ? "support" : "resistance" } };
  };
  const sup = line(lows, (b) => b.l, "var(--up)");
  const res = line(highs, (b) => b.h, "var(--down)");
  if (sup) out.push(sup);
  if (res) out.push(res);
  return out;
}

// ---- auto fibonacci: span the dominant recent swing (lowest low ↔ highest high) ----
export function autoFib(bars: Bar[], lookback = 130): Drawing | null {
  if (bars.length < 20) return null;
  const seg = bars.slice(-lookback);
  let hi = -Infinity, lo = Infinity, hiI = 0, loI = 0;
  seg.forEach((b, i) => { if (b.h > hi) { hi = b.h; hiI = i; } if (b.l < lo) { lo = b.l; loI = i; } });
  // order the two anchors by time so the retracement reads with the trend
  const aI = Math.min(hiI, loI), bI = Math.max(hiI, loI);
  return { id: uid(), kind: "fib", auto: true,
    points: [{ t: seg[aI].time, p: seg[aI].h >= seg[aI].l ? (aI === hiI ? hi : lo) : 0 },
             { t: seg[bI].time, p: bI === hiI ? hi : lo }],
    meta: { hi, lo } };
}

// ---- S/R strength: cluster pivot prices into bands, strength = touch count ----
export function srLevels(bars: Bar[], tf = "D", maxLevels = 6): { price: number; strength: number; tf: string }[] {
  const { highs, lows } = findPivots(bars, Math.max(3, Math.round(bars.length / 50)));
  const prices = [...highs.map((i) => bars[i].h), ...lows.map((i) => bars[i].l)];
  if (!prices.length) return [];
  const span = Math.max(...prices) - Math.min(...prices) || 1;
  const tol = span * 0.012;                          // ~1.2% banding
  const clusters: { sum: number; n: number }[] = [];
  prices.sort((a, b) => a - b).forEach((p) => {
    const c = clusters[clusters.length - 1];
    if (c && p - c.sum / c.n <= tol) { c.sum += p; c.n++; }
    else clusters.push({ sum: p, n: 1 });
  });
  const maxN = Math.max(...clusters.map((c) => c.n));
  return clusters
    .map((c) => ({ price: +(c.sum / c.n).toFixed(2), strength: c.n / maxN, tf }))
    .sort((a, b) => b.strength - a.strength)
    .slice(0, maxLevels);
}

// strength → drawing (hline whose color encodes side vs last close, opacity ~ strength)
export function srDrawings(bars: Bar[]): Drawing[] {
  const last = bars[bars.length - 1]?.c ?? 0;
  return srLevels(bars).map((l) => ({
    id: uid(), kind: "hline" as const, auto: true,
    color: l.price >= last ? "var(--down)" : "var(--up)",
    points: [{ t: bars[bars.length - 1].time, p: l.price }],
    meta: { strength: l.strength, label: `S/R ${Math.round(l.strength * 100)}%`, tf: l.tf },
  }));
}

// ---- MTFA: S/R from the daily series + a coarse (≈weekly) resample, tagged by timeframe ----
function resample(bars: Bar[], step: number): Bar[] {
  const out: Bar[] = [];
  for (let i = 0; i < bars.length; i += step) {
    const chunk = bars.slice(i, i + step);
    if (!chunk.length) continue;
    out.push({ time: chunk[chunk.length - 1].time, o: chunk[0].o,
      h: Math.max(...chunk.map((b) => b.h)), l: Math.min(...chunk.map((b) => b.l)),
      c: chunk[chunk.length - 1].c, v: chunk.reduce((s, b) => s + b.v, 0) });
  }
  return out;
}
export function mtfaDrawings(bars: Bar[]): Drawing[] {
  const last = bars[bars.length - 1]?.c ?? 0;
  const daily = srLevels(bars, "D", 4);
  const weekly = srLevels(resample(bars, 5), "W", 3);
  const merged = [...weekly, ...daily];                // weekly first → higher-TF priority on dedup
  const seen: number[] = [];
  const out: Drawing[] = [];
  for (const l of merged) {
    if (seen.some((p) => Math.abs(p - l.price) / (last || 1) < 0.008)) continue;
    seen.push(l.price);
    out.push({ id: uid(), kind: "hline", auto: true,
      color: l.tf === "W" ? "var(--signal)" : (l.price >= last ? "var(--down)" : "var(--up)"),
      points: [{ t: bars[bars.length - 1].time, p: l.price }],
      meta: { strength: l.strength, tf: l.tf, label: `${l.tf} · ${Math.round(l.strength * 100)}%` } });
  }
  return out;
}
