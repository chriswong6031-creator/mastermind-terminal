// Drawing primitives + the swing/pivot detection engine (HANDOFF §7.1–7.2).
// Anchors live in DATA space (bar time + price) so they survive zoom/pan/resize.

export type Pt = { t: string; p: number };
export const DRAW_KINDS = [
  // Lines, channels, and pitchforks (17)
  "trendline",
  "ray",
  "infoline",
  "extendedline",
  "trendangle",
  "hline",
  "horizontalray",
  "vline",
  "crossline",
  "channel",
  "regressiontrend",
  "flattopbottom",
  "disjointchannel",
  "pitchfork",
  "schiffpitchfork",
  "modifiedschiffpitchfork",
  "insidepitchfork",
  // Fibonacci and Gann (15)
  "fib",
  "fibtrend",
  "fibchannel",
  "fibtimezone",
  "fibspeedresistancefan",
  "trendbasedfibtime",
  "fibcircles",
  "fibspiral",
  "fibspeedresistancearcs",
  "fibwedge",
  "pitchfan",
  "gannbox",
  "gannsquarefixed",
  "gannsquare",
  "gannfan",
  // Chart patterns, Elliott waves, and cycles (14)
  "xabcd",
  "cypher",
  "headandshoulders",
  "abcd",
  "trianglepattern",
  "threedrives",
  "elliottimpulse",
  "elliottcorrection",
  "elliotttriangle",
  "elliottdoublecombo",
  "elliotttriplecombo",
  "cycliclines",
  "timecycles",
  "sineline",
  // Forecasting, volume, and ranges (12)
  "longposition",
  "shortposition",
  "forecast",
  "ghostfeed",
  "barpattern",
  "sector",
  "anchoredvwap",
  "fixedrangevolumeprofile",
  "pricerange",
  "daterange",
  "dateandpricerange",
  "measure",
  // Freehand (3). Legacy `path` drawings remain valid polylines; only new
  // creation changes from sampled freehand input to segmented multi-click.
  "brush",
  "highlighter",
  "path",
  // Shapes and curves (9)
  "rect",
  "rotatedrect",
  "ellipse",
  "circle",
  "triangle",
  "polyline",
  "arc",
  "curve",
  "doublecurve",
  // Arrows and stylized paths (17)
  "arrowmarker",
  "arrow",
  "arrowmarkleft",
  "arrowmarkright",
  "arrowmarktop",
  "arrowmarkbottom",
  "flagmark",
  "momentum",
  "flow",
  "emphasis",
  "whisper",
  "subtle",
  "divergence",
  "journey",
  "fork",
  "threepaths",
  "burj",
  // Text, notes, labels, and content (10)
  "text",
  "anchoredtext",
  "note",
  "anchorednote",
  "callout",
  "pricelabel",
  "pricenote",
  "signpost",
  "comment",
  "image",
  // Emoji and icons (2)
  "emoji",
  "icon",
] as const;
export type DrawKind = (typeof DRAW_KINDS)[number];
export type Dash = "solid" | "dashed" | "dotted";
export type DrawingSource = "user" | "detector" | "ai";
export type DrawingExtend = "none" | "left" | "right" | "both";
export const DRAWING_SCHEMA_VERSION = 1;
export const MAX_DRAWINGS_PER_SYMBOL = 500;
// A maximally dense 500 x 64-anchor collection is about 1.5 MB after
// normalization. Keep bounded headroom for styles/text while rejecting abuse.
export const MAX_DRAWING_PAYLOAD_BYTES = 2_000_000;
export type Drawing = {
  id: string;
  kind: DrawKind;
  points: Pt[];
  schemaVersion?: number;
  source?: DrawingSource;
  locked?: boolean;
  hidden?: boolean;
  z?: number;
  color?: string;
  fillColor?: string;
  fillOpacity?: number;
  opacity?: number;
  extend?: DrawingExtend;
  text?: string;
  width?: number;          // line thickness (px)
  dash?: Dash;             // line style
  fontSize?: number;       // text size (px) — for text drawings
  auto?: boolean;          // legacy compatibility: produced by detection/AI
  meta?: Record<string, unknown>;
};
export type NormalizedDrawing = Drawing & {
  schemaVersion: typeof DRAWING_SCHEMA_VERSION;
  source: DrawingSource;
  locked: boolean;
  hidden: boolean;
  z: number;
  opacity: number;
  extend: DrawingExtend;
};
export type Bar = { time: string; o: number; h: number; l: number; c: number; v: number };

export const uid = () =>
  (globalThis.crypto?.randomUUID?.() ?? "d_" + Math.random().toString(36).slice(2, 11));

const DRAW_KIND_SET = new Set<string>(DRAW_KINDS);
const DASH_SET = new Set<Dash>(["solid", "dashed", "dotted"]);
const SOURCE_SET = new Set<DrawingSource>(["user", "detector", "ai"]);
const EXTEND_SET = new Set<DrawingExtend>(["none", "left", "right", "both"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function boundedNumber(value: unknown, min: number, max: number): number | undefined {
  const number = finiteNumber(value);
  return number === undefined ? undefined : Math.min(max, Math.max(min, number));
}

function normalizePoint(value: unknown): Pt | null {
  if (!isRecord(value)) return null;
  const price = finiteNumber(value.p);
  const time = value.t;
  if (price === undefined || (typeof time !== "string" && typeof time !== "number")) return null;
  const normalizedTime = String(time).trim();
  return normalizedTime ? { t: normalizedTime, p: price } : null;
}

function inferredSource(value: Record<string, unknown>, id: string, meta?: Record<string, unknown>): DrawingSource {
  if (typeof value.source === "string" && SOURCE_SET.has(value.source as DrawingSource)) {
    return value.source as DrawingSource;
  }
  if (value.by === "ai" || meta?.by === "ai" || id.startsWith("ai_")) return "ai";
  return value.auto === true ? "detector" : "user";
}

function inferredExtend(kind: DrawKind): DrawingExtend {
  if (kind === "ray" || kind === "horizontalray") return "right";
  if (kind === "extendedline") return "both";
  return "none";
}

/**
 * Validate and migrate an untrusted or legacy drawing into the current durable
 * shape. The legacy `auto` flag is retained for detector/AI drawings so older
 * consumers continue to identify generated objects correctly.
 */
export function normalizeDrawing(value: unknown, fallbackZ = 0): NormalizedDrawing | null {
  if (!isRecord(value) || typeof value.kind !== "string" || !DRAW_KIND_SET.has(value.kind)) return null;

  const points = Array.isArray(value.points)
    ? value.points.map(normalizePoint).filter((point): point is Pt => point !== null)
    : [];
  if (!points.length) return null;

  const kind = value.kind as DrawKind;
  const id = typeof value.id === "string" && value.id.trim() ? value.id.trim() : uid();
  const meta = isRecord(value.meta) ? { ...value.meta } : undefined;
  const source = inferredSource(value, id, meta);
  const extend = typeof value.extend === "string" && EXTEND_SET.has(value.extend as DrawingExtend)
    ? value.extend as DrawingExtend
    : inferredExtend(kind);
  const z = finiteNumber(value.z) ?? finiteNumber(fallbackZ) ?? 0;

  const normalized: NormalizedDrawing = {
    id,
    kind,
    points,
    schemaVersion: DRAWING_SCHEMA_VERSION,
    source,
    locked: value.locked === true,
    hidden: value.hidden === true,
    z: Math.trunc(z),
    opacity: boundedNumber(value.opacity, 0, 1) ?? 1,
    extend,
  };

  if (typeof value.color === "string" && value.color.trim()) normalized.color = value.color.trim();
  if (typeof value.fillColor === "string" && value.fillColor.trim()) normalized.fillColor = value.fillColor.trim();
  const fillOpacity = boundedNumber(value.fillOpacity, 0, 1);
  if (fillOpacity !== undefined) normalized.fillOpacity = fillOpacity;
  if (typeof value.text === "string") normalized.text = value.text;
  const width = boundedNumber(value.width, 0.5, 20);
  if (width !== undefined) normalized.width = width;
  if (typeof value.dash === "string" && DASH_SET.has(value.dash as Dash)) normalized.dash = value.dash as Dash;
  const fontSize = boundedNumber(value.fontSize, 8, 96);
  if (fontSize !== undefined) normalized.fontSize = fontSize;
  if (source !== "user") normalized.auto = true;
  if (meta) normalized.meta = meta;

  return normalized;
}

/** Normalize a persisted collection while preserving its visual/input order. */
export function normalizeDrawings(value: unknown): NormalizedDrawing[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((drawing, index) => normalizeDrawing(drawing, index))
    .filter((drawing): drawing is NormalizedDrawing => drawing !== null);
}

/**
 * Normalize a trusted interactive update without deep-cloning an entire chart.
 * Chart editing is immutable: untouched drawing objects retain identity, and a
 * style-only edit retains its (potentially 64-point) anchor array. This makes
 * whole-document undo snapshots cheap structural views instead of 100 deep
 * copies of as many as 32,000 points.
 */
export function normalizeDrawingUpdate(
  value: unknown,
  previous: readonly Drawing[],
  limit = MAX_DRAWINGS_PER_SYMBOL,
): NormalizedDrawing[] {
  if (!Array.isArray(value)) return [];
  // Never turn object 501 into an implicit deletion of object 1. The caller
  // surfaces the cap and preserves its previous collection.
  if (value.length > limit) return previous as NormalizedDrawing[];
  const priorById = new Map(previous.map((drawing) => [drawing.id, drawing]));
  return value
    .map((candidate, index) => {
      const candidateId = isRecord(candidate) && typeof candidate.id === "string"
        ? candidate.id.trim()
        : "";
      const prior = candidateId ? priorById.get(candidateId) : undefined;
      if (prior === candidate) return prior as NormalizedDrawing;

      const normalized = normalizeDrawing(candidate, index);
      if (!normalized) return null;
      if (prior && isRecord(candidate) && candidate.points === prior.points) {
        normalized.points = prior.points;
      }
      if (prior && isRecord(candidate) && candidate.meta === prior.meta) {
        normalized.meta = prior.meta;
      }
      return normalized;
    })
    .filter((drawing): drawing is NormalizedDrawing => drawing !== null);
}

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
