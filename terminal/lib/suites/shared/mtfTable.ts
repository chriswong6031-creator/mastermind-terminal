// MTF Dashboard — the shared TableSpec builder behind the three pane suites' `mtf` modules
// (pulse/mtfDash.ts, rsix/mtfDash.ts, macdx/mtfDash.ts).
//
// Contract: lib/indicator-canvas/types.ts (frozen — `TableSpec`, rendered as positioned DOM by
// ChartTables.tsx). Doctrine: lib/indicator-canvas/README.md. Masterplan §8.3 ("MTF Signals
// Dashboard") and §8.4 (RSI / MACD MTF dashboards).
//
// ─── The honesty problem this file exists to solve ────────────────────────────────────────────
//
// A vendor "MTF dashboard" implies six independent timeframe feeds. We have exactly ONE feed: the
// bars already loaded for the active timeframe. Every higher-timeframe column in our dashboards is a
// fixed-block RESAMPLE of those same bars (`oscUtils.resampleOhlcv`), which is a genuinely different
// thing:
//
//   - a 2× column on a 1D chart is a 2-day block anchored at the first loaded bar, NOT the exchange's
//     2-day candle, and definitely not a 1W feed;
//   - a block is only knowable once its LAST source bar has closed, so a higher-factor column is
//     structurally stale by up to (factor − 1) chart bars;
//   - a trailing PARTIAL block is dropped outright by `resampleOhlcv`, because an in-progress
//     aggregate mutates as bars arrive — which is the repaint the suite's non-repaint law forbids.
//
// So the columns are labelled by what they ARE — `chart`, `2×`, `4×` — never by a timeframe name we
// cannot honor, the footnote line is MANDATORY (`MtfTableOpts.footnote` is required, and a blank one
// is replaced by the canonical English sentence rather than dropped), and every cell carries a basis
// tip stating the block size and how many chart bars behind the column's last complete block sits
// (see {@link mtfBasisTip}).
//
// This module is pure presentation plumbing: no DOM, no CSS, no colors of its own (callers pass
// resolved `ctx.colors.*` strings), no wall clock, no randomness, no module-level mutable state.

import type { SuiteField, TableSpec } from "@/lib/indicator-canvas/types";

// ------------------------------------------------------------------------------------ the columns

/** Resample factors, in column order. 1 = the chart's own bars (identity resample). */
export const MTF_FACTORS = [1, 2, 4] as const;
export type MtfFactor = (typeof MTF_FACTORS)[number];

/** Column keys (stable, for the renderer) and the honest labels shown in the header row. */
export const MTF_COLUMN_KEYS = ["f1", "f2", "f4"] as const;
export const MTF_COLUMN_LABELS = ["chart", "2×", "4×"] as const;

/** Recency windows, in the COLUMN's own bars (i.e. blocks, not chart bars). */
export const MTF_SIGNAL_WINDOW = 30;
export const MTF_DIV_WINDOW = 40;

/** Rendered when a cell has nothing honest to say (warm-up, no print, nothing in the window). */
export const EM_DASH = "—";

/** Oldest in-window event still has to be readable, so recency fade tops out well below 1. */
const MAX_FADE = 0.7;
/** Dashboards are small by design; a runaway row list is a bug, not a feature. */
const MAX_ROWS = 8;

// --------------------------------------------------------------------------------- shared settings
// The three `mtf` modules expose an IDENTICAL two-field schema. Field labels stay plain English
// (registry precedent); only on-chart text takes ctx.lang.

export type MtfPos = TableSpec["pos"];

export const MTF_POS_OPTIONS: Array<{ v: string; label: string }> = [
  { v: "tl", label: "Top Left" },
  { v: "tr", label: "Top Right" },
  { v: "bl", label: "Bottom Left" },
  { v: "br", label: "Bottom Right" },
];

/** Sanitize the `pos` setting; anything unrecognized falls back to `d`. */
export function mtfPos(v: any, d: MtfPos = "br"): MtfPos {
  return v === "tl" || v === "tr" || v === "bl" || v === "br" ? v : d;
}

export function mtfBool(v: any, d: boolean): boolean {
  return typeof v === "boolean" ? v : d;
}

/** Fresh array per call — the settings UI must never share field objects between modules. */
export function mtfFields(): SuiteField[] {
  return [
    {
      key: "pos",
      label: "Position",
      type: "select",
      options: MTF_POS_OPTIONS.map((o) => ({ ...o })),
      tip: "Corner of the pane the dashboard is anchored to.",
    },
    {
      key: "compact",
      label: "Compact",
      type: "bool",
      tip: "Tighter rows and smaller type — use it when the pane is short.",
    },
  ];
}

export function mtfDefaults(pos: MtfPos = "br", compact = false): Record<string, any> {
  return { pos, compact };
}

// ------------------------------------------------------------------------------------- microcopy

/** The mandatory basis line. Callers pass it explicitly so the honesty is visible at the call site. */
export function mtfFootnote(lang: "en" | "zh"): string {
  return lang === "zh"
    ? "各列由已加载K线重采样得出，并非独立周期行情源。"
    : "Rows are resampled from the loaded bars — not independent timeframe feeds.";
}

const MTF_FOOTNOTE_EN = mtfFootnote("en");

/**
 * Per-column basis tip: block size plus how stale the column's last COMPLETE block is.
 *
 * @param factor  the column's resample factor
 * @param lagBars chart bars between the last complete block's final source bar and the last loaded
 *                bar — i.e. `(bars.length - 1) - lastSrc[groups.length - 1]`, always 0 when factor=1
 */
export function mtfBasisTip(factor: number, lagBars: number, lang: "en" | "zh"): string {
  const f = Math.max(1, Math.round(Number(factor) || 1));
  const lag = Math.max(0, Math.round(Number(lagBars) || 0));
  if (f <= 1) {
    return lang === "zh"
      ? "图表周期 · 每格 1 根K线（最后一根可能尚未收盘）"
      : "Chart timeframe · 1 bar per cell (the last bar may still be forming)";
  }
  return lang === "zh"
    ? `${f}× 重采样 · 每格 ${f} 根K线 · 最后一个完整分组落后 ${lag} 根`
    : `${f}× resample · ${f} chart bars per cell · last complete block sits ${lag} chart bar${lag === 1 ? "" : "s"} behind`;
}

/** "4 ago" / "4 根前"; 0 renders as "now" so a signal on the last block reads as current. */
export function mtfAgo(ago: number, lang: "en" | "zh"): string {
  const a = Math.max(0, Math.round(Number(ago) || 0));
  if (a === 0) return lang === "zh" ? "当前" : "now";
  return lang === "zh" ? `${a} 根前` : `${a} ago`;
}

/**
 * Recency fade for an event `ago` column-bars old inside a `window`-bar lookback: 0 at the newest,
 * MAX_FADE at the edge of the window. Linear and deterministic; out-of-window callers should render
 * EM_DASH rather than a fully faded cell.
 */
export function mtfFade(ago: number, window: number): number {
  const a = Number(ago);
  const w = Number(window);
  if (!Number.isFinite(a) || !Number.isFinite(w) || w <= 0) return 0;
  const r = a <= 0 ? 0 : a >= w ? 1 : a / w;
  return r * MAX_FADE;
}

/** Slope glyph for a value row — language-neutral, and it keeps a level from reading as a static fact. */
export function mtfSlope(cur: number, prev: number): string {
  if (!Number.isFinite(cur) || !Number.isFinite(prev) || cur === prev) return "·";
  return cur > prev ? "▲" : "▼";
}

// ----------------------------------------------------------------------------------- table shapes

export interface MtfCell {
  text: string;
  /** Resolved design-token color from `ctx.colors.*` — never a literal (README law 1). */
  color?: string;
  bg?: string;
  bold?: boolean;
  /** 0..1 recency fade; 0 = fresh. Use {@link mtfFade}. */
  fade?: number;
  /** title-attr tooltip — the place for the basis line and the numbers that did not fit. */
  tip?: string;
}

/** One dashboard row: a left header label plus one cell per entry of {@link MTF_FACTORS}. */
export interface MtfRow {
  label: string;
  cells: Array<MtfCell | null | undefined>;
}

export interface MtfTableOpts {
  /** Stable, GLOBALLY unique id — the host dedups tables by id (last writer wins). */
  id: string;
  pos: MtfPos;
  title?: string;
  compact?: boolean;
  rows: MtfRow[];
  /** MANDATORY honest-basis line; pass {@link mtfFootnote}. A blank string falls back to English. */
  footnote: string;
}

function sanCell(c: MtfCell | null | undefined): TableSpec["rows"][number]["cells"][number] {
  if (!c || typeof c !== "object") return { text: EM_DASH };
  const raw = typeof c.text === "string" ? c.text.trim() : "";
  const out: TableSpec["rows"][number]["cells"][number] = { text: raw || EM_DASH };
  if (typeof c.color === "string" && c.color) out.color = c.color;
  if (typeof c.bg === "string" && c.bg) out.bg = c.bg;
  if (c.bold === true) out.bold = true;
  const f = Number(c.fade);
  if (Number.isFinite(f) && f > 0) out.fade = f > 1 ? 1 : f;
  const tip = typeof c.tip === "string" ? c.tip.trim() : "";
  if (tip) out.tip = tip;
  return out;
}

/**
 * Assemble the dashboard TableSpec.
 *
 * The column set is FIXED (`chart` / `2×` / `4×`) — that is the whole contract: a caller cannot
 * relabel a resampled column as a timeframe it is not. Rows are padded/trimmed to the column count
 * so a short row can never shift cells under the wrong header, cells are sanitized (blank text →
 * EM_DASH, fade clamped to 0..1), and the footnote can never go missing.
 *
 * Pure: same opts in, same TableSpec out.
 */
export function buildMtfTable(o: MtfTableOpts): TableSpec {
  const columns = MTF_COLUMN_KEYS.map((key, k) => ({ key, label: MTF_COLUMN_LABELS[k] }));
  const src = Array.isArray(o?.rows) ? o.rows.slice(0, MAX_ROWS) : [];
  const rows: TableSpec["rows"] = src.map((r) => ({
    label: typeof r?.label === "string" && r.label.trim() ? r.label.trim() : EM_DASH,
    cells: columns.map((_, k) => sanCell(Array.isArray(r?.cells) ? r.cells[k] : null)),
  }));

  const foot = typeof o?.footnote === "string" && o.footnote.trim() ? o.footnote.trim() : MTF_FOOTNOTE_EN;
  const title = typeof o?.title === "string" && o.title.trim() ? o.title.trim() : undefined;

  const spec: TableSpec = {
    id: typeof o?.id === "string" && o.id.trim() ? o.id.trim() : "mtf",
    pos: mtfPos(o?.pos, "br"),
    columns,
    rows,
    footnote: foot,
  };
  if (title) spec.title = title;
  if (o?.compact === true) spec.compact = true;
  return spec;
}
