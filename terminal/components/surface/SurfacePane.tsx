"use client";
/**
 * SurfacePane — the flagship "paint surface": intraday price candles over a premium-flow
 * heat field, driven by the replay spine.
 *
 * Data:
 *   - surface_idx:{ROOT}  → seeds the replay stamps (once per root)
 *   - surface:{ROOT}:{STAMP} → the realized-so-far field for the scrubbed time
 *   - /api/intraday?sym={ROOT}&tf={agg}m → price candles (Bar6 tuples)
 *
 * Rendering: HeatSeries custom-series (lib/heatSeries) paints the field; a candlestick
 * series draws price on top. The shader's pos/neg RGB are resolved from --up/--down at
 * mount and re-resolved on theme / data-updown change (MutationObserver) — never a
 * hardcoded direction hex.
 *
 * Controls: metric tabs (Net Prem active; Gamma/Vanna/Charm disabled-with-tooltip),
 * agg 1m/5m/15m, opacity slider, strike-range slider (filters price_levels to spot±q),
 * crosshair readout pill top-left (Strike · metric · value), as-of + cadence stamp
 * bottom-right. Empty state: honest "No surface data yet — accruing."
 */

import React, {
  useEffect,
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
  type SurfaceFrame,
} from "@/lib/surfaceContract";
import { useReplay } from "./replayContext";
import { makeSurfaceT } from "./surfaceStrings";
import type { SurfaceKey } from "./surfaceStrings";

// ─── Config ─────────────────────────────────────────────────────────────────

type Metric = "netprem" | "gamma" | "vanna" | "charm";
const METRICS: { key: Metric; labelKey: SurfaceKey; enabled: boolean }[] = [
  { key: "netprem", labelKey: "metricNetPrem", enabled: true },
  { key: "gamma", labelKey: "metricGamma", enabled: false },
  { key: "vanna", labelKey: "metricVanna", enabled: false },
  { key: "charm", labelKey: "metricCharm", enabled: false },
];

const AGGS: { min: number; labelKey: SurfaceKey }[] = [
  { min: 1, labelKey: "agg1m" },
  { min: 5, labelKey: "agg5m" },
  { min: 15, labelKey: "agg15m" },
];

// Range slider stops (± strikes/points around spot); 0 = All.
const RANGE_STOPS = [10, 20, 40, 0];

type Bar6 = [number, number, number, number, number, number];

function css(n: string): string {
  if (typeof document === "undefined") return "";
  return getComputedStyle(document.documentElement).getPropertyValue(n).trim();
}

/** DST-aware US-Eastern offset suffix for a session date (mirrors OptionsHubView). */
function etOffsetSuffix(sessionDate: string): string {
  try {
    const noonUtc = new Date(`${sessionDate}T12:00:00Z`);
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York", hour12: false, timeZoneName: "shortOffset",
    }).formatToParts(noonUtc);
    const tz = parts.find((p) => p.type === "timeZoneName")?.value ?? "";
    const m = tz.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
    if (m) return `${m[1]}${m[2].padStart(2, "0")}:${m[3] ?? "00"}`;
  } catch {}
  return "-04:00";
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

interface Readout { strike: number; value: number }

// ─── Component ──────────────────────────────────────────────────────────────

export function SurfacePane({ root = "SPY" }: { root?: string }) {
  const { lang } = useLang();
  const t = makeSurfaceT(lang);
  const { dispatch, asOfStamp } = useReplay();

  const [metric, setMetric] = useState<Metric>("netprem");
  const [aggMin, setAggMin] = useState<number>(5);
  const [opacity, setOpacity] = useState<number>(1);
  const [rangeQ, setRangeQ] = useState<number>(0); // 0 = All
  const [frame, setFrame] = useState<SurfaceFrame | null>(null);
  const [candles, setCandles] = useState<Bar6[]>([]);
  const [readout, setReadout] = useState<Readout | null>(null);
  const [loading, setLoading] = useState(true);

  const wrapRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const heatSeriesRef = useRef<ISeriesApi<"Custom"> | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const colorsRef = useRef<{ pos: Rgb; neg: Rgb }>(resolveMetricColors("netprem"));
  const frameRef = useRef<SurfaceFrame | null>(null);
  const metricRef = useRef<Metric>("netprem");
  const opacityRef = useRef<number>(1);
  useEffect(() => { metricRef.current = metric; }, [metric]);
  useEffect(() => { opacityRef.current = opacity; }, [opacity]);

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

  // ── Seed the replay stamps from the index (once per root) ────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await flowGet(`surface_idx:${root}`);
      if (cancelled) return;
      if (isSurfaceIndex(data)) {
        dispatch({ type: "setStamps", stamps: data.stamps, keepHead: true });
      } else {
        dispatch({ type: "setStamps", stamps: [] });
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root]);

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
      const data = await flowGet(`surface:${root}:${asOfStamp}`);
      if (cancelled) return;
      setFrame(isSurfaceFrame(data) ? data : null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [root, asOfStamp]);

  useEffect(() => { frameRef.current = frame; }, [frame]);

  // ── Intraday candles (per agg) ───────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/intraday?sym=${encodeURIComponent(root)}&tf=${aggMin}m`, { cache: "no-store" });
        if (!r.ok) { if (!cancelled) setCandles([]); return; }
        const j = await r.json();
        if (!cancelled) setCandles(Array.isArray(j?.bars) ? (j.bars as Bar6[]) : []);
      } catch {
        if (!cancelled) setCandles([]);
      }
    })();
    return () => { cancelled = true; };
  }, [root, aggMin]);

  // ── Chart lifecycle: create once, tear down on unmount ───────────────────────
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

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
      timeScale: { borderColor: css("--line") || "#242832", timeVisible: true, secondsVisible: false, rightOffset: 3 },
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
      if (!param.point || !f || !f.price_levels.length) { setReadout(null); return; }
      const price = candle.coordinateToPrice(param.point.y);
      if (price == null) { setReadout(null); return; }
      // nearest strike level to the crosshair price
      let li = 0, best = Infinity;
      for (let i = 0; i < f.price_levels.length; i++) {
        const d = Math.abs(f.price_levels[i] - price);
        if (d < best) { best = d; li = i; }
      }
      // nearest time column to the crosshair time
      const grid = f.grids[metricRef.current];
      let ti = (grid?.[li]?.length ?? 1) - 1;
      const timeSec = typeof param.time === "number" ? (param.time as number) : null;
      const date = f.session_date ?? new Date().toISOString().slice(0, 10);
      if (timeSec != null && f.time_steps.length) {
        const off = etOffsetSuffix(date);
        let bestT = Infinity;
        for (let k = 0; k < f.time_steps.length; k++) {
          const [hh, mm] = f.time_steps[k].split(":").map(Number);
          const sec = Math.floor(new Date(`${date}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00${off}`).getTime() / 1000);
          const d = Math.abs(sec - timeSec);
          if (d < bestT) { bestT = d; ti = k; }
        }
      }
      const value = grid?.[li]?.[ti] ?? 0;
      setReadout({ strike: f.price_levels[li], value });
    });

    const ro = new ResizeObserver(() => {
      if (el && chartRef.current) {
        chartRef.current.applyOptions({ width: el.clientWidth, height: el.clientHeight });
      }
    });
    ro.observe(el);

    // Re-resolve shader colors on theme / data-updown flips.
    const mo = new MutationObserver(() => {
      colorsRef.current = resolveMetricColors(metricRef.current);
      applyShaderRef.current();
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-updown", "class"] });

    return () => {
      ro.disconnect();
      mo.disconnect();
      try { chart.remove(); } catch {}
      chartRef.current = null;
      heatSeriesRef.current = null;
      candleSeriesRef.current = null;
    };
  }, []);

  // ── Push heat bars + candles when data / controls change ────────────────────
  useEffect(() => {
    const heat = heatSeriesRef.current;
    if (!heat) return;
    colorsRef.current = resolveMetricColors(metric);

    if (!frame || !frame.grids[metric]) {
      heat.setData([]);
      return;
    }
    const date = frame.session_date ?? new Date().toISOString().slice(0, 10);
    const off = etOffsetSuffix(date);
    const anchor = (hhmm: string): Time => {
      const [hh, mm] = hhmm.split(":").map(Number);
      return Math.floor(
        new Date(`${date}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00${off}`).getTime() / 1000,
      ) as unknown as Time;
    };
    const shown = rangeQ > 0 && frame.spot != null ? filterFrameToRange(frame, frame.spot, rangeQ) : frame;
    const bars: HeatData[] = buildHeatBars(shown, metric, anchor);
    heat.setData(bars);
    applyShaderRef.current();
    chartRef.current?.timeScale().fitContent();
  }, [frame, metric, rangeQ]);

  // Re-apply the shader when opacity changes (data unchanged).
  useEffect(() => { applyShaderRef.current(); }, [opacity]);

  // Candles → chart
  useEffect(() => {
    const candle = candleSeriesRef.current;
    if (!candle) return;
    if (!candles.length) { candle.setData([]); return; }
    const data = candles
      .filter((b, i, arr) => i === 0 || b[0] !== arr[i - 1][0])
      .map((b) => ({ time: b[0] as unknown as Time, open: b[1], high: b[2], low: b[3], close: b[4] }));
    candle.setData(data);
  }, [candles]);

  // ── Stamps / labels ──────────────────────────────────────────────────────────
  // Plain computations — the React Compiler auto-memoizes; a manual useMemo here trips
  // preserve-manual-memoization (its inferred deps differ from the hand-written ones).
  const asofLabel = fmtAsofLabel(frame?.asof);
  const metricLabel = t(METRICS.find((m) => m.key === metric)?.labelKey ?? "metricNetPrem");
  const hasData = !!frame && !!frame.grids[metric] && frame.time_steps.length > 0;

  return (
    <div style={PANE}>
      {/* Controls row */}
      <div style={CONTROLS}>
        {/* Metric tabs */}
        <div style={GROUP} role="group" aria-label={t("metricLensAria")}>
          {METRICS.map((m) => (
            <button
              key={m.key}
              className={`obs-chip${metric === m.key ? " on" : ""}`}
              style={{ ...CHIP, ...(m.enabled ? {} : DISABLED_CHIP) }}
              aria-pressed={metric === m.key}
              aria-disabled={!m.enabled}
              aria-label={m.enabled ? undefined : `${t(m.labelKey)} — ${t("metricAccruing")}`}
              onClick={() => m.enabled && setMetric(m.key)}
            >
              {t(m.labelKey)}
              {!m.enabled && <span style={ACCRUING_DOT} aria-hidden>·</span>}
            </button>
          ))}
        </div>

        {/* Aggregation */}
        <div style={GROUP} role="group" aria-label={t("aggAria")}>
          {AGGS.map((a) => (
            <button key={a.min} className={`obs-chip${aggMin === a.min ? " on" : ""}`} style={CHIP}
              aria-pressed={aggMin === a.min} onClick={() => setAggMin(a.min)}>
              {t(a.labelKey)}
            </button>
          ))}
        </div>

        {/* Opacity */}
        <label style={SLIDER_WRAP}>
          <span style={SLIDER_LBL}>{t("opacity")}</span>
          <input type="range" min={0} max={100} step={5} value={Math.round(opacity * 100)}
            aria-label={t("opacityAria")} style={SLIDER}
            onChange={(e) => setOpacity(Number(e.target.value) / 100)} />
          <span style={SLIDER_VAL} className="num">{Math.round(opacity * 100)}%</span>
        </label>

        {/* Strike range */}
        <label style={SLIDER_WRAP}>
          <span style={SLIDER_LBL}>{t("range")}</span>
          <input type="range" min={0} max={RANGE_STOPS.length - 1} step={1}
            value={Math.max(0, RANGE_STOPS.indexOf(rangeQ))}
            aria-label={t("strikeRangeAria")} style={SLIDER}
            onChange={(e) => setRangeQ(RANGE_STOPS[Number(e.target.value)])} />
          <span style={SLIDER_VAL} className="num">{rangeQ === 0 ? t("rangeAll") : `±${rangeQ}`}</span>
        </label>

        {/* Legend */}
        <div style={LEGEND}>
          <span style={LEGEND_ITEM}><span style={{ ...SWATCH, background: "var(--up)" }} />{t("legendPos")}</span>
          <span style={LEGEND_ITEM}><span style={{ ...SWATCH, background: "var(--down)" }} />{t("legendNeg")}</span>
        </div>
      </div>

      {/* Chart area */}
      <div style={CHART_AREA}>
        <div ref={wrapRef} style={{ width: "100%", height: "100%" }} />

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

        {/* As-of + cadence stamp (bottom-right) */}
        {hasData && (
          <div style={STAMP_PILL}>
            {asofLabel && <span>{t("asOf")} {asofLabel}</span>}
            {frame?.cadence && <span style={{ color: "var(--muted)", marginLeft: 8 }}>· {frame.cadence} {t("cadenceLabel")}</span>}
            {frame?.session_date && <span style={{ color: "var(--muted)", marginLeft: 8 }}>· {frame.session_date}</span>}
          </div>
        )}

        {/* Empty / loading */}
        {!hasData && (
          <div style={EMPTY}>
            {loading ? t("surfaceLoading") : t("surfaceEmpty")}
          </div>
        )}
      </div>

      {/* Honesty note */}
      <div className="obs-note" style={NOTE}>{t("surfaceNote")}</div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const PANE: React.CSSProperties = { display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflow: "hidden" };

const CONTROLS: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
  padding: "8px 14px", borderBottom: "1px solid var(--line)", background: "var(--panel)", flexShrink: 0,
};

const GROUP: React.CSSProperties = { display: "flex", gap: 3, alignItems: "center" };

const CHIP: React.CSSProperties = { height: 24, minWidth: 30, fontSize: 11, fontWeight: 600, padding: "0 8px" };

const DISABLED_CHIP: React.CSSProperties = { opacity: 0.4, cursor: "not-allowed" };

const ACCRUING_DOT: React.CSSProperties = { marginLeft: 3, color: "var(--signal)", fontWeight: 900 };

const SLIDER_WRAP: React.CSSProperties = { display: "flex", alignItems: "center", gap: 5 };

const SLIDER_LBL: React.CSSProperties = { fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" };

const SLIDER: React.CSSProperties = { width: 64, height: 3, accentColor: "var(--brand)", cursor: "pointer" };

const SLIDER_VAL: React.CSSProperties = { fontSize: 10, color: "var(--text-2)", minWidth: 30, fontVariantNumeric: "tabular-nums" };

const LEGEND: React.CSSProperties = { display: "flex", gap: 10, marginLeft: "auto", fontSize: 10, color: "var(--text-2)" };

const LEGEND_ITEM: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 4 };

const SWATCH: React.CSSProperties = { display: "inline-block", width: 10, height: 8, borderRadius: 2 };

const CHART_AREA: React.CSSProperties = { position: "relative", flex: 1, minHeight: 260 };

const READOUT_PILL: React.CSSProperties = {
  position: "absolute", top: 10, left: 10, zIndex: 5,
  display: "flex", alignItems: "center", gap: 7,
  padding: "5px 10px", fontSize: 11,
  background: "color-mix(in srgb, var(--panel) 88%, transparent)",
  border: "1px solid var(--line-2, var(--line))", borderRadius: "var(--r-md, 8px)",
  backdropFilter: "blur(6px)", pointerEvents: "none",
  fontFamily: "var(--font-num)", fontVariantNumeric: "tabular-nums",
};

const STAMP_PILL: React.CSSProperties = {
  position: "absolute", bottom: 8, right: 10, zIndex: 5,
  fontSize: 10, color: "var(--text-2)",
  padding: "3px 8px",
  background: "color-mix(in srgb, var(--panel) 80%, transparent)",
  borderRadius: "var(--r-sm, 6px)", pointerEvents: "none",
  fontVariantNumeric: "tabular-nums",
};

const EMPTY: React.CSSProperties = {
  position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
  color: "var(--muted)", fontSize: 13, pointerEvents: "none",
};

const NOTE: React.CSSProperties = { margin: "8px 14px", flexShrink: 0 };
