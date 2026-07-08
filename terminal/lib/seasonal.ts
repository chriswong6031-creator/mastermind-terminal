/**
 * seasonal.ts — pure seasonality math shared by the Seasonals chart + the
 * advanced-analytics section. Everything is derived from daily OHLC `bars`:
 *   buildYears()  → per-year price grid (Jan→Dec) + 12 monthly returns
 *   monthlyStats()/holdingWindows()/quarterStats()/… → aggregate analytics over
 *   a caller-supplied set of ACTIVE years (the year toggles).
 *
 * No React, no I/O — trivially testable. The grid index maps ~linearly to the
 * calendar (index 0 = Jan 1 … index HORIZON-1 = Dec 31), so a grid position can
 * be labelled with an approximate calendar date and the 12 month boundaries.
 */
import type { Bar } from "./fund";

export const HORIZON = 252; // calendar trading-day positions Jan→Dec
export const MAX_YEARS = 8;

export const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const MONTHS_ZH = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];
export const QUARTERS = ["Q1", "Q2", "Q3", "Q4"];

/** Fixed per-year color mapping; older years fall back to the palette below. */
export const YEAR_COLORS: Record<string, string> = {
  "2016": "#f472b6",
  "2017": "#c084fc",
  "2018": "#2dd4bf",
  "2019": "#22d3ee",
  "2020": "#22c55e",
  "2021": "#eab308",
  "2022": "#ef4444",
  "2023": "#60a5fa",
  "2024": "#f97316",
  "2025": "#a3e635",
  "2026": "#e879f9",
};
export const YEAR_PALETTE = ["#60a5fa", "#a3e635", "#f97316", "#22d3ee", "#eab308", "#ef4444", "#2dd4bf", "#c084fc"];

export function yearColor(year: string, idx: number): string {
  if (YEAR_COLORS[year]) return YEAR_COLORS[year];
  // deep history (decades of years) → a golden-angle hue spread so every year is distinguishable
  const y = parseInt(year, 10);
  const hue = ((Number.isFinite(y) ? y : idx) * 137.508) % 360;
  return `hsl(${Math.round((hue + 360) % 360)} 62% 60%)`;
}

/* ── calendar mapping (non-leap reference year) ──────────────────────────── */
export const MONTH_LEN = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
export const MONTH_START_DOY = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
export const YEAR_DAYS = 365;

/** Grid index (0…horizon-1) → 0-based day-of-year (0…364). */
export function idxToDoy(i: number, horizon = HORIZON): number {
  const f = horizon <= 1 ? 0 : i / (horizon - 1);
  return Math.round(f * (YEAR_DAYS - 1));
}
/** Day-of-year → grid index. */
export function doyToIdx(doy: number, horizon = HORIZON): number {
  return Math.round((doy / (YEAR_DAYS - 1)) * (horizon - 1));
}
/** 0-based day-of-year → [monthIdx, day (1-based)]. */
export function doyToMonthDay(doy: number): [number, number] {
  let d = Math.max(0, Math.min(YEAR_DAYS - 1, Math.round(doy)));
  for (let m = 0; m < 12; m++) {
    if (d < MONTH_LEN[m]) return [m, d + 1];
    d -= MONTH_LEN[m];
  }
  return [11, 31];
}
/** Grid indices of each month's first day (12 boundaries) + year-end. */
export function monthBoundIdx(horizon = HORIZON): number[] {
  return MONTH_START_DOY.map((d) => doyToIdx(d, horizon));
}
/** Short date label for a grid index, e.g. "Mar 14" / "3月14". */
export function idxToDateLabel(i: number, zh: boolean, horizon = HORIZON): string {
  const [m, d] = doyToMonthDay(idxToDoy(i, horizon));
  return zh ? `${m + 1}月${d}` : `${MONTHS_EN[m]} ${d}`;
}

/* ── per-year build ──────────────────────────────────────────────────────── */
export interface YearData {
  year: string;
  /** per-position resampled close, index 0..HORIZON-1 (Jan→Dec). null past "now". */
  price: (number | null)[];
  /** 12 monthly returns (%), month vs prior-month last close. */
  monthlyRet: (number | null)[];
  /** compounded full-year return (%), or null when no months present. */
  yearRet: number | null;
  isCurrent: boolean;
  /** last grid index with real data (partial current year); HORIZON-1 otherwise. */
  coverIdx: number;
}

function compound(rets: (number | null)[]): number | null {
  let acc = 1;
  let any = false;
  for (const v of rets) {
    if (v != null) {
      acc *= 1 + v / 100;
      any = true;
    }
  }
  return any ? (acc - 1) * 100 : null;
}

/** Group daily bars by calendar year; resample each to a HORIZON-length grid. */
export function buildYears(bars: Bar[]): YearData[] {
  if (bars.length === 0) return [];
  const byYear = new Map<string, Bar[]>();
  for (const b of bars) {
    const yr = String(b.time).slice(0, 4);
    if (!byYear.has(yr)) byYear.set(yr, []);
    byYear.get(yr)!.push(b);
  }
  const years = Array.from(byYear.keys()).sort();
  const recent = years;                       // full history since inception (togglable per-year in the UI)
  const curYear = years[years.length - 1];

  return recent.map((yr) => {
    const arr = byYear.get(yr)!.slice().sort((a, b) => String(a.time).localeCompare(String(b.time)));
    const price: (number | null)[] = new Array(HORIZON).fill(null);
    const n = arr.length;
    // Calendar-accurate resample: map each grid position (its calendar day-of-year) to the close
    // as-of that date within the year. Positions before the first bar (a mid-year IPO's pre-listing
    // months) or after the last bar of the CURRENT partial year are null — so an IPO year sits on the
    // real calendar (Sep data at Sep, never smeared across Jan→Dec) and "now" reads correctly.
    const barF = arr.map((b) => {
      const m = parseInt(String(b.time).slice(5, 7), 10) - 1;
      const d = parseInt(String(b.time).slice(8, 10), 10) || 1;
      const doy = (MONTH_START_DOY[m] ?? 0) + (d - 1);
      return Math.min(1, doy / (YEAR_DAYS - 1));
    });
    for (let i = 0, k = -1; i < HORIZON; i++) {
      const f = HORIZON <= 1 ? 0 : i / (HORIZON - 1);
      while (k + 1 < n && barF[k + 1] <= f) k++;
      if (k < 0) price[i] = n > 0 && barF[0] <= 0.03 ? arr[0].c : null;  // normal year-start vs mid-year IPO
      else if (f <= barF[n - 1]) price[i] = arr[k].c;                    // within the year's data range
      else if (yr === curYear) price[i] = null;                         // current year: calendar past today
      else price[i] = arr[n - 1].c;                                     // completed prior year: hold year-end close
    }
    let coverIdx = HORIZON - 1;
    for (let i = HORIZON - 1; i >= 0; i--) { if (price[i] != null) { coverIdx = i; break; } }

    // monthly returns: last close of month vs prior month's last close
    const monthLast: (number | null)[] = new Array(12).fill(null);
    const monthFirst: (number | null)[] = new Array(12).fill(null);
    for (const b of arr) {
      const m = parseInt(String(b.time).slice(5, 7), 10) - 1;
      if (m < 0 || m > 11) continue;
      if (monthFirst[m] == null) monthFirst[m] = b.o ?? b.c;
      monthLast[m] = b.c;
    }
    const monthlyRet: (number | null)[] = new Array(12).fill(null);
    for (let m = 0; m < 12; m++) {
      const close = monthLast[m];
      if (close == null) continue;
      let prevRef: number | null = null;
      for (let k = m - 1; k >= 0; k--) {
        if (monthLast[k] != null) {
          prevRef = monthLast[k];
          break;
        }
      }
      if (prevRef == null) prevRef = monthFirst[m];
      if (prevRef != null && prevRef !== 0) monthlyRet[m] = (close / prevRef - 1) * 100;
    }

    return { year: yr, price, monthlyRet, yearRet: compound(monthlyRet), isCurrent: yr === curYear, coverIdx };
  });
}

/* ── small stats helpers ─────────────────────────────────────────────────── */
export function mean(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}
export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = xs.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
export function stdev(xs: number[]): number | null {
  if (xs.length < 2) return null;
  const mu = mean(xs)!;
  const v = xs.reduce((a, b) => a + (b - mu) * (b - mu), 0) / (xs.length - 1);
  return Math.sqrt(v);
}
/** Win rate (share > 0) as 0..1, or null when no samples. */
export function winRate(xs: number[]): number | null {
  return xs.length ? xs.filter((v) => v > 0).length / xs.length : null;
}

export type ActiveFn = (year: string) => boolean;

/* ── monthly seasonality ─────────────────────────────────────────────────── */
export interface MonthStat {
  month: number; // 0..11
  mean: number | null;
  median: number | null;
  wr: number | null; // 0..1
  stdev: number | null;
  n: number;
  pos: number;
  neg: number;
  best: { year: string; ret: number } | null;
  worst: { year: string; ret: number } | null;
  vals: { year: string; ret: number }[];
}

export function monthlyStats(years: YearData[], active: ActiveFn): MonthStat[] {
  const out: MonthStat[] = [];
  for (let m = 0; m < 12; m++) {
    const vals: { year: string; ret: number }[] = [];
    for (const y of years) {
      if (!active(y.year)) continue;
      const r = y.monthlyRet[m];
      if (r != null && isFinite(r)) vals.push({ year: y.year, ret: r });
    }
    const xs = vals.map((v) => v.ret);
    const sorted = vals.slice().sort((a, b) => a.ret - b.ret);
    out.push({
      month: m,
      mean: mean(xs),
      median: median(xs),
      wr: winRate(xs),
      stdev: stdev(xs),
      n: xs.length,
      pos: xs.filter((v) => v > 0).length,
      neg: xs.filter((v) => v < 0).length,
      best: sorted.length ? sorted[sorted.length - 1] : null,
      worst: sorted.length ? sorted[0] : null,
      vals,
    });
  }
  return out;
}

/* ── full-year distribution ──────────────────────────────────────────────── */
export interface YearStat {
  year: string;
  ret: number;
}
export function fullYearStats(years: YearData[], active: ActiveFn) {
  const vals: YearStat[] = [];
  for (const y of years) {
    if (!active(y.year)) continue;
    if (y.yearRet != null && isFinite(y.yearRet)) vals.push({ year: y.year, ret: y.yearRet });
  }
  const xs = vals.map((v) => v.ret);
  const sorted = vals.slice().sort((a, b) => a.ret - b.ret);
  return {
    vals,
    mean: mean(xs),
    median: median(xs),
    wr: winRate(xs),
    stdev: stdev(xs),
    n: xs.length,
    best: sorted.length ? sorted[sorted.length - 1] : null,
    worst: sorted.length ? sorted[0] : null,
  };
}

/* ── quarter contribution ────────────────────────────────────────────────── */
export interface QuarterStat {
  quarter: number; // 0..3
  mean: number | null; // avg compounded quarter return (%)
  wr: number | null;
  n: number;
}
export function quarterStats(years: YearData[], active: ActiveFn): QuarterStat[] {
  const out: QuarterStat[] = [];
  for (let q = 0; q < 4; q++) {
    const xs: number[] = [];
    for (const y of years) {
      if (!active(y.year)) continue;
      const seg = y.monthlyRet.slice(q * 3, q * 3 + 3);
      const c = compound(seg);
      if (c != null && isFinite(c)) xs.push(c);
    }
    out.push({ quarter: q, mean: mean(xs), wr: winRate(xs), n: xs.length });
  }
  return out;
}

/* ── holding-window matrix (best contiguous month span to hold) ──────────── */
export interface WindowStat {
  start: number; // month idx
  end: number; // month idx (>= start)
  mean: number | null;
  median: number | null;
  wr: number | null;
  stdev: number | null;
  sharpe: number | null; // mean / stdev (risk-adjusted seasonal strength)
  n: number; // years with full coverage of the span
}

/** For every (start ≤ end) month span, compounded return per active year. */
export function holdingWindows(years: YearData[], active: ActiveFn): (WindowStat | null)[][] {
  const grid: (WindowStat | null)[][] = Array.from({ length: 12 }, () => new Array(12).fill(null));
  for (let s = 0; s < 12; s++) {
    for (let e = s; e < 12; e++) {
      const xs: number[] = [];
      for (const y of years) {
        if (!active(y.year)) continue;
        const seg = y.monthlyRet.slice(s, e + 1);
        // require full coverage of the span (no null months) for an honest compound
        if (seg.some((v) => v == null)) continue;
        const c = compound(seg);
        if (c != null && isFinite(c)) xs.push(c);
      }
      if (!xs.length) {
        grid[s][e] = { start: s, end: e, mean: null, median: null, wr: null, stdev: null, sharpe: null, n: 0 };
        continue;
      }
      const mu = mean(xs);
      const sd = stdev(xs);
      grid[s][e] = {
        start: s,
        end: e,
        mean: mu,
        median: median(xs),
        wr: winRate(xs),
        stdev: sd,
        sharpe: mu != null && sd != null && sd > 0 ? mu / sd : null,
        n: xs.length,
      };
    }
  }
  return grid;
}

/**
 * Pick the "best" window. `by` = "mean" (highest avg return) or "sharpe"
 * (best risk-adjusted). Requires n ≥ minN active years with full coverage.
 */
export function bestWindow(
  grid: (WindowStat | null)[][],
  by: "mean" | "sharpe" = "mean",
  minN = 2,
): WindowStat | null {
  let best: WindowStat | null = null;
  for (let s = 0; s < 12; s++) {
    for (let e = s; e < 12; e++) {
      const w = grid[s][e];
      if (!w || w.n < minN) continue;
      const key = by === "sharpe" ? w.sharpe : w.mean;
      if (key == null) continue;
      const bkey = best ? (by === "sharpe" ? best.sharpe : best.mean) : null;
      if (bkey == null || key > bkey) best = w;
    }
  }
  return best;
}

/* ── window over the price grid (drag-to-select range gains) ─────────────── */
export interface RangeYearGain {
  year: string;
  gain: number; // %
  color: string;
  isCurrent: boolean;
}
export interface RangeStats {
  a: number; // grid idx (start ≤ end)
  b: number;
  gains: RangeYearGain[];
  mean: number | null;
  median: number | null;
  wr: number | null;
  stdev: number | null;
  n: number;
  best: RangeYearGain | null;
  worst: RangeYearGain | null;
}

/**
 * % gain of each active year between two grid indices, using the resampled
 * price path (matches exactly what the chart draws). Order-independent in a/b.
 */
export function rangeStats(
  years: YearData[],
  active: ActiveFn,
  ia: number,
  ib: number,
  colorOf: (year: string, idx: number) => string,
): RangeStats {
  const a = Math.min(ia, ib);
  const b = Math.max(ia, ib);
  const gains: RangeYearGain[] = [];
  let ci = 0;
  years.forEach((y) => {
    if (!active(y.year)) return;
    const p0 = y.price[a];
    const p1 = y.price[b];
    const col = colorOf(y.year, ci++);
    if (p0 != null && p1 != null && p0 !== 0 && isFinite(p0) && isFinite(p1)) {
      gains.push({ year: y.year, gain: (p1 / p0 - 1) * 100, color: col, isCurrent: y.isCurrent });
    }
  });
  const xs = gains.map((g) => g.gain);
  const sorted = gains.slice().sort((x, z) => x.gain - z.gain);
  return {
    a,
    b,
    gains,
    mean: mean(xs),
    median: median(xs),
    wr: winRate(xs),
    stdev: stdev(xs),
    n: xs.length,
    best: sorted.length ? sorted[sorted.length - 1] : null,
    worst: sorted.length ? sorted[0] : null,
  };
}

/* ── extra stats for the advanced section ────────────────────────────────── */
export function quantile(xs: number[], q: number): number | null {
  if (!xs.length) return null;
  const s = xs.slice().sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

/** Wilson 95% CI for a win rate (k of n up). Returns [lo, hi] in 0..1. */
export function wilson(k: number, n: number, z = 1.96): [number, number] {
  if (n === 0) return [0, 1];
  const p = k / n;
  const z2 = z * z;
  const center = (p + z2 / (2 * n)) / (1 + z2 / n);
  const half = (z / (1 + z2 / n)) * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  return [Math.max(0, center - half), Math.min(1, center + half)];
}

/** Per-position cumulative % path (rebased to the first finite close). */
export function cumPathPct(price: (number | null)[]): (number | null)[] {
  const base = price.find((v) => v != null && isFinite(v)) as number | undefined;
  if (base == null || base === 0) return price.map(() => null);
  return price.map((v) => (v != null && isFinite(v) ? (v / base - 1) * 100 : null));
}

/** The month we are currently in (drives the "this month" spotlight). */
export function currentMonthIdx(years: YearData[]): number {
  const cur = years.find((y) => y.isCurrent);
  if (cur) {
    for (let m = 11; m >= 0; m--) if (cur.monthlyRet[m] != null) return m;
  }
  return new Date().getUTCMonth();
}

/* ── path fan-cone (typical trajectory + where this year sits) ───────────── */
export interface ConePoint {
  i: number;
  med: number;
  p25: number;
  p75: number;
  min: number;
  max: number;
  n: number;
}
export interface FanCone {
  points: ConePoint[];
  current: (number | null)[] | null;
  frontier: number | null;
  curYear: string | null;
  nBand: number;
}
export function fanCone(years: YearData[], active: ActiveFn): FanCone {
  const bandYears = years.filter((y) => active(y.year) && !y.isCurrent);
  const paths = bandYears.map((y) => cumPathPct(y.price));
  const cur = years.find((y) => active(y.year) && y.isCurrent) ?? null;
  const curPath = cur ? cumPathPct(cur.price) : null;
  let frontier: number | null = null;
  if (curPath) for (let i = curPath.length - 1; i >= 0; i--) if (curPath[i] != null) { frontier = i; break; }
  const points: ConePoint[] = [];
  for (let i = 0; i < HORIZON; i++) {
    const xs = paths.map((p) => p[i]).filter((v): v is number => v != null && isFinite(v));
    if (xs.length) {
      points.push({ i, med: median(xs)!, p25: quantile(xs, 0.25)!, p75: quantile(xs, 0.75)!, min: Math.min(...xs), max: Math.max(...xs), n: xs.length });
    }
  }
  return { points, current: curPath, frontier, curYear: cur ? cur.year : null, nBand: bandYears.length };
}

/* ── running hot/cold + seasonal fuel-left (forward from today) ──────────── */
export interface Runway {
  frontier: number | null;
  curVal: number | null;
  medVal: number | null;
  gap: number | null;
  pct: number | null; // percentile of current-year vs prior at frontier (0..1)
  fuelMean: number | null;
  fuelP25: number | null;
  fuelP75: number | null;
  nPrior: number;
}
export function runway(years: YearData[], active: ActiveFn): Runway {
  const prior = years.filter((y) => active(y.year) && !y.isCurrent).map((y) => cumPathPct(y.price));
  const cur = years.find((y) => active(y.year) && y.isCurrent);
  const curPath = cur ? cumPathPct(cur.price) : null;
  let frontier: number | null = null;
  if (curPath) for (let i = curPath.length - 1; i >= 0; i--) if (curPath[i] != null) { frontier = i; break; }
  const empty: Runway = { frontier, curVal: null, medVal: null, gap: null, pct: null, fuelMean: null, fuelP25: null, fuelP75: null, nPrior: prior.length };
  if (frontier == null || !curPath) return empty;
  const curVal = curPath[frontier];
  if (curVal == null) return empty;
  const at = prior.map((p) => p[frontier!]).filter((v): v is number => v != null && isFinite(v));
  const medVal = median(at);
  const pct = at.length ? (at.filter((v) => v < curVal).length + 0.5) / at.length : null;
  const fuel = prior
    .map((p) => {
      let last: number | null = null;
      for (let i = p.length - 1; i >= 0; i--) if (p[i] != null) { last = p[i]; break; }
      const a = p[frontier!];
      return last != null && a != null && isFinite(last) && isFinite(a) ? last - a : null;
    })
    .filter((v): v is number => v != null);
  return { frontier, curVal, medVal, gap: medVal != null ? curVal - medVal : null, pct, fuelMean: mean(fuel), fuelP25: quantile(fuel, 0.25), fuelP75: quantile(fuel, 0.75), nPrior: at.length };
}

/* ── share-of-return donut ───────────────────────────────────────────────── */
export interface ShareSlice {
  month: number;
  weight: number; // sum |monthlyRet| across active years
  netMean: number | null;
  pos: number;
  neg: number;
}
export function shareOfReturn(years: YearData[], active: ActiveFn): { slices: ShareSlice[]; total: number; top3: number } {
  const slices: ShareSlice[] = [];
  let total = 0;
  for (let m = 0; m < 12; m++) {
    let w = 0;
    const xs: number[] = [];
    for (const y of years) {
      if (!active(y.year)) continue;
      const r = y.monthlyRet[m];
      if (r != null && isFinite(r)) {
        w += Math.abs(r);
        xs.push(r);
      }
    }
    total += w;
    slices.push({ month: m, weight: w, netMean: mean(xs), pos: xs.filter((v) => v > 0).length, neg: xs.filter((v) => v < 0).length });
  }
  const sorted = slices.map((s) => s.weight).sort((a, b) => b - a);
  const top3 = total > 0 ? sorted.slice(0, 3).reduce((a, b) => a + b, 0) / total : 0;
  return { slices, total, top3 };
}

/* ── sign-agreement coherence ("how much to trust it") ───────────────────── */
export function signAgreement(years: YearData[], active: ActiveFn): { score: number | null; label: string; nYears: number } {
  const ms = monthlyStats(years, active);
  const vals = ms.filter((s) => s.n >= 2).map((s) => Math.max(s.pos, s.neg) / s.n);
  const score = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  const nYears = years.filter((y) => active(y.year)).length;
  const label = score == null ? "—" : score >= 0.72 ? "CONSISTENT" : score >= 0.6 ? "MIXED" : "WEAK";
  return { score, label, nYears };
}

/* ── best-window overfit guard (permutation p on the 66-window search) ───── */
function bestMeanWindow(mat: number[][]): { val: number; s: number; e: number } {
  let best = { val: -Infinity, s: 0, e: 0 };
  const n = mat.length;
  for (let s = 0; s < 12; s++) {
    const acc = new Array(n).fill(1);
    for (let e = s; e < 12; e++) {
      let sum = 0;
      for (let k = 0; k < n; k++) {
        acc[k] *= 1 + mat[k][e] / 100;
        sum += (acc[k] - 1) * 100;
      }
      const mu = sum / n;
      if (mu > best.val) best = { val: mu, s, e };
    }
  }
  return best;
}
export interface OverfitGuard {
  p: number | null; // search-corrected p that the best window is mined noise
  observed: number | null;
  nYears: number;
  window: { start: number; end: number } | null;
  verdict: "NOTABLE" | "WEAK" | "NOISE" | null;
}
export function overfitGuard(years: YearData[], active: ActiveFn, R = 200): OverfitGuard {
  const complete = years
    .filter((y) => active(y.year) && (y.monthlyRet as (number | null)[]).every((v) => v != null && isFinite(v as number)))
    .map((y) => y.monthlyRet as number[]);
  const nYears = complete.length;
  if (nYears < 3) return { p: null, observed: null, nYears, window: null, verdict: null };
  const obs = bestMeanWindow(complete);
  let ge = 0;
  for (let r = 0; r < R; r++) {
    const shuffled = complete.map((v) => {
      const a = v.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    });
    if (bestMeanWindow(shuffled).val >= obs.val) ge++;
  }
  const p = (ge + 1) / (R + 1);
  const verdict = p < 0.05 ? "NOTABLE" : p < 0.2 ? "WEAK" : "NOISE";
  return { p, observed: obs.val, nYears, window: { start: obs.s, end: obs.e }, verdict };
}
