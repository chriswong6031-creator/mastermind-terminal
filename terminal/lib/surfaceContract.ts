/**
 * surfaceContract.ts — pure contract + transform helpers for the surface snapshot store
 * and the session-flow rebase math. Kept DOM-free so lib/__tests__/surfaceContract.test.ts
 * can assert the index↔files contract and the off-open rebase without a chart.
 *
 * Snapshot store (materialized to R2 / served via /api/flow):
 *   surface_idx:{ROOT}   → SurfaceIndex  { date, stamps:["HHMM",…], latest, cadenceSec }
 *   surface:{ROOT}:{HHMM}→ SurfaceFrame  { spot, price_levels[], time_steps[],
 *                                          grids:{ netprem:[[…]] }, asof, cadence }
 *
 * The UI must never pretend a cadence it doesn't have: `cadenceSec`/`cadence` are carried
 * verbatim from the materializer and shown honestly (see SurfacePane cadence stamp).
 */

import type { HeatData, HeatCell } from "@/lib/heatSeries";
import type { Time } from "lightweight-charts";

// ─── Snapshot store types ───────────────────────────────────────────────────

export interface SurfaceIndex {
  date: string; // YYYY-MM-DD (session date, ET)
  stamps: string[]; // ascending "HHMM"
  latest: string | null; // newest stamp === stamps.at(-1)
  cadenceSec: number; // real cadence of the underlying artifacts (honesty)
  source?: string;
}

export interface SurfaceFrame {
  spot: number | null;
  price_levels: number[]; // strike levels, ascending
  time_steps: string[]; // "HH:MM" columns realized so far this session
  grids: { [metric: string]: number[][] }; // grids[metric][levelIdx][timeIdx]
  asof: string; // ISO stamp of this frame
  cadence: string; // human cadence label e.g. "10-min" (honesty)
  metrics?: string[]; // which metric grids are present
  session_date?: string; // YYYY-MM-DD (ET) — anchors the intraday time axis
  root?: string;
}

// ─── Contract validators ────────────────────────────────────────────────────

export function isSurfaceIndex(x: unknown): x is SurfaceIndex {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.date === "string" &&
    Array.isArray(o.stamps) &&
    o.stamps.every((s) => typeof s === "string") &&
    (o.latest === null || typeof o.latest === "string") &&
    typeof o.cadenceSec === "number"
  );
}

export function isSurfaceFrame(x: unknown): x is SurfaceFrame {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    Array.isArray(o.price_levels) &&
    Array.isArray(o.time_steps) &&
    !!o.grids &&
    typeof o.grids === "object" &&
    typeof o.asof === "string" &&
    typeof o.cadence === "string"
  );
}

/**
 * Validate that an index and a set of available stamp files agree.
 * Returns { ok, missing, extra } — `missing` = stamps promised by the index but with no
 * file; `extra` = files present that the index doesn't list. `latest` must equal the last
 * stamp. Used in tests and can gate a materializer self-check.
 */
export function checkIndexFilesContract(
  index: SurfaceIndex,
  availableStamps: string[],
): { ok: boolean; missing: string[]; extra: string[]; latestOk: boolean } {
  const idxSet = new Set(index.stamps);
  const availSet = new Set(availableStamps);
  const missing = index.stamps.filter((s) => !availSet.has(s));
  const extra = availableStamps.filter((s) => !idxSet.has(s));
  const latestOk =
    index.stamps.length === 0
      ? index.latest === null
      : index.latest === index.stamps[index.stamps.length - 1];
  return { ok: missing.length === 0 && extra.length === 0 && latestOk, missing, extra, latestOk };
}

// ─── Grid → heat bars ───────────────────────────────────────────────────────

/**
 * Median step between successive price levels (the cell half-height source).
 * Falls back to 1 for degenerate inputs.
 */
export function levelStep(priceLevels: number[]): number {
  if (priceLevels.length < 2) return 1;
  const diffs: number[] = [];
  for (let i = 1; i < priceLevels.length; i++) {
    const d = priceLevels[i] - priceLevels[i - 1];
    if (d > 0) diffs.push(d);
  }
  if (diffs.length === 0) return 1;
  diffs.sort((a, b) => a - b);
  return diffs[Math.floor(diffs.length / 2)];
}

/** max(|min|,|max|) across a metric grid — the shader's day-max normalizer. */
export function gridMaxAbs(grid: number[][]): number {
  let m = 0;
  for (const row of grid) {
    for (const v of row) {
      const a = Math.abs(v);
      if (Number.isFinite(a) && a > m) m = a;
    }
  }
  return m;
}

/** A time-anchoring converter: "HH:MM" on a session date → LWC UNIX time (seconds). */
export type TimeAnchor = (hhmm: string) => Time;

/**
 * Build the heat-series bar array from a frame's metric grid.
 * grid[levelIdx][timeIdx] → one bar per time step, each carrying a cell per level.
 * Bars past the frame's realized `time_steps` are simply absent (honest — no forward fill).
 */
export function buildHeatBars(
  frame: SurfaceFrame,
  metric: string,
  anchor: TimeAnchor,
): HeatData[] {
  const grid = frame.grids[metric];
  if (!grid || !frame.price_levels.length || !frame.time_steps.length) return [];
  const step = levelStep(frame.price_levels);
  const bars: HeatData[] = [];
  for (let ti = 0; ti < frame.time_steps.length; ti++) {
    const cells: HeatCell[] = frame.price_levels.map((lvl, li) => ({
      low: lvl - step / 2,
      high: lvl + step / 2,
      amount: grid[li]?.[ti] ?? 0,
    }));
    bars.push({ time: anchor(frame.time_steps[ti]), cells });
  }
  return bars;
}

/**
 * Filter a frame's price_levels (and each metric grid's rows) to spot ± q.
 * Mirrors quanted's range slider: it narrows the painted band without touching the data.
 * Returns the frame unchanged when q ≤ 0 or the window would be empty.
 */
export function filterFrameToRange(frame: SurfaceFrame, spot: number, q: number): SurfaceFrame {
  if (q <= 0 || !frame.price_levels.length) return frame;
  const lo = spot - q;
  const hi = spot + q;
  const keep: number[] = [];
  for (let i = 0; i < frame.price_levels.length; i++) {
    if (frame.price_levels[i] >= lo && frame.price_levels[i] <= hi) keep.push(i);
  }
  if (keep.length === 0) return frame;
  const grids: { [metric: string]: number[][] } = {};
  for (const [m, grid] of Object.entries(frame.grids)) {
    grids[m] = keep.map((i) => grid[i] ?? []);
  }
  return { ...frame, price_levels: keep.map((i) => frame.price_levels[i]), grids };
}

// ─── Session-flow rebase math (SessionFlowPane) ─────────────────────────────

export interface SessionPoint {
  t: string; // "HH:MM"
  call: number; // cumulative net call premium at t
  put: number; // cumulative net put premium at t (typically ≤ 0)
}

/**
 * Convert a cumulative series to per-minute increments (first point kept as-is).
 * The tide payload carries CUMULATIVE ncp/npp; the "per-min" toggle differences them.
 */
export function toPerMinute(series: SessionPoint[]): SessionPoint[] {
  if (series.length === 0) return [];
  const out: SessionPoint[] = [{ ...series[0] }];
  for (let i = 1; i < series.length; i++) {
    out.push({
      t: series[i].t,
      call: series[i].call - series[i - 1].call,
      put: series[i].put - series[i - 1].put,
    });
  }
  return out;
}

/**
 * Off-open rebase: subtract the 9:30 open value from every point so the series reads
 * "Δ since the open". The first point becomes 0/0 by construction. No-op on empty input.
 * (Quanted's "off open" toggle on the Net Delta / Premium Flow panes.)
 */
export function rebaseOffOpen(series: SessionPoint[]): SessionPoint[] {
  if (series.length === 0) return [];
  const base = series[0];
  return series.map((p) => ({ t: p.t, call: p.call - base.call, put: p.put - base.put }));
}

/** Absolute value of both legs (quanted's "absolute" toggle — magnitude comparison). */
export function toAbsolute(series: SessionPoint[]): SessionPoint[] {
  return series.map((p) => ({ t: p.t, call: Math.abs(p.call), put: Math.abs(p.put) }));
}

export type SessionMode = "cumulative" | "permin";
export type SessionSide = "cp" | "calls" | "puts";

// ─── Strike-ladder hover: per-expiry breakdown (from the matrix cells) ──────────

export interface MatrixCell {
  strike: number;
  expiry: string;
  gex: number;
}

export interface ExpiryShare {
  exp: string;
  gex: number;
  share: number; // 0..1 of the strike's total |gex| across expiries
}

/**
 * Top-N per-expiry GEX shares for a strike, from the matrix cells (options_structure
 * .matrix). Zero/non-finite cells are dropped; shares are |gex| / Σ|gex| over the kept
 * cells and sum to 1. Returns [] when the matrix has no (matching) cells — the caller
 * then omits the breakdown rather than fabricating it. Powers the ladder hover popover.
 */
export function topExpiriesForStrike(
  cells: MatrixCell[] | null | undefined,
  strike: number,
  n = 3,
): ExpiryShare[] {
  if (!cells || cells.length === 0) return [];
  const rows = cells.filter(
    (c) => c.strike === strike && Number.isFinite(c.gex) && c.gex !== 0,
  );
  if (rows.length === 0) return [];
  const totalAbs = rows.reduce((s, c) => s + Math.abs(c.gex), 0) || 1;
  return rows
    .map((c) => ({ exp: c.expiry, gex: c.gex, share: Math.abs(c.gex) / totalAbs }))
    .sort((a, b) => Math.abs(b.gex) - Math.abs(a.gex))
    .slice(0, n);
}

/**
 * Compose the display series from the raw cumulative series under the pane's toggles,
 * in a fixed order: per-min differencing → off-open rebase → absolute. (Rebase-then-abs
 * matches the panes: "Δ off open", then optionally its magnitude.)
 */
export function composeSessionSeries(
  cumulative: SessionPoint[],
  opts: { mode: SessionMode; offOpen: boolean; absolute: boolean },
): SessionPoint[] {
  let s = opts.mode === "permin" ? toPerMinute(cumulative) : cumulative.map((p) => ({ ...p }));
  if (opts.offOpen) s = rebaseOffOpen(s);
  if (opts.absolute) s = toAbsolute(s);
  return s;
}
