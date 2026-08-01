/**
 * aggTrend.ts — Market Structure Core, Wave 2. History and relationships.
 *
 * Pure arithmetic over `options_hub.aggtrend/v1` (f-param `agg:{ROOT}`), the
 * whole-book dealer exposure series the macro estate publishes one row per session.
 *
 * Program of record: docs/VOLLAND_PARITY_PLAN_2026-08-01.md §5 (W2).
 *
 * ─── WHY THIS EXISTS ────────────────────────────────────────────────────────────────
 * A single session's exposure is unreadable on its own. "Net gamma −$8.1bn" means
 * nothing until you know the book has run between −$41bn and +$47bn since 2017 and
 * that today sits at the 12th percentile. Volland ships this idea as "Aggregate Greek
 * Trend" over roughly five months of history; our store reaches 2017 for SPY and 2012
 * for QQQ, so the same chart spans Volmageddon, 2020 and 2022 rather than one regime.
 *
 * ─── UNITS ──────────────────────────────────────────────────────────────────────────
 * Series values are **$bn** of dealer delta (the payload divides by 1e9), per the unit
 * each greek carries — the payload's own `units` map is authoritative and is rendered
 * verbatim rather than restated here:
 *   gamma per +1% spot · vanna/vega per +1 vol point · charm per +1 day · delta level
 * `s` is a price and `iv` a fraction (0.16 = 16 vol), NOT points.
 *
 * ─── HONESTY (masterplan §4.1 tiering) ──────────────────────────────────────────────
 * The dealer sign convention is an assumption, so the *level* is Tier B. The
 * *percentile* is materially more robust: the same assumption is applied to every
 * session, so a constant sign error shifts the whole series and largely cancels when
 * today is ranked against its own history. Consumers should lead with the percentile.
 * `spotVol` is Tier A — it regresses two published, market-quoted series against each
 * other and reports its own R² and n.
 */

// ─── Payload shapes ──────────────────────────────────────────────────────────────────

/** One session. Keys are short because the series can be 3,500 rows long. */
export interface AggPoint {
  d: string;
  /** Spot. */
  s?: number;
  /** ATM implied vol as a FRACTION (0.16 = 16 vol). */
  iv?: number;
  g?: number;
  dl?: number;
  vn?: number;
  ch?: number;
  vg?: number;
}

export interface AggStats {
  mean: number;
  sd: number;
  min: number;
  p05: number;
  p50: number;
  p95: number;
  max: number;
  last: number | null;
  pctile: number | null;
  n: number;
}

export interface AggTrendPayload {
  schema?: string;
  asof?: string;
  root?: string;
  since?: string | null;
  n_days?: number;
  units?: Record<string, string>;
  series?: AggPoint[];
  stats?: Record<string, AggStats>;
}

export type TrendGreek = "gamma" | "delta" | "vanna" | "charm" | "vega";

export const TREND_GREEKS: readonly TrendGreek[] = ["gamma", "delta", "vanna", "charm", "vega"];

/** greek → its compact series key, mirroring engine/agg_trend.GREEK_COLUMNS. */
export const TREND_KEY: Record<TrendGreek, keyof AggPoint> = {
  gamma: "g",
  delta: "dl",
  vanna: "vn",
  charm: "ch",
  vega: "vg",
};

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

// ─── Windowing ───────────────────────────────────────────────────────────────────────

/** Selectable history windows, in sessions. `null` = the whole published series. */
export const TREND_WINDOWS = [
  { key: "1y", sessions: 252 },
  { key: "3y", sessions: 756 },
  { key: "all", sessions: null },
] as const;

export type TrendWindowKey = (typeof TREND_WINDOWS)[number]["key"];

export interface TrendSeries {
  /** One point per session that carries a finite value for this greek. */
  points: { d: string; v: number }[];
  /**
   * Distribution of `points`, recomputed for the window — NOT the payload's
   * full-history `stats`. A percentile is only meaningful against a stated
   * reference set, so narrowing the window must narrow the reference too.
   */
  stats: AggStats | null;
  /** Sessions covered, and the first date in the window. */
  n: number;
  since: string | null;
  /** True when the window asked for more sessions than the payload holds. */
  truncated: boolean;
}

/** Distribution summary. Mirrors engine/agg_trend._stats so both sides agree. */
export function windowStats(values: number[]): AggStats | null {
  const v = values.filter(isNum);
  if (v.length < 2) return null;
  const sorted = [...v].sort((a, b) => a - b);
  const q = (p: number) => {
    // Linear interpolation on the sorted sample — numpy.percentile's default,
    // which is what the publisher used. Matching it keeps the window stats and
    // the payload's full-history stats on one definition.
    const idx = (sorted.length - 1) * p;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  };
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  const varSum = v.reduce((a, b) => a + (b - mean) ** 2, 0);
  const last = v[v.length - 1];
  return {
    mean,
    sd: Math.sqrt(varSum / (v.length - 1)),
    min: sorted[0],
    p05: q(0.05),
    p50: q(0.5),
    p95: q(0.95),
    max: sorted[sorted.length - 1],
    last,
    pctile: (v.filter((x) => x < last).length / v.length) * 100,
    n: v.length,
  };
}

/** Extract one greek's series over a window, with the window's own distribution. */
export function trendSeries(
  payload: AggTrendPayload | null | undefined,
  greek: TrendGreek,
  windowKey: TrendWindowKey = "all",
): TrendSeries {
  const empty: TrendSeries = { points: [], stats: null, n: 0, since: null, truncated: false };
  const all = payload?.series;
  if (!Array.isArray(all) || all.length === 0) return empty;

  const key = TREND_KEY[greek];
  const pts: { d: string; v: number }[] = [];
  for (const row of all) {
    const v = row?.[key];
    if (typeof row?.d === "string" && isNum(v)) pts.push({ d: row.d, v });
  }
  if (pts.length === 0) return empty;

  const want = TREND_WINDOWS.find((w) => w.key === windowKey)?.sessions ?? null;
  const truncated = want != null && pts.length < want;
  const win = want == null ? pts : pts.slice(Math.max(0, pts.length - want));

  return {
    points: win,
    stats: windowStats(win.map((p) => p.v)),
    n: win.length,
    since: win.length ? win[0].d : null,
    truncated,
  };
}

/**
 * Reduce a long series to at most `columns` pixel columns, keeping the MIN and MAX of
 * each column in chronological order.
 *
 * A nine-year daily series is ~2,400 points; at 390px of plot that is seven points per
 * pixel, and a naive polyline renders as an undifferentiated block. Dropping every Nth
 * point instead would be worse than ugly — it silently deletes the spikes, which on an
 * exposure chart are the whole signal.
 *
 * Min/max decimation keeps the vertical envelope EXACT: every extreme survives, at its
 * own date. Only the ordering of the intra-column wiggle is lost, which is below the
 * resolution of the pixel it is drawn in.
 *
 * Returns the input unchanged when it already fits.
 */
export function decimate(
  points: readonly { d: string; v: number }[],
  columns: number,
): { d: string; v: number; i: number }[] {
  if (!Array.isArray(points) || points.length === 0) return [];
  const withIdx = (i: number) => ({ ...points[i], i });
  const cols = Math.max(1, Math.floor(columns));
  // 2 points per column is the break-even: below that, decimating would ADD points.
  if (points.length <= cols * 2) return points.map((_, i) => withIdx(i));

  const out: { d: string; v: number; i: number }[] = [];
  const per = points.length / cols;
  for (let c = 0; c < cols; c++) {
    const lo = Math.floor(c * per);
    const hi = Math.min(points.length, Math.floor((c + 1) * per));
    if (hi <= lo) continue;
    // Indices, not values — indexOf() inside this loop would make the whole pass
    // quadratic (2,400 points x 1,174 columns).
    let iMin = lo;
    let iMax = lo;
    for (let i = lo + 1; i < hi; i++) {
      if (points[i].v < points[iMin].v) iMin = i;
      if (points[i].v > points[iMax].v) iMax = i;
    }
    // Chronological within the column, so the line never doubles back on itself.
    if (iMin === iMax) out.push(withIdx(iMin));
    else if (iMin < iMax) out.push(withIdx(iMin), withIdx(iMax));
    else out.push(withIdx(iMax), withIdx(iMin));
  }
  // The final point is the reading everything else is compared against — never let
  // column arithmetic drop it.
  const lastI = points.length - 1;
  if (out.length === 0 || out[out.length - 1].i !== lastI) out.push(withIdx(lastI));
  return out;
}

// ─── Spot–vol relationship ───────────────────────────────────────────────────────────

export type VolVerdict = "overvixed" | "undervixed" | "inline" | "unknown";

/**
 * |z| beyond which today's vol move is called out as over- or under-reacting.
 *
 * 1.0 residual standard deviation ≈ the outer third of sessions. Deliberately not
 * tighter: this is a descriptive label on a noisy regression, and a threshold that
 * fires on half the sessions is not information.
 */
export const VOL_RESID_Z = 1.0;

/** Sessions required before the regression is reported at all. */
export const SPOTVOL_MIN_N = 30;

export interface SpotVolResult {
  /** Paired daily observations used. */
  n: number;
  /** OLS slope: vol POINTS of ATM IV change per +1% spot return. Typically negative. */
  beta: number | null;
  intercept: number | null;
  /** Fraction of IV-change variance the spot move explains, 0..1. */
  r2: number | null;
  /** Standard deviation of the regression residuals, in vol points. */
  residSd: number | null;
  /** Most recent session's spot return, in percent. */
  lastReturnPct: number | null;
  /** Most recent session's ATM IV change, in vol points. */
  lastIvChangePts: number | null;
  /** What the regression expected that IV change to be, in vol points. */
  predictedPts: number | null;
  /** (actual − predicted) / residSd. Positive = vol rose more than the move implies. */
  residZ: number | null;
  verdict: VolVerdict;
  /** Gauge needle in −1..+1 (undervixed → overvixed), or null. */
  gauge: number | null;
  /** Scatter points: x = return %, y = IV change in vol points. */
  points: { x: number; y: number }[];
}

const EMPTY_SPOTVOL: SpotVolResult = {
  n: 0, beta: null, intercept: null, r2: null, residSd: null,
  lastReturnPct: null, lastIvChangePts: null, predictedPts: null,
  residZ: null, verdict: "unknown", gauge: null, points: [],
};

/**
 * Regress daily ATM-IV change on daily spot return — Volland's "Spot-Vol Correlation"
 * and the "Spot Vol Beta" gauge, from the spot and IV the aggregate payload already
 * carries.
 *
 * Both series come from the SAME frame, session-aligned by construction. Taking IV from
 * a second store would let the two drift a session apart, which is invisible in the
 * output and quietly destroys the regression.
 *
 * The gauge answers "did vol move more or less than this spot move usually implies",
 * not "is vol high" — an important distinction. A −2% day with IV up 3 points is
 * ordinary; the same IV move on a flat day is not.
 */
export function spotVol(
  series: AggPoint[] | null | undefined,
  windowSessions = 252,
): SpotVolResult {
  if (!Array.isArray(series) || series.length < 2) return EMPTY_SPOTVOL;

  // Consecutive sessions only where BOTH spot and IV are present on both ends: a gap
  // would otherwise contribute a multi-day change labelled as a daily one.
  const obs: { x: number; y: number }[] = [];
  for (let i = 1; i < series.length; i++) {
    const a = series[i - 1];
    const b = series[i];
    if (!isNum(a?.s) || !isNum(b?.s) || a.s <= 0) continue;
    if (!isNum(a?.iv) || !isNum(b?.iv)) continue;
    obs.push({
      x: ((b.s - a.s) / a.s) * 100,
      y: (b.iv - a.iv) * 100, // fraction → vol points
    });
  }
  const win = obs.slice(Math.max(0, obs.length - windowSessions));
  if (win.length < SPOTVOL_MIN_N) {
    return { ...EMPTY_SPOTVOL, n: win.length, points: win };
  }

  const n = win.length;
  const mx = win.reduce((s, p) => s + p.x, 0) / n;
  const my = win.reduce((s, p) => s + p.y, 0) / n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const p of win) {
    sxx += (p.x - mx) ** 2;
    sxy += (p.x - mx) * (p.y - my);
    syy += (p.y - my) ** 2;
  }
  if (sxx <= 0) return { ...EMPTY_SPOTVOL, n, points: win };

  const beta = sxy / sxx;
  const intercept = my - beta * mx;
  const r2 = syy > 0 ? (sxy * sxy) / (sxx * syy) : null;

  let ss = 0;
  for (const p of win) ss += (p.y - (intercept + beta * p.x)) ** 2;
  // n − 2 degrees of freedom: a two-parameter fit.
  const residSd = n > 2 ? Math.sqrt(ss / (n - 2)) : null;

  const last = win[n - 1];
  const predictedPts = intercept + beta * last.x;
  const residZ = residSd && residSd > 0 ? (last.y - predictedPts) / residSd : null;

  let verdict: VolVerdict = "unknown";
  if (residZ != null) {
    verdict = residZ > VOL_RESID_Z ? "overvixed" : residZ < -VOL_RESID_Z ? "undervixed" : "inline";
  }

  return {
    n,
    beta,
    intercept,
    r2,
    residSd,
    lastReturnPct: last.x,
    lastIvChangePts: last.y,
    predictedPts,
    residZ,
    verdict,
    // Clamped at ±2 sigma so one outlier cannot peg the needle permanently.
    gauge: residZ == null ? null : Math.max(-1, Math.min(1, residZ / 2)),
    points: win,
  };
}

// ─── Positioning extremes by horizon ─────────────────────────────────────────────────

export type HorizonKey = "near" | "swing" | "far";

/**
 * Horizon bands in calendar days to expiry.
 *
 * Chosen to match how the book actually clusters rather than round numbers: `near`
 * covers the daily/weekly expiries that dominate 0DTE-era gamma, `swing` the monthly
 * cycle, `far` everything quarterly and beyond. Compare `tenorBand` in
 * marketStructure.ts, which bands by the GAP BETWEEN expirations for the term-structure
 * chart — a different question, deliberately a different split.
 */
export const HORIZONS: { key: HorizonKey; maxDte: number | null }[] = [
  { key: "near", maxDte: 5 },
  { key: "swing", maxDte: 30 },
  { key: "far", maxDte: null },
];

export interface ExtremeRow {
  horizon: HorizonKey;
  /** Heaviest positive-gamma strike above spot — where hedging resists a rally. */
  resistance: number | null;
  /** Heaviest negative-gamma strike below spot — where hedging accelerates a fall. */
  support: number | null;
  /** $mn at those strikes, for weighting the read. */
  resistanceMn: number | null;
  supportMn: number | null;
  /** Matrix cells that fed this band. 0 → the row is unknown, not empty. */
  cells: number;
}

export interface ExtremesResult {
  rows: ExtremeRow[];
  /** False when no matrix is available at all — the card must say so, not show blanks. */
  available: boolean;
}

interface MatrixLike {
  /** The matrix's OWN session. Authoritative over the caller's when present. */
  asof?: string | null;
  spot?: number | null;
  cells?: { strike: number; expiry: string; gex: number | null }[];
}

/**
 * Calendar days the matrix may trail the ladder before its horizons are untrustworthy.
 *
 * Matches MAX_SESSION_GAP_DAYS in gexLadder.ts, which guards the same store for the
 * same reason: 4 covers a long weekend plus a Monday holiday, and anything wider is the
 * documented "matrix fell behind" failure mode rather than ordinary cadence.
 */
export const MATRIX_MAX_GAP_DAYS = 4;

const DOLLARS_PER_MN = 1e6;

/**
 * Volland's "Extremes": support and resistance split by horizon.
 *
 * Built from `matrix:{ROOT}` (options_structure.matrix/v1) — the only store carrying
 * strike AND expiry together, which is what makes a per-horizon answer possible at all.
 * The all-expiry `by_strike` ladder can only give one pair of walls for the whole book.
 *
 * ⚠️ Tier C-adjacent by the masterplan's tiering — "support"/"resistance" is a claim
 * about future price behaviour. What is actually measured here is where dealer gamma is
 * concentrated; the card must label it that way and must not assert the level will hold.
 * A graded version (did price respect it?) is R2.4.
 */
export function extremes(
  matrix: MatrixLike | null | undefined,
  spot: number | null | undefined,
  asof: string | null | undefined,
): ExtremesResult {
  const rows: ExtremeRow[] = HORIZONS.map((h) => ({
    horizon: h.key,
    resistance: null,
    support: null,
    resistanceMn: null,
    supportMn: null,
    cells: 0,
  }));
  const cells = matrix?.cells;
  if (!Array.isArray(cells) || cells.length === 0) return { rows, available: false };

  // ⚠️ Date and price the matrix by the MATRIX's own session, not the ladder's.
  //
  // These are two independently-cadenced stores. Using the ladder's asof to compute
  // days-to-expiry re-bands every cell into the wrong horizon; using the ladder's spot
  // to decide which side of the money a strike sits on can flip a support into a
  // resistance outright. Both produce a full, confident table describing a session that
  // is not the one the reader is looking at.
  const mAsof = typeof matrix?.asof === "string" && matrix.asof ? matrix.asof : asof;
  const mSpot = isNum(matrix?.spot) ? (matrix.spot as number) : isNum(spot) ? spot : null;
  if (mSpot == null || mSpot <= 0 || !mAsof) return { rows, available: false };

  const asofMs = Date.parse(`${mAsof.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(asofMs)) return { rows, available: false };

  // Refuse outright when the two stores have drifted apart: a horizon table built from
  // a stale grid under a fresh header is worse than no table.
  if (typeof asof === "string" && asof) {
    const ladderMs = Date.parse(`${asof.slice(0, 10)}T00:00:00Z`);
    if (Number.isFinite(ladderMs)
        && Math.abs(ladderMs - asofMs) > MATRIX_MAX_GAP_DAYS * 86_400_000) {
      return { rows, available: false };
    }
  }
  const s = mSpot;

  // strike → $mn, per horizon band.
  const byBand = new Map<HorizonKey, Map<number, number>>();
  for (const h of HORIZONS) byBand.set(h.key, new Map());
  const counts = new Map<HorizonKey, number>();

  for (const c of cells) {
    if (!isNum(c?.strike) || !isNum(c?.gex)) continue;
    const expMs = Date.parse(`${String(c.expiry ?? "").slice(0, 10)}T00:00:00Z`);
    if (!Number.isFinite(expMs)) continue;
    const dte = Math.round((expMs - asofMs) / 86_400_000);
    if (dte < 0) continue;
    const band = HORIZONS.find((h) => h.maxDte == null || dte <= h.maxDte);
    if (!band) continue;
    const m = byBand.get(band.key)!;
    m.set(c.strike, (m.get(c.strike) ?? 0) + c.gex / DOLLARS_PER_MN);
    counts.set(band.key, (counts.get(band.key) ?? 0) + 1);
  }

  for (const row of rows) {
    const m = byBand.get(row.horizon)!;
    row.cells = counts.get(row.horizon) ?? 0;
    let bestAbove: [number, number] | null = null;
    let bestBelow: [number, number] | null = null;
    for (const [k, mn] of m) {
      if (k > s && mn > 0 && (bestAbove == null || mn > bestAbove[1])) bestAbove = [k, mn];
      if (k < s && mn < 0 && (bestBelow == null || mn < bestBelow[1])) bestBelow = [k, mn];
    }
    row.resistance = bestAbove?.[0] ?? null;
    row.resistanceMn = bestAbove?.[1] ?? null;
    row.support = bestBelow?.[0] ?? null;
    row.supportMn = bestBelow?.[1] ?? null;
  }

  return { rows, available: rows.some((r) => r.cells > 0) };
}
