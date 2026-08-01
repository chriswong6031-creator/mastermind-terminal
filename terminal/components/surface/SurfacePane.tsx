"use client";
/**
 * SurfacePane — the flagship "paint surface": intraday price candles over a premium-flow
 * heat field, driven by the replay spine.
 *
 * Data:
 *   - surface_idx:{ROOT}  → seeds the replay stamps (once per root)
 *   - surface:{ROOT}:{STAMP} → the realized-so-far field for the scrubbed time
 *   - /api/intraday?sym={ROOT}&tf={agg}m&date={session} → selected-session candles
 *
 * When the replay is on an ARCHIVED session the first two swap to their date-keyed twins
 * (surface_idx_at / surface_at). Candles request that same date from the deep intraday
 * store; the client filters defensively too. Drawing a year of price history under one
 * session's field flattened the candles and reduced the field to a sliver, while drawing
 * today's price under a past field would be a point-in-time lie.
 *
 * Rendering: HeatSeries custom-series (lib/heatSeries) paints the field; a candlestick
 * series draws price on top. The shader's pos/neg RGB are resolved from --up/--down at
 * mount and re-resolved on theme / data-updown change (MutationObserver) — never a
 * hardcoded direction hex.
 *
 * Controls: metric tabs (Net Prem active; Gamma/Vanna/Charm disabled-with-tooltip),
 * candle interval 1m/5m/15m, opacity slider, strike-range slider (filters price_levels to spot±q),
 * Fit price / Fit strikes, crosshair readout pill top-left (Strike · metric · value),
 * as-of + cadence stamp bottom-right. Empty state: honest "No surface data yet — accruing."
 *
 * Y axis: the field spans every strike in range (hundreds of points) while price spans a
 * few dollars of it, and both share ONE price scale — so the default window is anchored to
 * the CANDLE extent (priceWindow) and the field is allowed to overflow past the pane.
 * Anchoring on the strikes, which is what this pane used to do, left price as a ~12px
 * hairline. "Fit strikes" restores the whole field; shift+wheel (or wheel over the price
 * gutter) zooms continuously between them.
 */

import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  createChart,
  CandlestickSeries,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type Time,
} from "lightweight-charts";
import { useLang } from "@/lib/i18n";
import { flowGet } from "@/lib/flowClientCache";
import {
  HeatSeries,
  heatShade,
  resolveMetricColors,
  type HeatData,
  type HeatSeriesOptions,
  type Rgb,
} from "@/lib/heatSeries";
import {
  buildHeatBars,
  filterFrameToRange,
  gridMaxAbs,
  isSurfaceFrame,
  isSurfaceIndex,
  metricEnabled,
  observedSurfaceCadenceSec,
  type SurfaceFrame,
  type MatrixCell,
} from "@/lib/surfaceContract";
import { filterBarsToSessionDate, sessionEpoch, type Bar6 } from "@/lib/intradayShared";
import { useReplay } from "./replayContext";
import { StrikeEvolutionModal } from "./StrikeEvolutionModal";
import { makeSurfaceT } from "./surfaceStrings";
import type { SurfaceKey } from "./surfaceStrings";
import { useSurfaceSync } from "./surfaceSync";
import type { SurfacePin } from "./surfacePins";

// ─── Config ─────────────────────────────────────────────────────────────────

// Metric identity === the snapshot grid key. Gamma's grid key is `gex` (matches the macro
// lane's grids:{gex,dex,vanna,charm}); the tab is labelled "Gamma". Enablement is
// feature-detected per-frame (metricEnabled) — a greek tab is live ONLY when the loaded
// snapshot carries its grid, otherwise disabled-with-tooltip ("accruing").
type Metric = "netprem" | "gex" | "vanna" | "charm";
const METRICS: { key: Metric; labelKey: SurfaceKey }[] = [
  { key: "netprem", labelKey: "metricNetPrem" },
  { key: "gex", labelKey: "metricGamma" },
  { key: "vanna", labelKey: "metricVanna" },
  { key: "charm", labelKey: "metricCharm" },
];

const AGGS: { min: number; labelKey: SurfaceKey }[] = [
  { min: 1, labelKey: "agg1m" },
  { min: 5, labelKey: "agg5m" },
  { min: 15, labelKey: "agg15m" },
  { min: 30, labelKey: "agg30m" },
];

// Range slider stops (± strikes/points around spot); 0 = All. Eighty points keeps the
// field contextual without letting remote LEAPS strikes flatten the useful chart.
const RANGE_STOPS = [20, 40, 80, 0];

/**
 * The CSS custom properties each metric's swatches read — the same pair the shader
 * resolves (lib/heatSeries METRIC_COLOR_VARS) and the same pair the theme engine writes
 * (components/surface/surfaceTheme METRIC_VAR). Keeping the legend/badge on these vars is
 * what makes a preset switch recolour the chrome and the field together.
 */
const METRIC_CSS: Record<Metric, { pos: string; neg: string }> = {
  netprem: { pos: "--metric-netprem-pos", neg: "--metric-netprem-neg" },
  gex: { pos: "--metric-gamma-pos", neg: "--metric-gamma-neg" },
  vanna: { pos: "--metric-vanna-pos", neg: "--metric-vanna-neg" },
  charm: { pos: "--metric-charm-pos", neg: "--metric-charm-neg" },
};

function css(n: string): string {
  if (typeof document === "undefined") return "";
  return getComputedStyle(document.documentElement).getPropertyValue(n).trim();
}

function fmtDollarSigned(v: number): string {
  const s = v < 0 ? "-" : "+";
  const a = Math.abs(v);
  if (a >= 1e9) return `${s}$${(a / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${s}$${(a / 1e3).toFixed(1)}K`;
  return `${s}$${a.toFixed(0)}`;
}

/** ISO asof → "HH:MM ET" in America/New_York (empty when absent). */
function fmtAsofLabel(asof: string | undefined): string {
  if (!asof) return "";
  try {
    return new Date(asof).toLocaleTimeString("en-US", {
      hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/New_York",
    }) + " ET";
  } catch { return asof.slice(11, 16); }
}

/** Human-sized observed gap, without implying more precision than the snapshots carry. */
function fmtObservedCadence(seconds: number): string {
  if (seconds >= 60) {
    const minutes = seconds / 60;
    return `${Number.isInteger(minutes) ? minutes.toFixed(0) : minutes.toFixed(1)}m`;
  }
  return `${Math.round(seconds)}s`;
}

// ─── Y-axis framing ──────────────────────────────────────────────────────────
// The heat field and the candles share ONE price scale, and the field is two orders of
// magnitude taller than a session's price range (SPY: strikes 663-823 under a $743 spot
// that moves ~$5). Framing the axis on the strike extent — the only behaviour this pane
// had — left price as a ~12px hairline. The default window is therefore anchored to
// PRICE; strike rows outside it are simply clipped by the pane, which is the honest
// trade (the field is context, price is the subject). "Fit strikes" restores the whole
// field on demand, and the wheel/drag zoom moves between them continuously.

/** Zoom-out factor applied per wheel notch (its reciprocal zooms in). */
const Y_WHEEL_STEP = 1.12;
/** Narrowest / widest y window a wheel zoom may produce — stops a runaway scroll. */
const Y_SPAN_MIN = 0.05;
const Y_SPAN_MAX = 100_000;
/** Minimum hit width of the right price gutter, for the wheel-over-axis gesture. */
const Y_AXIS_HIT_MIN = 44;

export type SurfaceTimeWindow = "surface" | "session";

/**
 * A readable x-window around the timestamps the surface actually contains. A sparse live
 * field should occupy the chart instead of being compressed into the left edge of a full
 * 6.5-hour canvas. Twelve minutes of context on either side preserves price lead-in and
 * follow-through; a one-frame field still receives a useful 60-minute window.
 */
function observedTimeWindow(date: string, steps: string[]): { from: Time; to: Time } | null {
  if (!date || !steps.length) return null;
  const epochs = steps.map((s) => sessionEpoch(date, s)).filter((v) => Number.isFinite(v));
  if (!epochs.length) return null;
  const first = epochs[0];
  const last = epochs[epochs.length - 1];
  const context = 12 * 60;
  const minimum = 60 * 60;
  let from = first - context;
  let to = last + context;
  if (to - from < minimum) {
    const extra = (minimum - (to - from)) / 2;
    from -= extra;
    to += extra;
  }
  return { from: from as Time, to: to as Time };
}

/**
 * The PRICE-anchored window: the extent of the candles that will actually be drawn,
 * padded so price occupies ~37% of the pane and the field overflows around it. The caller
 * supplies bars already filtered to the selected session. Returns null when there is
 * nothing to anchor to (illiquid root or missing archive), which is the caller's cue to
 * fall back to the field window.
 */
function priceWindow(bars: Bar6[]): [number, number] | null {
  let lo = Infinity;
  let hi = -Infinity;
  for (const bar of bars) {
    if (Number.isFinite(bar[3]) && bar[3] < lo) lo = bar[3];
    if (Number.isFinite(bar[2]) && bar[2] > hi) hi = bar[2];
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi < lo) return null;
  const center = (lo + hi) / 2;
  // 0.8% floor: a dead-flat session must still get a readable band rather than a
  // magnified tick, and it keeps the field visible either side of price.
  const focus = Math.max(hi - lo, Math.abs(center) * 0.008);
  if (!(focus > 0)) return null;
  return [center - focus * 1.35, center + focus * 1.35];
}

/**
 * The FIELD window: every painted strike row plus a 5.5% margin. This was the only
 * framing before; it is now the no-candles fallback and the explicit "Fit strikes" chip.
 */
function strikeWindow(levels: number[], spot?: number | null): [number, number] | null {
  if (!levels.length) return null;
  let min = Infinity;
  let max = -Infinity;
  for (const v of levels) {
    if (!Number.isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  const span = Math.max(max - min, Math.max(2, Math.abs(spot ?? max) * 0.01));
  const padding = span * 0.055;
  return [min - padding, max + padding];
}

interface Readout { strike: number; value: number }

/** A hovered strike row: the level, its index, the active-metric value, all-greek values
 *  at the current stamp, and the screen point to anchor the popover to. */
interface StrikeHover {
  strike: number;
  strikeIdx: number;
  pctFromSpot: number | null;
  active: { key: Metric; value: number };
  others: { key: Metric; value: number }[]; // other metrics present in this frame's grids
  x: number; // clientX for the fixed popover
  y: number; // clientY
}

/** All greek grid keys we might surface, in a stable order (label mapping via METRICS). */
const GREEK_KEYS: Metric[] = ["gex", "vanna", "charm"];

export interface SurfacePaneProps {
  root?: string;
  /**
   * Quad-view cell: pin this pane to one metric and drop the metric tabs. The cell still
   * feature-detects — a greek the snapshot doesn't carry shows the same "accruing" state
   * the tab strip uses, rather than an empty chart with no explanation.
   */
  fixedMetric?: Metric;
  /** `cell` strips the controls row / honesty note (the quad's shared toolbar owns them). */
  chrome?: "full" | "cell";
  /** Identity for crosshair sync inside a quad. Ignored outside a SurfaceSyncProvider. */
  syncId?: string;
  /** Aggregation is lifted to the shared toolbar in quad mode. */
  aggMinOverride?: number;
  /**
   * Signature of the active surface theme. Colours are read from CSS custom properties, so
   * a theme change only needs a re-resolve + re-shade — this prop is the trigger. The chart
   * is never torn down for a recolour.
   */
  themeSig?: string;
  /** Pinned strike levels, drawn as price lines ("send to chart"). */
  pins?: SurfacePin[];
  onTogglePin?: (strike: number, metric: string, value: number | null) => void;
  /** X-axis framing is shared across single/quad layouts by SurfaceView. */
  timeWindow?: SurfaceTimeWindow;
  onTimeWindowChange?: (window: SurfaceTimeWindow) => void;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function SurfacePane({
  root = "SPY",
  fixedMetric,
  chrome = "full",
  syncId,
  aggMinOverride,
  themeSig,
  pins,
  onTogglePin,
  timeWindow = "surface",
  onTimeWindowChange,
}: SurfacePaneProps) {
  const { lang } = useLang();
  const t = makeSurfaceT(lang);
  const { state: replayState, dispatch, asOfStamp, live, sessionDate } = useReplay();
  const sync = useSurfaceSync();
  const isCell = chrome === "cell";

  // A quad cell is pinned to one metric by its parent; the full pane owns its own via the
  // tab strip. Deriving rather than mirroring into state keeps the two from drifting.
  const [metricState, setMetricState] = useState<Metric>("netprem");
  const metric: Metric = fixedMetric ?? metricState;
  const [aggMin, setAggMin] = useState<number>(5);
  const [opacity, setOpacity] = useState<number>(1);
  const [rangeQ, setRangeQ] = useState<number>(80);
  const [frame, setFrame] = useState<SurfaceFrame | null>(null);
  const [candles, setCandles] = useState<Bar6[]>([]);
  /** Session whose candle request has completed (including an honest empty response). */
  const [candleSession, setCandleSession] = useState<string | null>(null);
  const [readout, setReadout] = useState<Readout | null>(null);
  const [loading, setLoading] = useState(true);
  // Strike hover popover (RECON §4.2): the row under the crosshair + its screen anchor.
  const [hover, setHover] = useState<StrikeHover | null>(null);
  // Intraday-Evolution modal: the strike index it opened on (null = closed).
  const [modalIdx, setModalIdx] = useState<number | null>(null);
  // Per-strike-per-expiry cells for the modal's expiry breakdown (matrix payload; optional).
  const [matrixCells, setMatrixCells] = useState<MatrixCell[] | null>(null);

  const wrapRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const heatSeriesRef = useRef<ISeriesApi<"Custom"> | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const colorsRef = useRef<{ pos: Rgb; neg: Rgb }>(resolveMetricColors("netprem"));
  const frameRef = useRef<SurfaceFrame | null>(null);
  const metricRef = useRef<Metric>("netprem");
  const opacityRef = useRef<number>(1);
  const hoverIdxRef = useRef<number | null>(null); // latest hovered strike idx for click→modal
  // B9: the frame's time axis in display epochs, rebuilt ONCE per frame. The crosshair
  // handler used to construct one Date per session column on every mousemove (~390 for a
  // full 1-min day); it now binary-free scans this prebuilt array instead.
  const timeEpochsRef = useRef<number[]>([]);
  // The vertical viewport is set on first paint and when the user explicitly changes the
  // strike range. Replay frames and metric switches must not re-enable autoscale and crush
  // the useful strikes back into a thin line.
  const priceRangeKeyRef = useRef<string | null>(null);
  // The y window we last committed, mirrored here so the wheel zoom always has a base to
  // scale from. IPriceScaleApi.getVisibleRange is preferred when it answers (it also picks
  // up an axis DRAG), but it is not relied on — this ref is the fallback.
  const yDomainRef = useRef<[number, number]>([0, 0]);
  // The strike levels actually painted (post range-filter) — what "Fit strikes" fits to.
  const levelsRef = useRef<number[]>([]);
  // The session's full stamp list, so the axis can be pinned to the WHOLE day.
  const stampsRef = useRef<string[]>([]);
  // Live price lines for pinned strikes, by pin id (send-to-chart).
  const pinLinesRef = useRef<Map<string, { series: ISeriesApi<"Candlestick"> | ISeriesApi<"Custom">; line: unknown }>>(new Map());
  // The crosshair handler is registered once at mount; reading sync through a ref keeps it
  // off the mount effect's dep list (and out of stale-closure territory).
  const syncRef = useRef({ sync, id: syncId });
  useEffect(() => { syncRef.current = { sync, id: syncId }; }, [sync, syncId]);
  useEffect(() => { metricRef.current = metric; }, [metric]);
  useEffect(() => { opacityRef.current = opacity; }, [opacity]);
  useEffect(() => { hoverIdxRef.current = hover?.strikeIdx ?? null; }, [hover]);
  const effAggMin = aggMinOverride ?? aggMin;
  // The route slices server-side so a single-session pane does not receive 20,000 deep
  // history bars. Keep the same filter client-side as a contract boundary: a stale CDN,
  // fixture, or older server must never be able to flatten this chart again.
  const candleSessionDate = frame?.session_date ?? null;
  const sessionCandles = useMemo(
    () => candleSessionDate ? filterBarsToSessionDate(candles, candleSessionDate) : [],
    [candles, candleSessionDate],
  );

  // Apply the shader to the heat series from the CURRENT frame/metric/opacity/colors.
  // Ref-backed (reads *Ref values) so the chart-mount effect and the MutationObserver
  // can call it without a declaration-order/stale-closure hazard.
  const applyShaderRef = useRef(() => {
    const heat = heatSeriesRef.current;
    if (!heat) return;
    const grid = frameRef.current?.grids[metricRef.current];
    const maxAbs = grid ? gridMaxAbs(grid) : 0;
    const { pos, neg } = colorsRef.current;
    const W = opacityRef.current;
    heat.applyOptions({
      cellShader: (amount: number) => heatShade(amount, maxAbs, pos, neg, W),
      opacity: W,
    } as Partial<HeatSeriesOptions>);
  });

  // Commit a y window. THE single writer of the price scale's visible range: every path
  // (first framing, the fit chips, the wheel zoom) goes through here so yDomainRef can
  // never drift from what is drawn. Returns false when the chart has not finished its
  // first layout — the caller then declines to commit its key and a later frame retries.
  const applyYRef = useRef((from: number, to: number): boolean => {
    const scale = chartRef.current?.priceScale("right");
    if (!scale || !Number.isFinite(from) || !Number.isFinite(to) || to <= from) return false;
    try {
      scale.setVisibleRange({ from, to });
      scale.setAutoScale(false);
      yDomainRef.current = [from, to];
      return true;
    } catch {
      return false;
    }
  });

  // The window a wheel zoom scales from. The live range when the API answers (so an axis
  // drag is respected), otherwise the last window we wrote.
  const readYRef = useRef((): [number, number] | null => {
    try {
      const r = chartRef.current?.priceScale("right").getVisibleRange();
      if (r && Number.isFinite(r.from) && Number.isFinite(r.to) && r.to > r.from) return [r.from, r.to];
    } catch {
      /* not available on this build — the mirror below is the contract */
    }
    const [lo, hi] = yDomainRef.current;
    return hi > lo ? [lo, hi] : null;
  });

  // ── Seed the replay stamps from the index (once per root/session) ────────────
  // An archived session reads its own dated index; today reads the legacy live path, which
  // is untouched. A dated index that comes back malformed (or empty) yields no stamps — the
  // bar says so rather than falling back to another day's frame list.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await flowGet(
        sessionDate ? `surface_idx_at:${root}:${sessionDate}` : `surface_idx:${root}`,
      );
      if (cancelled) return;
      if (isSurfaceIndex(data)) {
        dispatch({ type: "setStamps", stamps: data.stamps, keepHead: true });
      } else {
        dispatch({ type: "setStamps", stamps: [] });
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root, sessionDate]);

  // ── Fetch the frame for the scrubbed stamp ───────────────────────────────────
  // All state writes happen inside the async task (never synchronously in the effect
  // body) so the React Compiler doesn't flag a cascading-render setState.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!asOfStamp) {
        if (!cancelled) { setFrame(null); setLoading(false); }
        return;
      }
      setLoading(true);
      const data = await flowGet(
        sessionDate
          ? `surface_at:${root}:${sessionDate}:${asOfStamp}`
          : `surface:${root}:${asOfStamp}`,
      );
      if (cancelled) return;
      const nextFrame = isSurfaceFrame(data) ? data : null;
      setFrame(nextFrame);
      // If the active greek metric isn't carried by this frame, fall back to the premium
      // field (always present) so the pane never sits on a dead tab. Done here inside the
      // async task (with the frame write) rather than a separate setState-in-effect.
      // A quad cell is EXEMPT: its whole job is to hold one metric's slot, so an absent
      // greek must show the honest "accruing" state, not silently become a second
      // Net-Premium panel next to the real one.
      if (!fixedMetric && metricRef.current !== "netprem" && (!nextFrame || !metricEnabled(nextFrame, metricRef.current))) {
        setMetricState("netprem");
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [root, sessionDate, asOfStamp, fixedMetric]);

  useEffect(() => { frameRef.current = frame; }, [frame]);
  useEffect(() => { stampsRef.current = replayState.stamps ?? []; }, [replayState.stamps]);

  // B9: precompute the frame's column epochs once per frame. The crosshair handler reads
  // this array; it used to build a Date per column on every single mousemove.
  useEffect(() => {
    if (!frame || !frame.time_steps.length) { timeEpochsRef.current = []; return; }
    const date = frame.session_date ?? new Date().toISOString().slice(0, 10);
    timeEpochsRef.current = frame.time_steps.map((hhmm) => sessionEpoch(date, hhmm));
  }, [frame]);

  // ── Per-strike-per-expiry matrix (modal expiry breakdown; optional per root) ──
  // The matrix payload (options_structure.matrix) exists only for some roots — absent →
  // the modal simply omits the expiry-breakdown section rather than fabricating it.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await flowGet(`matrix:${root}`);
        if (cancelled) return;
        const raw = (data as { cells?: unknown })?.cells;
        if (!Array.isArray(raw)) { setMatrixCells(null); return; }
        const cells: MatrixCell[] = [];
        for (const c of raw) {
          if (!c || typeof c !== "object") continue;
          const rec = c as Record<string, unknown>;
          const strike = Number(rec.strike);
          const expiry = typeof rec.expiry === "string" ? rec.expiry : "";
          const gex = Number(rec.gex);
          if (Number.isFinite(strike) && expiry) cells.push({ strike, expiry, gex: Number.isFinite(gex) ? gex : 0 });
        }
        setMatrixCells(cells.length ? cells : null);
      } catch {
        if (!cancelled) setMatrixCells(null);
      }
    })();
    return () => { cancelled = true; };
  }, [root]);

  // ── Intraday candles (per agg) ───────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const date = frame?.session_date;
      if (!date) {
        if (!cancelled) { setCandles([]); setCandleSession(null); }
        return;
      }
      try {
        const r = await fetch(
          `/api/intraday?sym=${encodeURIComponent(root)}&tf=${effAggMin}m&date=${encodeURIComponent(date)}`,
          { cache: "no-store" },
        );
        if (!r.ok) {
          if (!cancelled) { setCandles([]); setCandleSession(date); }
          return;
        }
        const j = await r.json();
        if (!cancelled) {
          setCandles(Array.isArray(j?.bars) ? (j.bars as Bar6[]) : []);
          setCandleSession(date);
        }
      } catch {
        if (!cancelled) { setCandles([]); setCandleSession(date); }
      }
    })();
    return () => { cancelled = true; };
  }, [root, effAggMin, frame?.session_date]);

  // ── Chart lifecycle: create once, tear down on unmount ───────────────────────
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    // Captured for the cleanup closure — the Map identity is stable for the pane's life.
    const pinLines = pinLinesRef.current;

    const chart = createChart(el, {
      width: el.clientWidth || 800,
      height: el.clientHeight || 420,
      layout: { background: { color: "transparent" }, textColor: css("--muted") || "#868d9c", fontSize: 10, attributionLogo: false },
      grid: {
        vertLines: { color: css("--grid") || "rgba(255,255,255,0.04)" },
        horzLines: { color: css("--grid") || "rgba(255,255,255,0.04)" },
      },
      crosshair: {
        vertLine: { color: "rgba(214,218,227,.28)", labelBackgroundColor: css("--panel-3") || "#1a1d24" },
        horzLine: { color: "rgba(214,218,227,.28)", labelBackgroundColor: css("--panel-3") || "#1a1d24" },
      },
      rightPriceScale: { borderColor: css("--line") || "#242832", scaleMargins: { top: 0.06, bottom: 0.06 } },
      // fixLeftEdge: the replay truncates the series as you scrub back, and without this
      // Lightweight-Charts keeps the RIGHT edge anchored — so the shrinking day slides across
      // the pane instead of emptying out from the right. Pinning the left edge keeps 09:31
      // where it is and lets the session drain backwards, which is what a scrubber should do.
      timeScale: {
        borderColor: css("--line") || "#242832", timeVisible: true, secondsVisible: false,
        rightOffset: 3, fixLeftEdge: true,
      },
      // axisDoubleClickReset.price OFF: the default "reset" re-enables autoscale, which
      // autoscales to the UNION of the candles and the heat field — i.e. it restores the
      // full strike extent and squeezes price back into a hairline. There is nothing for
      // a price reset to restore here that "Fit price" / "Fit strikes" don't do honestly.
      // The time axis keeps its reset; the price axis keeps its press-drag scale.
      handleScale: {
        axisDoubleClickReset: { price: false, time: true },
        axisPressedMouseMove: { price: true, time: true },
        mouseWheel: true,
        pinch: true,
      },
    });
    chartRef.current = chart;

    const heat = chart.addCustomSeries(new HeatSeries(), {
      cellShader: () => "rgba(0,0,0,0)",
      opacity: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    } as Partial<HeatSeriesOptions>);
    heatSeriesRef.current = heat as ISeriesApi<"Custom">;

    // Resolved from the theme's directional tokens (East-Asian flip aware) — never a
    // hardcoded direction hex. css() reads :root, which always defines --up/--down.
    const up = css("--up");
    const down = css("--down");
    const candle = chart.addSeries(CandlestickSeries, {
      upColor: up, downColor: down,
      borderUpColor: up, borderDownColor: down,
      wickUpColor: up, wickDownColor: down,
      priceLineVisible: false, lastValueVisible: true,
    });
    candleSeriesRef.current = candle;

    // Crosshair readout: nearest strike level + its amount at the crosshair time.
    chart.subscribeCrosshairMove((param: MouseEventParams) => {
      const f = frameRef.current;
      if (!param.point || !f || !f.price_levels.length) {
        setReadout(null);
        setHover(null);
        const s0 = syncRef.current;
        if (s0.sync.active && s0.id) s0.sync.publish(s0.id, null);
        return;
      }
      // Map the crosshair Y → price via the price scale. Prefer the candle series, but fall
      // back to the heat series when candles are empty (fixture / illiquid roots) — they
      // share the right price scale, and the heat field always has data when a frame loads.
      const price = candle.coordinateToPrice(param.point.y) ?? heat.coordinateToPrice(param.point.y);
      if (price == null) { setReadout(null); setHover(null); return; }
      // nearest strike level to the crosshair price
      let li = 0, best = Infinity;
      for (let i = 0; i < f.price_levels.length; i++) {
        const d = Math.abs(f.price_levels[i] - price);
        if (d < best) { best = d; li = i; }
      }
      // nearest time column to the crosshair time — scans the epochs precomputed on the
      // frame effect (B9: this loop used to allocate a Date per column per mousemove).
      const grid = f.grids[metricRef.current];
      let ti = (grid?.[li]?.length ?? 1) - 1;
      const timeSec = typeof param.time === "number" ? (param.time as number) : null;
      const epochs = timeEpochsRef.current;
      if (timeSec != null && epochs.length) {
        let bestT = Infinity;
        for (let k = 0; k < epochs.length; k++) {
          const d = Math.abs(epochs[k] - timeSec);
          if (d < bestT) { bestT = d; ti = k; }
        }
      }
      const value = grid?.[li]?.[ti] ?? 0;
      const strike = f.price_levels[li];
      setReadout({ strike, value });

      // Quad: broadcast the pointer so the other three fields light the same strike-minute.
      const s = syncRef.current;
      if (s.sync.active && s.id && timeSec != null) {
        s.sync.publish(s.id, { time: timeSec, price: strike });
      }

      // Strike hover popover: active-metric value + any other greek grids present, at this
      // stamp. Anchored to the wrapper's client rect (fixed layer → no overflow clipping).
      const others: { key: Metric; value: number }[] = [];
      for (const k of GREEK_KEYS) {
        if (k === metricRef.current) continue;
        const g2 = f.grids[k];
        if (metricEnabled(f, k) && g2?.[li]) others.push({ key: k, value: g2[li][ti] ?? 0 });
      }
      const rect = el.getBoundingClientRect();
      const spot = f.spot;
      setHover({
        strike,
        strikeIdx: li,
        pctFromSpot: spot != null && spot !== 0 ? ((strike - spot) / spot) * 100 : null,
        active: { key: metricRef.current, value },
        others,
        x: rect.left + param.point.x,
        y: rect.top + param.point.y,
      });
    });

    // Click a strike → open the Intraday-Evolution modal for the hovered strike row.
    chart.subscribeClick((param: MouseEventParams) => {
      if (!param.point) return;
      const idx = hoverIdxRef.current;
      if (idx != null) setModalIdx(idx);
    });

    const ro = new ResizeObserver(() => {
      if (el && chartRef.current) {
        chartRef.current.applyOptions({ width: el.clientWidth, height: el.clientHeight });
      }
    });
    ro.observe(el);

    // Y zoom. Lightweight-Charts spends the wheel on the TIME axis and leaves the price
    // axis with nothing but an undiscoverable gutter drag — on a field this tall that is
    // the difference between reading price and guessing at it. Wheel over the price
    // gutter, or shift+wheel anywhere, scales the price window around the pointer.
    //
    // CAPTURE phase + stopPropagation: the library's own wheel handler lives on the chart
    // widget element INSIDE this container and ignores modifiers, so a bubble-phase
    // listener would arrive after the time axis had already zoomed. Claiming the event on
    // the way down is what keeps the two gestures separate.
    const onWheel = (e: WheelEvent) => {
      const rect = el.getBoundingClientRect();
      let gutter = Y_AXIS_HIT_MIN;
      try { gutter = Math.max(Y_AXIS_HIT_MIN, chartRef.current?.priceScale("right").width() ?? 0); } catch {}
      const overAxis = e.clientX > rect.right - gutter;
      if (!overAxis && !e.shiftKey) return; // plain wheel over the field keeps time zoom
      // macOS reports a shift-held wheel on the X axis, so read whichever one moved —
      // otherwise shift+wheel would fall through and SCROLL the chart sideways.
      const delta = e.deltaY !== 0 ? e.deltaY : e.deltaX;
      if (delta === 0) return;
      const domain = readYRef.current();
      if (!domain) return;
      const [lo, hi] = domain;
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
      const y = e.clientY - rect.top;
      const anchor =
        candleSeriesRef.current?.coordinateToPrice(y) ??
        heatSeriesRef.current?.coordinateToPrice(y) ??
        (lo + hi) / 2;
      const k = delta > 0 ? Y_WHEEL_STEP : 1 / Y_WHEEL_STEP;
      const from = anchor - (anchor - lo) * k;
      const to = anchor + (hi - anchor) * k;
      const span = to - from;
      if (span < Y_SPAN_MIN || span > Y_SPAN_MAX) return;
      applyYRef.current(from, to);
    };
    el.addEventListener("wheel", onWheel, { passive: false, capture: true });

    // Re-resolve shader colors on theme / data-updown flips. Resolve against the pane
    // element so the .obs-scoped greek pair vars (vanna/charm) are seen — not just :root.
    const mo = new MutationObserver(() => {
      colorsRef.current = resolveMetricColors(metricRef.current, el);
      applyShaderRef.current();
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-updown", "class"] });

    return () => {
      ro.disconnect();
      mo.disconnect();
      el.removeEventListener("wheel", onWheel, { capture: true });
      try { chart.remove(); } catch {}
      chartRef.current = null;
      heatSeriesRef.current = null;
      candleSeriesRef.current = null;
      // The removed chart took its price lines with it; drop the handles so a remount
      // re-creates them from `pins` instead of holding references to a dead chart.
      pinLines.clear();
    };
  }, []);

  // ── Push heat bars + candles when data / controls change ────────────────────
  useEffect(() => {
    const heat = heatSeriesRef.current;
    if (!heat) return;
    colorsRef.current = resolveMetricColors(metric, wrapRef.current);

    if (!frame || !frame.grids[metric]) {
      heat.setData([]);
      return;
    }
    const date = frame.session_date ?? new Date().toISOString().slice(0, 10);
    // B11: the DISPLAY-EPOCH convention every intraday series on this axis uses (see
    // lib/intradayShared sessionEpoch). Anchoring to the true UTC instant instead put the
    // field 4h (EDT) to the right of its own candles and labelled the 09:31 column "13:31".
    const anchor = (hhmm: string): Time => sessionEpoch(date, hhmm) as unknown as Time;
    const shown = rangeQ > 0 && frame.spot != null ? filterFrameToRange(frame, frame.spot, rangeQ) : frame;
    const bars: HeatData[] = buildHeatBars(shown, metric, anchor);
    heat.setData(bars);
    applyShaderRef.current();
    const levelValues = shown.price_levels.filter((v) => Number.isFinite(v));
    levelsRef.current = levelValues;
    // `sessionCandles.length` is in the key so the window is (re)computed once the bars actually
    // arrive — the first pass runs with an empty array and would otherwise lock in the
    // candle-less fallback for the session. Nothing else in the key moves on a replay
    // scrub or a metric switch, so a scrub still cannot yank the user's zoom.
    const rangeKey = `${root}:${frame.session_date ?? ""}:${rangeQ}:${sessionCandles.length}`;
    if (levelValues.length > 0 && priceRangeKeyRef.current !== rangeKey) {
      // Price first, field second. The bars are already pinned to this frame's session.
      const win = priceWindow(sessionCandles) ?? strikeWindow(levelValues, frame.spot);
      // A failed apply leaves the key uncommitted on purpose: the chart may still be
      // completing its first layout, and a later frame retries.
      if (win && applyYRef.current(win[0], win[1])) priceRangeKeyRef.current = rangeKey;
    }
  }, [frame, metric, rangeQ, root, sessionCandles, candleSession]);

  // Re-apply the shader when opacity changes (data unchanged).
  useEffect(() => { applyShaderRef.current(); }, [opacity]);

  // ── Theme engine: recolour in place, no remount ─────────────────────────────
  // The pane's colours come from CSS custom properties, and the theme writes those onto an
  // ancestor. Custom properties inherit, so by the time this effect runs the new values are
  // already computed on our element — re-resolving and re-shading is the whole update. The
  // chart, its data and the user's zoom all survive a palette change untouched.
  useEffect(() => {
    if (!heatSeriesRef.current) return;
    colorsRef.current = resolveMetricColors(metricRef.current, wrapRef.current);
    applyShaderRef.current();
  }, [themeSig]);

  // ── Quad crosshair sync: mirror a sibling cell's pointer ────────────────────
  useEffect(() => {
    if (!sync.active || !syncId) return;
    return sync.subscribe(syncId, (pos) => {
      const chart = chartRef.current;
      const target = candleSeriesRef.current ?? heatSeriesRef.current;
      if (!chart || !target) return;
      try {
        if (pos) chart.setCrosshairPosition(pos.price, pos.time as unknown as Time, target);
        else chart.clearCrosshairPosition();
      } catch {
        /* the sibling may be on a time the chart hasn't painted — ignore, don't crash */
      }
    });
  }, [sync, syncId]);

  // ── Pinned strike levels → price lines (send to chart) ──────────────────────
  // Reconciled against the incoming pin list: add what's new, drop what's gone. The line is
  // attached to the candle series when candles exist and to the heat series otherwise —
  // they share the right price scale, so the level lands in the same place either way, and
  // a root with no candle data (illiquid, or fixture) still gets its pins drawn.
  useEffect(() => {
    const host = candleSeriesRef.current ?? heatSeriesRef.current;
    if (!host) return;
    const want = new Map((pins ?? []).map((p) => [p.id, p]));
    const drawn = pinLinesRef.current; // NOT the replay `live` flag — different thing

    for (const [id, rec] of drawn) {
      if (want.has(id)) continue;
      try { (rec.series as unknown as { removePriceLine: (l: unknown) => void }).removePriceLine(rec.line); } catch {}
      drawn.delete(id);
    }
    for (const [id, pin] of want) {
      if (drawn.has(id)) continue;
      try {
        const line = (host as unknown as { createPriceLine: (o: unknown) => unknown }).createPriceLine({
          price: pin.strike,
          color: css("--signal") || "#e8b339",
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: String(pin.strike),
        });
        drawn.set(id, { series: host, line });
      } catch {
        /* LWC rejected the level (no price scale yet) — the chip still lists it */
      }
    }
  }, [pins]);

  // Candles → chart.
  // PIT: the heat field is server-truncated to the scrubbed stamp, so the candles must stop
  // there too. Leaving the full session drawn under a replayed field showed price the user
  // could not have known yet — the same class of point-in-time lie as B4's expiry panel,
  // and a much louder one. At the head of the LIVE session nothing is cut.
  useEffect(() => {
    const candle = candleSeriesRef.current;
    if (!candle) return;
    if (!sessionCandles.length) { candle.setData([]); return; }
    const date = frame?.session_date;
    let cutoff = Infinity;
    if (!live && asOfStamp && date && asOfStamp.length >= 4) {
      const e = sessionEpoch(date, `${asOfStamp.slice(0, 2)}:${asOfStamp.slice(2, 4)}`);
      if (Number.isFinite(e)) cutoff = e;
    }
    const kept = sessionCandles.filter((b, i, arr) => i === 0 || b[0] !== arr[i - 1][0]);
    const data = kept
      .filter((b) => b[0] <= cutoff)
      .map((b) => ({ time: b[0] as unknown as Time, open: b[1], high: b[2], low: b[3], close: b[4] }));
    // Keep the time axis on the WHOLE session by padding the cut tail with whitespace points.
    // This is half of a pair: the padding extends the scale to 15:56, and `fixLeftEdge` on the
    // time scale stops Lightweight-Charts re-anchoring the shorter series to the right edge.
    // Without BOTH, scrubbing back slides the whole day across the pane. With them, the
    // gridlines never move and the session simply drains backwards, leaving the right-hand
    // side blank — which reads honestly as "not known at this moment".
    // (Padding the custom heat series instead does not hold the scale; the built-in
    // candlestick series does, so the whitespace lives here.)
    const tail = kept.filter((b) => b[0] > cutoff).map((b) => ({ time: b[0] as unknown as Time }));
    candle.setData([...data, ...tail] as Parameters<typeof candle.setData>[0]);
  }, [sessionCandles, live, asOfStamp, frame?.session_date]);

  // ── X framing: observed field vs full selected session ──────────────────────
  // Surface is a session-native view, not a generic daily chart. The default follows the
  // time span the field actually covers; this is what keeps a sparse 10-frame live field
  // readable on a phone. Full session remains one click away for open-to-close context.
  // Replaying a frame intentionally advances the observed window. The session mode only
  // fits after its candle request resolves, so an early field response cannot lock the axis
  // to a partial range.
  useEffect(() => {
    const chart = chartRef.current;
    const date = frame?.session_date;
    if (!chart || !date) return;
    if (timeWindow === "surface") {
      const window = observedTimeWindow(date, frame.time_steps);
      if (window) chart.timeScale().setVisibleRange(window);
      return;
    }
    if (sessionCandles.length > 0 || candleSession === date) chart.timeScale().fitContent();
  }, [timeWindow, frame?.session_date, frame?.time_steps, sessionCandles.length, candleSession]);

  // ── Stamps / labels ──────────────────────────────────────────────────────────
  // Plain computations — the React Compiler auto-memoizes; a manual useMemo here trips
  // preserve-manual-memoization (its inferred deps differ from the hand-written ones).
  const asofLabel = fmtAsofLabel(frame?.asof);
  const snapshotCount = frame?.time_steps.length ?? 0;
  const observedCadenceSec = frame ? observedSurfaceCadenceSec(frame.time_steps) : null;
  const metricLabel = t(METRICS.find((m) => m.key === metric)?.labelKey ?? "metricNetPrem");
  const hasData = !!frame && !!frame.grids[metric] && frame.time_steps.length > 0;
  // A quad cell whose greek the snapshot doesn't carry: say "accruing" over the empty
  // field instead of leaving a blank rectangle with no explanation.
  const cellAccruing = isCell && !!fixedMetric && fixedMetric !== "netprem" && !metricEnabled(frame, fixedMetric);
  const pinnedHere = hover ? (pins ?? []).some((p) => p.strike === hover.strike) : false;

  // ── Y framing (explicit) ─────────────────────────────────────────────────────
  // Both chips write through applyYRef — the same single writer the automatic framing and
  // the wheel zoom use — so the mirrored domain can never drift from what is drawn.
  // "Fit price" is null (and the chip inert) when no candle will be drawn for this
  // session, which the aria-label says rather than leaving a dead control.
  // Memoized deliberately (B9 spirit): the crosshair re-renders this component on every
  // mousemove and this walks the whole session's bars — it must not ride along.
  const priceFit = useMemo(
    () => priceWindow(sessionCandles),
    [sessionCandles],
  );
  const fitPrice = () => { if (priceFit) applyYRef.current(priceFit[0], priceFit[1]); };
  const fitStrikes = () => {
    const win = strikeWindow(levelsRef.current, frame?.spot);
    if (win) applyYRef.current(win[0], win[1]);
  };

  return (
    <div style={PANE} className="obs-surf-pane">
      {/* Controls row — the quad's shared toolbar owns these in cell mode. */}
      {!isCell && (
      <div style={CONTROLS} className="obs-surf-controls">
        {/* Metric tabs — greek tabs feature-detect on the loaded frame's grids. */}
        <div style={GROUP} role="group" aria-label={t("metricLensAria")}>
          {METRICS.map((m) => {
            // netprem is always available (Wave-1 field); greeks light up only when the
            // loaded snapshot actually carries their grid.
            const enabled = m.key === "netprem" || metricEnabled(frame, m.key);
            return (
              <button
                key={m.key}
                className={`obs-chip${metric === m.key ? " on" : ""}`}
                style={{ ...CHIP, ...(enabled ? {} : DISABLED_CHIP) }}
                aria-pressed={metric === m.key}
                aria-disabled={!enabled}
                aria-label={enabled ? undefined : `${t(m.labelKey)} — ${t("metricAccruing")}`}
                onClick={() => enabled && setMetricState(m.key)}
              >
                {t(m.labelKey)}
                {!enabled && <span style={ACCRUING_DOT} aria-hidden>·</span>}
              </button>
            );
          })}
        </div>

        {/* X-axis framing. "Surface window" is the useful default for a sparse live field;
            "Full session" restores open-to-close context and makes manual pan/zoom useful. */}
        <div style={GROUP} role="group" aria-label={t("timeWindowAria")}>
          <span className="obs-lbl">{t("timeWindow")}</span>
          <button
            className={`obs-chip${timeWindow === "surface" ? " on" : ""}`}
            style={CHIP}
            aria-pressed={timeWindow === "surface"}
            aria-label={t("timeWindowSurfaceAria")}
            onClick={() => onTimeWindowChange?.("surface")}
          >
            {t("timeWindowSurface")}
          </button>
          <button
            className={`obs-chip${timeWindow === "session" ? " on" : ""}`}
            style={CHIP}
            aria-pressed={timeWindow === "session"}
            aria-label={t("timeWindowSessionAria")}
            onClick={() => onTimeWindowChange?.("session")}
          >
            {t("timeWindowSession")}
          </button>
        </div>

        {/* Candle interval. These controls never change or resample the field snapshots. */}
        <div style={GROUP} role="group" aria-label={t("aggAria")}>
          <span className="obs-lbl">{t("candleInterval")}</span>
          {AGGS.map((a) => (
            <button key={a.min} className={`obs-chip${effAggMin === a.min ? " on" : ""}`} style={CHIP}
              aria-pressed={effAggMin === a.min} onClick={() => setAggMin(a.min)}>
              {t(a.labelKey)}
            </button>
          ))}
        </div>

        {/* Opacity */}
        <label style={SLIDER_WRAP}>
          <span className="obs-lbl">{t("opacity")}</span>
          <input type="range" min={0} max={100} step={5} value={Math.round(opacity * 100)}
            aria-label={t("opacityAria")} style={SLIDER}
            onChange={(e) => setOpacity(Number(e.target.value) / 100)} />
          <span style={SLIDER_VAL} className="num">{Math.round(opacity * 100)}%</span>
        </label>

        {/* Strike range */}
        <label style={SLIDER_WRAP}>
          <span className="obs-lbl">{t("range")}</span>
          <input type="range" min={0} max={RANGE_STOPS.length - 1} step={1}
            value={Math.max(0, RANGE_STOPS.indexOf(rangeQ))}
            aria-label={t("strikeRangeAria")} style={SLIDER}
            onChange={(e) => setRangeQ(RANGE_STOPS[Number(e.target.value)])} />
          <span style={SLIDER_VAL} className="num">{rangeQ === 0 ? t("rangeAll") : `±${rangeQ}`}</span>
        </label>

      </div>
      )}

      {/* Compact data contract: three separate clocks, named where the user reads them.
          This replaces the giant amber paragraph and the on-canvas provenance sentence. */}
      {!isCell && (
        <div className="obs-surf-data-strip" role="status">
          <span className="obs-surf-data-item">
            <span className="obs-lbl">{t("dataStripSession")}</span>
            <strong className="num">{frame?.session_date ?? "—"}</strong>
          </span>
          <span className="obs-surf-data-item">
            <span className="obs-lbl">{t("dataStripSurface")}</span>
            <strong className="num">{snapshotCount} {t("observedFrames")}</strong>
            <span className="obs-surf-data-detail">
              {observedCadenceSec != null ? `· ~${fmtObservedCadence(observedCadenceSec)} ${t("observedCadence")}` : `· ${t("cadencePending")}`}
            </span>
          </span>
          <span className="obs-surf-data-item">
            <span className="obs-lbl">{t("dataStripPrice")}</span>
            <strong className="num">{effAggMin}m {t("candleInterval").toLowerCase()}</strong>
          </span>
          <span className="obs-surf-observed-badge">
            <span className="obs-live-dot" aria-hidden />
            {t("observedOnly")}
          </span>
          <span className="obs-surf-data-legend">
            <span style={LEGEND_ITEM}><span style={{ ...SWATCH, background: `var(${METRIC_CSS[metric].pos})` }} /><span className="obs-lbl">{t("legendPos")}</span></span>
            <span style={LEGEND_ITEM}><span style={{ ...SWATCH, background: `var(${METRIC_CSS[metric].neg})` }} /><span className="obs-lbl">{t("legendNeg")}</span></span>
          </span>
          <span className="obs-surf-data-source">{t("sourceOpra")}</span>
        </div>
      )}

      {/* Chart area */}
      <div style={CHART_AREA} className="obs-surf-chart-area">
        <div ref={wrapRef} style={{ width: "100%", height: "100%" }} />

        {/* Y framing lives on the axis it changes, instead of wrapping the main toolbar.
            These are momentary reset actions, not modes. */}
        {!isCell && (
          <div className="obs-surf-yfit" role="group" aria-label={t("yFitAria")}>
            <span className="obs-lbl">Y</span>
            <button
              className="obs-chip"
              aria-disabled={!priceFit}
              aria-label={priceFit ? undefined : `${t("yFitPrice")} — ${t("yFitPriceNone")}`}
              onClick={fitPrice}
            >
              {t("yFitPrice")}
            </button>
            <button
              className="obs-chip"
              aria-disabled={!hasData}
              aria-label={hasData ? undefined : `${t("yFitStrikes")} — ${t("yFitStrikesNone")}`}
              onClick={fitStrikes}
            >
              {t("yFitStrikes")}
            </button>
          </div>
        )}

        {/* Quad cell: the metric name lives on the cell itself (no tab strip here). */}
        {isCell && (
          <div className="obs-lbl" style={CELL_BADGE}>
            <span style={{ ...SWATCH, background: `var(${METRIC_CSS[metric].pos})`, marginRight: 5 }} />
            {metricLabel}
            {cellAccruing && <span style={CELL_ACCRUING}>{t("quadAccruing")}</span>}
          </div>
        )}

        {/* Crosshair readout pill (top-left) */}
        {readout && hasData && (
          <div style={READOUT_PILL} className="num">
            <span style={{ color: "var(--muted)" }}>{t("strike")}</span>
            <span style={{ color: "var(--text)", fontWeight: 700 }}>{readout.strike}</span>
            <span style={{ color: "var(--muted)" }}>{metricLabel}</span>
            <span style={{ color: readout.value >= 0 ? "var(--up)" : "var(--down)", fontWeight: 700 }}>
              {fmtDollarSigned(readout.value)}
            </span>
          </div>
        )}

        {/* Empty / loading — never a bare "no data": the second line names WHICH of
            still-loading / greek-not-carried / nothing-painted-yet applies. */}
        {!hasData && (
          <div style={EMPTY}>
            <span style={EMPTY_TITLE}>
              {loading ? t("surfaceLoading") : cellAccruing ? t("metricAccruing") : t("surfaceEmpty")}
            </span>
            {!isCell && (
              <span style={EMPTY_WHY}>
                {loading ? t("surfaceLoadingWhy") : t("surfaceEmptyWhy")}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Strike hover popover (RECON §4.2) — fixed layer, never clipped by the chart. */}
      {hover && hasData && modalIdx == null && (
        <div
          className="obs-surf-pop"
          style={{
            left: Math.min(hover.x + 16, (typeof window !== "undefined" ? window.innerWidth : 1200) - 244),
            top: Math.max(8, hover.y - 30),
          }}
          role="tooltip"
        >
          <div className="obs-surf-pop-hd">
            <span className="obs-surf-pop-strike">{hover.strike}</span>
            {hover.pctFromSpot != null && (
              <span className="obs-surf-pop-pct">
                {hover.pctFromSpot >= 0 ? "+" : ""}{hover.pctFromSpot.toFixed(1)}% {t("popFromSpot")}
              </span>
            )}
          </div>
          <div className="obs-surf-pop-row">
            <span className="k">{metricLabel}</span>
            <span className="v" style={{ color: hover.active.value >= 0 ? "var(--up)" : "var(--down)" }}>
              {fmtDollarSigned(hover.active.value)}
            </span>
          </div>
          {hover.others.length > 0 && (
            <>
              <div className="obs-surf-pop-sep" />
              {hover.others.map((o) => (
                <div className="obs-surf-pop-row" key={o.key}>
                  <span className="k">{t(METRICS.find((m) => m.key === o.key)?.labelKey ?? "metricNetPrem")}</span>
                  <span className="v" style={{ color: o.value >= 0 ? "var(--up)" : "var(--down)" }}>
                    {fmtDollarSigned(o.value)}
                  </span>
                </div>
              ))}
            </>
          )}
          {/* Send to chart — pin this strike as a level line. Pointer events are on for
              this one control; the rest of the popover stays click-through. */}
          {onTogglePin && (
            <button
              type="button"
              className="obs-surf-pop-pin"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onTogglePin(hover.strike, hover.active.key, hover.active.value)}
              aria-pressed={pinnedHere}
            >
              {pinnedHere ? t("pinnedUnpin") : t("pinToChart")}
            </button>
          )}
          <div className="obs-surf-pop-hint">{t("popClickHint")}</div>
        </div>
      )}

      {/* Intraday-Evolution modal (RECON §4.2) */}
      {modalIdx != null && frame && (
        <StrikeEvolutionModal
          // The frame is ALREADY server-truncated to the scrubbed stamp, so its time_steps /
          // grid rows are the realized-so-far window — the modal's series is replay-aware by
          // construction (NOW = the last realized column). scrubbedTimeIdx=null = full frame.
          frame={frame}
          root={root}
          strikeIdx={modalIdx}
          metric={metric}
          metricLabel={metricLabel}
          scrubbedTimeIdx={null}
          matrixCells={matrixCells}
          asofLabel={asofLabel}
          lang={lang}
          // B4: the per-expiry matrix is ONE head-of-day fetch keyed on root, so it always
          // describes the present. Telling the modal whether the replay is at the head lets
          // it label that panel honestly instead of captioning present-time shares "at NOW"
          // over a scrubbed-back moment.
          replayLive={live}
          pinned={(pins ?? []).some((p) => p.strike === frame.price_levels[modalIdx])}
          onTogglePin={onTogglePin}
          onClose={() => setModalIdx(null)}
        />
      )}

    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const PANE: React.CSSProperties = { display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflow: "hidden" };

// 16px horizontal padding is the family's shared left rail (toolbar → controls → replay
// bar → session strip all stack on one vertical edge).
const CONTROLS: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: "var(--sp-3)", flexWrap: "wrap",
  padding: "var(--sp-2) var(--sp-4)", borderBottom: "1px solid var(--line)",
  background: "var(--panel)", flexShrink: 0,
};

const GROUP: React.CSSProperties = { display: "flex", gap: "var(--sp-1)", alignItems: "center" };

const CHIP: React.CSSProperties = {
  height: 28, minWidth: 34, justifyContent: "center",
  fontSize: "var(--fs-label)", fontWeight: 600, padding: "0 var(--sp-2)",
};

const DISABLED_CHIP: React.CSSProperties = { opacity: 0.4, cursor: "not-allowed" };

const ACCRUING_DOT: React.CSSProperties = { marginLeft: 3, color: "var(--signal)", fontWeight: 900 };

const SLIDER_WRAP: React.CSSProperties = { display: "flex", alignItems: "center", gap: "var(--sp-2)" };

const SLIDER: React.CSSProperties = { width: 64, height: 4, accentColor: "var(--brand)", cursor: "pointer" };

const SLIDER_VAL: React.CSSProperties = {
  fontSize: "var(--fs-micro)", color: "var(--text-2)", minWidth: 30,
  fontFamily: "var(--font-num)", fontVariantNumeric: "tabular-nums",
};

const LEGEND_ITEM: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: "var(--sp-1)" };

const SWATCH: React.CSSProperties = { display: "inline-block", width: 10, height: 8, borderRadius: 2 };

const CHART_AREA: React.CSSProperties = { position: "relative", flex: 1, minHeight: 260 };

const READOUT_PILL: React.CSSProperties = {
  position: "absolute", top: "var(--sp-3)", left: "var(--sp-3)", zIndex: 5,
  display: "flex", alignItems: "center", gap: "var(--sp-2)",
  padding: "5px var(--sp-3)", fontSize: "var(--fs-label)",
  background: "color-mix(in srgb, var(--panel) 88%, transparent)",
  border: "1px solid var(--line-2, var(--line))", borderRadius: "var(--r-tile)",
  backdropFilter: "blur(6px)", pointerEvents: "none",
  fontFamily: "var(--font-num)", fontVariantNumeric: "tabular-nums",
};

const EMPTY: React.CSSProperties = {
  position: "absolute", inset: 0,
  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
  gap: "var(--sp-2)", padding: "0 var(--sp-6)", textAlign: "center", pointerEvents: "none",
};

const EMPTY_TITLE: React.CSSProperties = {
  fontSize: "var(--fs-emph)", fontWeight: 600, color: "var(--text-2)",
};

const EMPTY_WHY: React.CSSProperties = {
  fontSize: "var(--fs-label)", lineHeight: 1.55, color: "var(--muted)", maxWidth: 440,
};

/** .obs-lbl supplies the micro-label type; only the pill chrome and the brighter
 *  on-canvas colour are set here (muted would sink into the heat field). */
const CELL_BADGE: React.CSSProperties = {
  position: "absolute", top: "var(--sp-2)", left: "var(--sp-2)", zIndex: 5,
  display: "inline-flex", alignItems: "center",
  color: "var(--text-2)", padding: "3px var(--sp-2)",
  background: "color-mix(in srgb, var(--panel) 82%, transparent)",
  borderRadius: "var(--r-tile)", pointerEvents: "none",
};

const CELL_ACCRUING: React.CSSProperties = {
  marginLeft: 6, color: "var(--signal)", fontWeight: 600, textTransform: "none", letterSpacing: 0,
};
