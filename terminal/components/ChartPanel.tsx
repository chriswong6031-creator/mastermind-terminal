"use client";
import { useEffect, useRef, useState } from "react";
import {
  createChart, CandlestickSeries, BarSeries, LineSeries, AreaSeries, HistogramSeries,
  CrosshairMode, createSeriesMarkers, type IChartApi, type ISeriesApi, type IPaneApi,
} from "lightweight-charts";
import { type Drawing, type Bar as DBar, FIB, uid, autoTrendlines, autoFib, srDrawings, mtfaDrawings } from "@/lib/drawings";
import { registerPane, broadcastCrosshair, broadcastRange } from "@/lib/paneSync";
import { runPine } from "@/lib/pine-engine";
import { IND_DEFS, withDefaults, isIndKey } from "@/lib/indicators";
import ChartOverlays, { type PaneInfo, type LegendEntry } from "@/components/ChartOverlays";

// a user's Pine script handed off from the editor, to be executed + drawn on this chart
export type PineScript = { name: string; source: string; params: Record<string, any> };

const css = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
type Bar = { time: string; o: number; h: number; l: number; c: number; v: number };
export type DetectCmd = { kind: "trendlines" | "fib" | "sr" | "mtfa" | "clear"; nonce: number } | null;

const EMPTY_SET: Set<string> = new Set();
const EMPTY_OBJ: Record<string, any> = {};

// ---- indicator math ----
function ema(a: (number | null)[], p: number) { const o: (number | null)[] = Array(a.length).fill(null); const k = 2 / (p + 1); let pr: number | null = null, s = 0, c = 0; for (let i = 0; i < a.length; i++) { const v = a[i]; if (v == null) { o[i] = pr; continue; } if (pr == null) { s += v; c++; if (c === p) { pr = s / p; o[i] = pr; } } else { pr = v * k + pr * (1 - k); o[i] = pr; } } return o; }
function sma(a: (number | null)[], p: number) { const o: (number | null)[] = Array(a.length).fill(null); const q: number[] = []; let s = 0; for (let i = 0; i < a.length; i++) { const v = a[i]; q.push(v == null ? 0 : v); if (v != null) s += v; if (q.length > p) s -= q.shift()!; if (q.length === p) o[i] = s / p; } return o; }
function stddev(a: number[], p: number) { const o: (number | null)[] = Array(a.length).fill(null); for (let i = p - 1; i < a.length; i++) { const w = a.slice(i - p + 1, i + 1); const m = w.reduce((x, y) => x + y, 0) / p; o[i] = Math.sqrt(w.reduce((x, y) => x + (y - m) ** 2, 0) / p); } return o; }
function rsi(cl: number[], p = 14) { const o: (number | null)[] = Array(cl.length).fill(null); let g = 0, l = 0; for (let i = 1; i < cl.length; i++) { const ch = cl[i] - cl[i - 1], u = ch > 0 ? ch : 0, d = ch < 0 ? -ch : 0; if (i <= p) { g += u; l += d; if (i === p) { g /= p; l /= p; o[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); } } else { g = (g * (p - 1) + u) / p; l = (l * (p - 1) + d) / p; o[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); } } return o; }
function stochRsi(cl: number[], rsiLen = 14, stochLen = 14, smoothK = 3, smoothD = 3) { const r = rsi(cl, rsiLen); const raw: (number | null)[] = Array(cl.length).fill(null); for (let i = 0; i < cl.length; i++) { if (r[i] == null) continue; let hh = -1e9, ll = 1e9, ok = true; for (let j = i - (stochLen - 1); j <= i; j++) { if (j < 0 || r[j] == null) { ok = false; break; } hh = Math.max(hh, r[j]!); ll = Math.min(ll, r[j]!); } if (ok) raw[i] = hh === ll ? 50 : (100 * (r[i]! - ll)) / (hh - ll); } const k = sma(raw, smoothK); return { k, d: sma(k, smoothD) }; }
function macd(cl: number[], fast = 12, slow = 26, signal = 9) { const ef = ema(cl, fast), es = ema(cl, slow); const line = cl.map((_, i) => (ef[i] != null && es[i] != null ? ef[i]! - es[i]! : null)); const sig = ema(line, signal); const hist = line.map((_, i) => (line[i] != null && sig[i] != null ? line[i]! - sig[i]! : null)); return { line, sig, hist }; }
const toLine = (rows: Bar[], arr: (number | null)[]) => rows.map((r, i) => (arr[i] != null && isFinite(arr[i]!) ? { time: r.time, value: arr[i]! } : null)).filter(Boolean) as any[];

function resampleTf(rows: Bar[], tf: string): Bar[] {
  if (tf === "D" || rows.length === 0) return rows;
  const out: Bar[] = []; let cur: Bar | null = null; let key: any = null;
  const isoWeek = (d: string) => { const dt = new Date(d + "T00:00:00Z"); const day = (dt.getUTCDay() + 6) % 7; dt.setUTCDate(dt.getUTCDate() - day); return dt.toISOString().slice(0, 10); };
  for (let i = 0; i < rows.length; i++) { const r = rows[i]; const k = tf === "W" ? isoWeek(r.time) : tf === "1M" ? r.time.slice(0, 7) : Math.floor(i / 3); if (k !== key) { if (cur) out.push(cur); key = k; cur = { ...r }; } else { cur!.h = Math.max(cur!.h, r.h); cur!.l = Math.min(cur!.l, r.l); cur!.c = r.c; cur!.time = r.time; cur!.v += r.v; } }
  if (cur) out.push(cur); return out;
}
function heikin(rows: Bar[]): Bar[] { const out: Bar[] = []; let po = 0, pc = 0; for (let i = 0; i < rows.length; i++) { const r = rows[i]; const hc = (r.o + r.h + r.l + r.c) / 4; const ho = i === 0 ? (r.o + r.c) / 2 : (po + pc) / 2; out.push({ ...r, o: ho, c: hc, h: Math.max(r.h, ho, hc), l: Math.min(r.l, ho, hc) }); po = ho; pc = hc; } return out; }

const ohlcCache: Record<string, any> = {};
const sliceCache: Record<string, any> = {};
const NS = "http://www.w3.org/2000/svg";
const mk = (tag: string, attrs: Record<string, any>) => { const e = document.createElementNS(NS, tag); for (const k in attrs) if (attrs[k] != null) e.setAttribute(k, String(attrs[k])); return e; };

export default function ChartPanel({ symbol, chartType = "candles", indicators, timeframe = "D", replayIdx = null, onMeta, tool = null, drawings = [], onDrawingsChange, detectCmd = null, magnet = false, compare = [], isActive = true, syncId = null, pineScript = null, onPineResult,
  indParams = EMPTY_OBJ, hidden = EMPTY_SET, onToggleHidden, onRemoveInd, onOpenSettings, onOpenSource }:
  { symbol: string; chartType?: string; indicators: Set<string>; timeframe?: string; replayIdx?: number | null; onMeta?: (m: { total: number }) => void;
    tool?: string | null; drawings?: Drawing[]; onDrawingsChange?: (d: Drawing[]) => void; detectCmd?: DetectCmd; magnet?: boolean; compare?: string[]; isActive?: boolean; syncId?: number | null;
    pineScript?: PineScript | null; onPineResult?: (r: { ok: boolean; error?: string; plots: number; shapes: number } | null) => void;
    indParams?: Record<string, any>; hidden?: Set<string>; onToggleHidden?: (key: string) => void; onRemoveInd?: (key: string) => void; onOpenSettings?: (key: string) => void; onOpenSource?: (key: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLSpanElement>(null);
  const verdictRef = useRef<HTMLSpanElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<any> | null>(null);
  const barsRef = useRef<Bar[]>([]);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const renderRef = useRef<() => void>(() => {});
  const drawRef = useRef<Drawing[]>(drawings);
  const toolRef = useRef<string | null>(tool);
  const onChangeRef = useRef(onDrawingsChange);
  const magnetRef = useRef(magnet);
  const activeRef = useRef(isActive); activeRef.current = isActive;
  const barRef = useRef<HTMLDivElement | null>(null);
  const ctxRef = useRef<HTMLDivElement | null>(null);
  const textEditRef = useRef<HTMLInputElement | null>(null);
  const sigRef = useRef<SVGSVGElement | null>(null);
  const onPineRef = useRef(onPineResult); onPineRef.current = onPineResult;

  // ── indicator-legend + pane-management plumbing ──
  // series, grouped by indicator key, so the legend's eye can flip visibility without a chart rebuild
  const seriesByKey = useRef<Record<string, ISeriesApi<any>[]>>({});
  // one entry per chart pane (price pane + each sub-pane), tracked by stable identity (the IPaneApi)
  const panesMeta = useRef<{ key: string; isPrice: boolean; entries: Omit<LegendEntry, "hidden">[]; pane: IPaneApi<any> }[]>([]);
  // collapse/maximize/resize state, keyed by pane key ("__price__" | indicator key) so it survives reorder
  const paneCtl = useRef<{ collapsed: Set<string>; maximized: string | null; normal: Map<string, number> }>({ collapsed: new Set(), maximized: null, normal: new Map() });
  const hiddenRef = useRef<Set<string>>(hidden); hiddenRef.current = hidden;
  const wrapElRef = useRef<HTMLElement | null>(null);
  const paneLayoutRef = useRef<PaneInfo[]>([]);
  const hoveredKeyRef = useRef<string | null>(null);   // pane under cursor, tracked by stable key (survives reorder)
  const measureRef = useRef<() => void>(() => {});
  const lastCtxRef = useRef("");                        // symbol|tf|chartType of the last build — drives view-preserve on rebuild
  const [paneLayout, setPaneLayout] = useState<PaneInfo[]>([]);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [legendOpen, setLegendOpen] = useState(true);
  // only the ACTIVE indicators' params drive a rebuild (editing an inactive indicator can't happen via the legend anyway)
  const indParamsKey = JSON.stringify(Array.from(indicators).sort().map((k) => indParams[k]));
  const pineName = pineScript?.name || "Custom script";

  // rebuild the chart whenever the script's content actually changes (full source — not just its
  // length, so equal-length edits like `>`→`<` still re-run the engine; the object is fresh each render)
  const pineKey = pineScript ? `${pineScript.name}|${pineScript.source}|${JSON.stringify(pineScript.params)}` : "";
  // rebuild the chart when the up/down color scheme flips (candle + badge colors are baked from tokens)
  const [csNonce, setCsNonce] = useState(0);
  useEffect(() => { const h = () => setCsNonce((n) => n + 1); window.addEventListener("mm:updown", h); return () => window.removeEventListener("mm:updown", h); }, []);
  drawRef.current = drawings; toolRef.current = tool; onChangeRef.current = onDrawingsChange; magnetRef.current = magnet;

  // ── pane-control operations (read chart refs; safe to recreate every render) ──
  const P = (k: string) => withDefaults(k, indParams[k]);
  const labelOf = (k: string) => (k === "pine" ? pineName : isIndKey(k) ? IND_DEFS[k].label : k);
  const applyStretch = () => {
    const ctl = paneCtl.current;
    for (const m of panesMeta.current) {
      let s: number;
      if (ctl.maximized) s = m.key === ctl.maximized ? 1000 : 0.0001;
      else s = ctl.collapsed.has(m.key) ? 0.06 : (ctl.normal.get(m.key) ?? (m.isPrice ? 3.4 : 1));
      try { m.pane.setStretchFactor(s); } catch {}
    }
  };
  // a genuine separator drag (normal mode only) becomes the new baseline; ignore programmatic sizing
  const captureNormal = () => { const ctl = paneCtl.current; if (ctl.maximized) return; for (const m of panesMeta.current) { if (ctl.collapsed.has(m.key)) continue; try { ctl.normal.set(m.key, m.pane.getStretchFactor()); } catch {} } };
  const keyOfPaneIndex = (pi: number) => { const m = panesMeta.current.find((x) => { try { return x.pane.paneIndex() === pi; } catch { return false; } }); return m?.key ?? null; };
  const measure = () => measureRef.current();
  const doMaximize = (pi: number) => { const key = keyOfPaneIndex(pi); if (!key) return; const ctl = paneCtl.current; if (ctl.maximized === key) ctl.maximized = null; else { ctl.maximized = key; ctl.collapsed.delete(key); } applyStretch(); requestAnimationFrame(measure); };
  const doCollapse = (pi: number) => { const key = keyOfPaneIndex(pi); if (!key) return; const ctl = paneCtl.current; ctl.maximized = null; if (ctl.collapsed.has(key)) ctl.collapsed.delete(key); else ctl.collapsed.add(key); applyStretch(); requestAnimationFrame(measure); };
  const collapseAllPanes = () => { const ctl = paneCtl.current; ctl.maximized = null; const subs = panesMeta.current.filter((m) => !m.isPrice).map((m) => m.key); if (!subs.length) return; const all = subs.every((k) => ctl.collapsed.has(k)); if (all) subs.forEach((k) => ctl.collapsed.delete(k)); else subs.forEach((k) => ctl.collapsed.add(k)); applyStretch(); requestAnimationFrame(measure); };
  const doMove = (pi: number, dir: -1 | 1) => { const ch = chartRef.current; if (!ch) return; const tgt = pi + dir; let n = 1; try { n = ch.panes().length; } catch {} if (tgt < 0 || tgt >= n) return; try { ch.swapPanes(pi, tgt); } catch {} requestAnimationFrame(measure); };
  const canMoveUp = (pi: number) => pi > 0;
  const canMoveDown = (pi: number) => pi < paneLayoutRef.current.length - 1;
  const applyHidden = () => { const h = hiddenRef.current; const SB = seriesByKey.current; for (const k in SB) { const vis = !h.has(k); for (const s of SB[k]) { try { s.applyOptions({ visible: vis } as any); } catch {} } } };

  useEffect(() => {
    const el = ref.current; if (!el) return;
    let ro: ResizeObserver | null = null, paneRO: ResizeObserver | null = null, dead = false;
    let onKey: ((e: KeyboardEvent) => void) | null = null;
    let onCtx: ((e: MouseEvent) => void) | null = null, winDown: ((e: PointerEvent) => void) | null = null, dragCleanup: (() => void) | null = null;
    let syncCleanup: (() => void) | null = null;
    let rafId: number | null = null, measRaf: number | null = null;
    let onPaneMove: ((e: MouseEvent) => void) | null = null, onPaneLeave: (() => void) | null = null, onPaneDbl: ((e: MouseEvent) => void) | null = null;
    const snap0 = () => { if (!activeRef.current) return; try { const c = chartRef.current!.takeScreenshot(); const a = document.createElement("a"); a.href = c.toDataURL(); a.download = `${symbol}.png`; a.click(); } catch {} };
    window.addEventListener("mm:snapshot", snap0);

    (async () => {
      if (ohlcCache[symbol] === undefined || sliceCache[symbol] === undefined) {
        const [ohlc, slice] = await Promise.all([
          fetch(`/data/${symbol}.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
          fetch(`/data/${symbol}.slice.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        ]);
        ohlcCache[symbol] = ohlc; sliceCache[symbol] = slice;
      }
      if (dead) return;
      const ohlc = ohlcCache[symbol], slice = sliceCache[symbol];
      if (!ohlc?.bars?.length) { if (statusRef.current) statusRef.current.textContent = "No data for this symbol."; return; }

      let rows: Bar[] = ohlc.bars.map((b: any[]) => ({ time: b[0], o: b[1], h: b[2], l: b[3], c: b[4], v: b[5] }));
      // keep the FULL history (the OHLC store holds ~5y) — no truncation, so the
      // chart scrolls/zooms back over every loaded bar; the default view is set
      // to a recent window below (setVisibleLogicalRange).
      rows = resampleTf(rows, timeframe);
      if (onMeta) onMeta({ total: rows.length });
      if (replayIdx != null) rows = rows.slice(0, Math.max(20, replayIdx + 1));
      const display = chartType === "heikin" ? heikin(rows) : rows;
      const closes = rows.map((r) => r.c);
      barsRef.current = rows;
      const c = { up: css("--up"), down: css("--down"), grid: css("--grid"), line: css("--line"), p3: css("--panel-3"), link: css("--link"), warn: css("--warn"), buy: css("--buy"), sell: css("--sell"), mut: css("--muted"), brand2: css("--brand-2") };

      // preserve the user's zoom/scroll + pane collapse/maximize/resize across a rebuild (settings edits,
      // toggling another indicator, etc.). Only restore the view when the data context is unchanged.
      let prevRange: any = null; const prevCtl = paneCtl.current;
      const sameCtx = !!chartRef.current && lastCtxRef.current === `${symbol}|${timeframe}|${chartType}`;
      lastCtxRef.current = `${symbol}|${timeframe}|${chartType}`;
      try { prevRange = chartRef.current?.timeScale().getVisibleLogicalRange(); } catch {}
      if (chartRef.current) { try { chartRef.current.remove(); } catch {} }
      const chart = createChart(el, {
        width: el.clientWidth || 900, height: el.clientHeight || 600,
        layout: { background: { color: "transparent" }, textColor: c.mut, fontSize: 11, attributionLogo: false, panes: { enableResize: true, separatorColor: c.line, separatorHoverColor: "rgba(77,130,255,.35)" } },
        grid: { vertLines: { color: c.grid }, horzLines: { color: c.grid } },
        crosshair: { mode: CrosshairMode.Normal, vertLine: { color: "rgba(214,218,227,.32)", width: 1, labelBackgroundColor: c.p3 }, horzLine: { color: "rgba(214,218,227,.32)", width: 1, labelBackgroundColor: c.p3 } },
        rightPriceScale: { borderColor: c.line, scaleMargins: { top: 0.1, bottom: 0.08 } },
        timeScale: { borderColor: c.line, rightOffset: 6, barSpacing: 8 },
      });
      chartRef.current = chart;
      const prec = closes[closes.length - 1] < 10 ? 4 : 2;
      const pf = { type: "price" as const, precision: prec, minMove: Math.pow(10, -prec) };

      // reset the per-build legend/pane bookkeeping
      seriesByKey.current = {}; panesMeta.current = []; paneCtl.current = { collapsed: new Set(), maximized: null, normal: new Map() };
      const SB = seriesByKey.current;
      const add = (k: string, s: ISeriesApi<any>) => { (SB[k] ||= []).push(s); return s; };
      const overlayEntries: Omit<LegendEntry, "hidden">[] = [];
      const subMetas: { key: string; isPrice: boolean; entries: Omit<LegendEntry, "hidden">[]; pane: IPaneApi<any> }[] = [];

      let priceS: any;
      if (chartType === "line") { priceS = chart.addSeries(LineSeries, { color: c.brand2, lineWidth: 2, priceFormat: pf }, 0); priceS.setData(display.map((r) => ({ time: r.time, value: r.c }))); }
      else if (chartType === "area") { priceS = chart.addSeries(AreaSeries, { lineColor: c.brand2, topColor: "rgba(41,98,255,.30)", bottomColor: "rgba(41,98,255,.02)", lineWidth: 2, priceFormat: pf }, 0); priceS.setData(display.map((r) => ({ time: r.time, value: r.c }))); }
      else if (chartType === "bars") { priceS = chart.addSeries(BarSeries, { upColor: c.up, downColor: c.down, priceFormat: pf }, 0); priceS.setData(display.map((r) => ({ time: r.time, open: r.o, high: r.h, low: r.l, close: r.c }))); }
      else { priceS = chart.addSeries(CandlestickSeries, { upColor: c.up, downColor: c.down, wickUpColor: c.up, wickDownColor: c.down, borderVisible: false, priceFormat: pf }, 0); priceS.setData(display.map((r) => ({ time: r.time, open: r.o, high: r.h, low: r.l, close: r.c }))); }
      seriesRef.current = priceS;

      // ── overlay indicators (price pane) — param-driven ──
      if (indicators.has("ema")) {
        const p = P("ema");
        ([[p.ma1On, p.ma1Len, p.ma1Col], [p.ma2On, p.ma2Len, p.ma2Col], [p.ma3On, p.ma3Len, p.ma3Col]] as [boolean, number, string][]).forEach(([on, len, col]) => {
          if (!on) return; const ln = chart.addSeries(LineSeries, { color: col, lineWidth: p.width, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }, 0); ln.setData(toLine(rows, ema(closes, len))); add("ema", ln);
        });
        overlayEntries.push({ key: "ema", label: IND_DEFS.ema.label, kind: "overlay", isPine: false });
      }
      if (indicators.has("bb")) {
        const p = P("bb"); const basis = sma(closes, p.length); const sd = stddev(closes, p.length);
        const up = closes.map((_, i) => (basis[i] != null && sd[i] != null ? basis[i]! + p.mult * sd[i]! : null));
        const lo = closes.map((_, i) => (basis[i] != null && sd[i] != null ? basis[i]! - p.mult * sd[i]! : null));
        [up, basis, lo].forEach((arr, j) => { const ln = chart.addSeries(LineSeries, { color: j === 1 ? p.basisCol : p.bandCol, lineWidth: p.width, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }, 0); ln.setData(toLine(rows, arr)); add("bb", ln); });
        overlayEntries.push({ key: "bb", label: IND_DEFS.bb.label, kind: "overlay", isPine: false });
      }
      if (indicators.has("vwap")) {
        const p = P("vwap"); let cum = 0, cumv = 0; const vw = rows.map((r) => { const tp = (r.h + r.l + r.c) / 3; cum += tp * r.v; cumv += r.v; return cumv ? cum / cumv : null; });
        const ln = chart.addSeries(LineSeries, { color: p.col, lineWidth: p.width as any, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }, 0); ln.setData(toLine(rows, vw)); add("vwap", ln);
        overlayEntries.push({ key: "vwap", label: IND_DEFS.vwap.label, kind: "overlay", isPine: false });
      }

      // compare overlays — each symbol rebased to the main symbol's first price (relative performance)
      const CMP_COLORS = ["#e8a33d", "#9d86ff", "#19c2c2", "#f06bd0"];
      for (let ci = 0; ci < (compare || []).length && ci < 4; ci++) {
        const cs = compare[ci]; if (!cs || cs === symbol) continue;
        if (ohlcCache[cs] === undefined) { const o = await fetch(`/data/${cs}.json`).then((rr) => (rr.ok ? rr.json() : null)).catch(() => null); ohlcCache[cs] = o; }
        const co = ohlcCache[cs]; if (!co?.bars?.length || dead) continue;
        let crows: Bar[] = co.bars.map((b: any[]) => ({ time: b[0], o: b[1], h: b[2], l: b[3], c: b[4], v: b[5] }));
        crows = resampleTf(crows, timeframe);
        const cmap: Record<string, number> = {}; for (const cr of crows) cmap[cr.time] = cr.c;
        let bse = 0, baseA = rows[0].c; for (const r of rows) { if (cmap[r.time] != null) { bse = cmap[r.time]; baseA = r.c; break; } }   // anchor to first COMMON date
        if (!bse) continue; const scl = baseA / bse; let lv: number | null = null;
        const cdata = rows.map((r) => { const v = cmap[r.time]; if (v != null) lv = v; return lv != null ? { time: r.time, value: +(lv * scl).toFixed(prec) } : null; }).filter(Boolean);
        const ln = chart.addSeries(LineSeries, { color: CMP_COLORS[ci % CMP_COLORS.length], lineWidth: 1.5 as any, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, title: cs }, 0);
        ln.setData(cdata as any);
      }
      if (dead) { try { chart.remove(); } catch {} return; }   // effect re-ran during the compare fetch — bail before wiring listeners/overlay

      const times = rows.map((r) => r.time);
      const lastDate = times[times.length - 1];
      const near = (iso: string) => { let b: string | null = null, bd = 1e18; const x = new Date(iso + "T00:00:00Z").getTime(); times.forEach((y) => { const dd = Math.abs(new Date(y + "T00:00:00Z").getTime() - x); if (dd < bd) { bd = dd; b = y; } }); return bd < 9e8 ? b : null; };
      // resolve EVERY BUY/SELL/CUT/REBUY to its nearest bar — drawn as custom badges (see renderSignals)
      const sigMarks = (slice?.indicator?.signals || [])
        .filter((s: any) => s.ts <= lastDate)
        .map((s: any) => ({ t: near(s.ts), type: s.type as string, price: s.price as number }))
        .filter((m: any) => m.t && m.price != null) as { t: string; type: string; price: number }[];

      // ── sub-pane indicators — each gets its OWN pane (1 indicator : 1 pane) ──
      let pane = 1;
      if (indicators.has("vol")) { const p = P("vol"); const vs = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "" }, pane); vs.setData(rows.map((r) => ({ time: r.time, value: r.v, color: r.c >= r.o ? p.upCol : p.downCol }))); add("vol", vs); subMetas.push({ key: "vol", isPrice: false, entries: [{ key: "vol", label: IND_DEFS.vol.label, kind: "pane", isPine: false }], pane: vs.getPane() }); pane++; }
      if (indicators.has("rsi")) { const p = P("rsi"); const rS = chart.addSeries(LineSeries, { color: p.col, lineWidth: p.width as any, lastValueVisible: true, title: "RSI" }, pane); rS.setData(toLine(rows, rsi(closes, p.length))); add("rsi", rS); if (p.showLevels) { try { rS.createPriceLine({ price: p.obLevel, color: "rgba(214,218,227,.25)", lineWidth: 1, lineStyle: 2, axisLabelVisible: false }); rS.createPriceLine({ price: p.osLevel, color: "rgba(214,218,227,.25)", lineWidth: 1, lineStyle: 2, axisLabelVisible: false }); } catch {} } subMetas.push({ key: "rsi", isPrice: false, entries: [{ key: "rsi", label: IND_DEFS.rsi.label, kind: "pane", isPine: false }], pane: rS.getPane() }); pane++; }
      if (indicators.has("stochrsi")) { const p = P("stochrsi"); const sr = stochRsi(closes, p.rsiLength, p.stochLength, p.smoothK, p.smoothD); const kS = chart.addSeries(LineSeries, { color: p.kCol, lineWidth: p.width as any, lastValueVisible: true, title: "%K" }, pane); const dS = chart.addSeries(LineSeries, { color: p.dCol, lineWidth: 1, lastValueVisible: true, title: "%D" }, pane); kS.setData(toLine(rows, sr.k)); dS.setData(toLine(rows, sr.d)); add("stochrsi", kS); add("stochrsi", dS); subMetas.push({ key: "stochrsi", isPrice: false, entries: [{ key: "stochrsi", label: IND_DEFS.stochrsi.label, kind: "pane", isPine: false }], pane: kS.getPane() }); pane++; }
      if (indicators.has("macd")) { const p = P("macd"); const m = macd(closes, p.fast, p.slow, p.signal); const hs = chart.addSeries(HistogramSeries, {}, pane); hs.setData(rows.map((r, i) => (m.hist[i] != null ? { time: r.time, value: m.hist[i]!, color: m.hist[i]! >= 0 ? p.upHist : p.downHist } : null)).filter(Boolean) as any); const lS = chart.addSeries(LineSeries, { color: p.macdCol, lineWidth: p.width as any, title: "MACD" }, pane); const sS = chart.addSeries(LineSeries, { color: p.signalCol, lineWidth: 1, title: "signal" }, pane); lS.setData(toLine(rows, m.line)); sS.setData(toLine(rows, m.sig)); add("macd", hs); add("macd", lS); add("macd", sS); subMetas.push({ key: "macd", isPrice: false, entries: [{ key: "macd", label: IND_DEFS.macd.label, kind: "pane", isPine: false }], pane: lS.getPane() }); pane++; }

      // ── user Pine script: execute via the engine and draw its plots/shapes/hlines ──
      // overlay plots/markers go on the price pane; the rest fill a dedicated sub-pane.
      let pinePlacement: "price" | "pane" | null = null; let pinePaneApi: IPaneApi<any> | null = null;
      if (pineScript?.source) {
        try {
          const out = runPine(pineScript.source, rows as any, { timeframe, symbol, params: pineScript.params || {} });
          if (!out.ok || !out.result) { onPineRef.current?.({ ok: false, error: out.errors[0]?.message || "run failed", plots: 0, shapes: 0 }); pinePlacement = "price"; }
          else {
            const R = out.result;
            const ls = (s: string) => (s === "dotted" ? 1 : s === "dashed" ? 2 : 0);
            const D = (arr: { time: string; value: number }[]) => arr.map((d: { time: string; value: number }) => ({ time: d.time, value: d.value }));
            const ovMarks: any[] = [], paneMarks: any[] = [];
            let pineAnchor: any = null; const pinePane = pane; let usedPine = false;
            for (const pl of R.plots) {
              const tgt = pl.overlay ? 0 : pinePane; if (!pl.overlay) usedPine = true;
              const lw = Math.max(1, Math.min(4, Math.round(pl.linewidth || 1))) as any;
              let s: any;
              if (pl.kind === "circles" || pl.kind === "cross") {
                s = chart.addSeries(LineSeries, { color: pl.color, lineVisible: false, pointMarkersVisible: true, pointMarkersRadius: Math.max(2, lw), priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }, tgt); s.setData(D(pl.data));
              } else if (pl.kind === "histogram" || pl.kind === "columns") {
                s = chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false, ...(pl.overlay ? { priceScaleId: "" } : {}) }, tgt); s.setData(pl.data.map((d) => ({ time: d.time, value: d.value, color: d.color })));
              } else if (pl.kind === "area") {
                s = chart.addSeries(AreaSeries, { lineColor: pl.color, topColor: "rgba(41,98,255,.22)", bottomColor: "rgba(41,98,255,.02)", lineWidth: lw, priceLineVisible: false, lastValueVisible: false }, tgt); s.setData(D(pl.data));
              } else {
                s = chart.addSeries(LineSeries, { color: pl.color, lineWidth: lw, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, title: pl.title }, tgt); s.setData(D(pl.data));
              }
              add("pine", s);
              if (!pl.overlay && !pineAnchor) pineAnchor = s;
            }
            // a sub-pane is needed for ANY non-overlay output (plot, hline, OR marker); create its
            // anchor series BEFORE drawing hlines/markers so a levels-only or markers-only script isn't dropped
            const needPine = usedPine || R.hlines.some((h) => !h.overlay) || R.shapes.some((sh) => !sh.overlay);
            if (needPine && !pineAnchor) { pineAnchor = chart.addSeries(LineSeries, { color: "rgba(0,0,0,0)", priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }, pinePane); pineAnchor.setData(rows.map((rr) => ({ time: rr.time, value: rr.c }))); add("pine", pineAnchor); }
            for (const h of R.hlines) { const tgt = h.overlay ? priceS : pineAnchor; if (tgt) try { tgt.createPriceLine({ price: h.price, color: h.color, lineWidth: 1, lineStyle: ls(h.style), axisLabelVisible: false, title: h.title }); } catch {} }
            for (const sh of R.shapes) (sh.overlay ? ovMarks : paneMarks).push({ time: sh.time, position: sh.position, color: sh.color, shape: sh.shape, text: sh.text });
            const byT = (a: any, b: any) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0);
            if (ovMarks.length) createSeriesMarkers(priceS, ovMarks.sort(byT));
            if (pineAnchor && paneMarks.length) createSeriesMarkers(pineAnchor, paneMarks.sort(byT));
            if (needPine && pineAnchor) { pinePaneApi = pineAnchor.getPane(); pane = pinePane + 1; }
            pinePlacement = needPine ? "pane" : "price";
            onPineRef.current?.({ ok: true, plots: R.plots.length, shapes: R.shapes.length });
          }
        } catch (e) { onPineRef.current?.({ ok: false, error: (e as Error)?.message || "engine error", plots: 0, shapes: 0 }); pinePlacement = "price"; }
        const pineEntry: Omit<LegendEntry, "hidden"> = { key: "pine", label: pineName, kind: pinePlacement === "pane" ? "pane" : "overlay", isPine: true };
        if (pinePlacement === "pane" && pinePaneApi) subMetas.push({ key: "pine", isPrice: false, entries: [pineEntry], pane: pinePaneApi });
        else overlayEntries.push(pineEntry);
      }

      // assemble the pane registry (price pane first) + size the panes
      panesMeta.current = [{ key: "__price__", isPrice: true, entries: overlayEntries, pane: priceS.getPane() }, ...subMetas];
      // carry collapse/maximize/resize over to the panes that still exist (keyed by indicator, so a rebuild
      // from a settings edit or an add/remove of another indicator keeps this pane's arrangement)
      { const ctl = paneCtl.current; const surv = new Set(panesMeta.current.map((m) => m.key));
        for (const m of panesMeta.current) {
          ctl.normal.set(m.key, prevCtl.normal.has(m.key) ? prevCtl.normal.get(m.key)! : (m.isPrice ? 3.4 : 1));
          if (prevCtl.collapsed.has(m.key)) ctl.collapsed.add(m.key);
        }
        if (prevCtl.maximized && surv.has(prevCtl.maximized)) ctl.maximized = prevCtl.maximized;
      }
      applyStretch();

      const last = rows[rows.length - 1], prev = rows[rows.length - 2] || last;
      if (statusRef.current) { const ch = last.c - prev.c, cp = (ch / prev.c) * 100, u = ch >= 0, f = (x: number) => x.toFixed(prec); statusRef.current.innerHTML = `<span class="mut">O</span><b>${f(last.o)}</b> <span class="mut">H</span><b>${f(last.h)}</b> <span class="mut">L</span><b>${f(last.l)}</b> <span class="mut">C</span><b>${f(last.c)}</b> <b class="${u ? "up" : "down"}">${u ? "+" : ""}${f(ch)} (${u ? "+" : ""}${cp.toFixed(2)}%)</b>`; }
      if (verdictRef.current) { const v = slice?.indicator?.state?.last_signal || "—"; const buy = v === "BUY" || v === "REBUY"; verdictRef.current.textContent = `GOLDEN ORACLE · ${v}`; verdictRef.current.style.color = buy ? c.buy : c.sell; const w = verdictRef.current.parentElement as HTMLElement; if (w) { w.style.background = buy ? "rgba(38,194,129,.12)" : "rgba(240,86,107,.12)"; w.style.borderColor = buy ? "rgba(38,194,129,.3)" : "rgba(240,86,107,.3)"; } }
      // default to a recent window (~240 bars) but leave the full history scrollable;
      // replay mode fits its own slice.
      { const DEFAULT_VIEW = 240, n = rows.length;
        if (sameCtx && prevRange && replayIdx == null) { try { chart.timeScale().setVisibleLogicalRange(prevRange); } catch { chart.timeScale().fitContent(); } }
        else if (replayIdx == null && n > DEFAULT_VIEW) chart.timeScale().setVisibleLogicalRange({ from: n - DEFAULT_VIEW, to: n - 1 + 6 });
        else chart.timeScale().fitContent(); }

      // ---------- drawing overlay (synced to chart coordinates) ----------
      const wrap = el.parentElement as HTMLElement;
      wrapElRef.current = wrap;
      // signal-marker layer (below the user-drawing layer); custom TradingView-style badges
      const sigSvg = mk("svg", { style: "position:absolute;inset:0;width:100%;height:100%;z-index:3;pointer-events:none" }) as SVGSVGElement;
      wrap.appendChild(sigSvg); sigRef.current = sigSvg;
      const svg = mk("svg", { style: "position:absolute;inset:0;width:100%;height:100%;z-index:4;pointer-events:none" }) as SVGSVGElement;
      wrap.appendChild(svg); svgRef.current = svg;
      const dcol = (d: Drawing) => d.color?.startsWith("var(") ? css(d.color.slice(4, -1)) : (d.color || c.brand2);
      // snap a (possibly foreign-timeframe) anchor time to THIS pane's nearest bar, so a drawing
      // made on e.g. the Daily MTF pane still renders on the Weekly/Monthly panes (only t is remapped;
      // price is timeframe-invariant). Exact-match fast path keeps same-timeframe behavior unchanged.
      const snapT = (t: string) => { const b = barsRef.current; if (!b.length) return t; for (let k = 0; k < b.length; k++) if (b[k].time === t) return t; const x = +new Date(t + "T00:00:00Z"); let best = b[0].time, bd = Infinity; for (const r of b) { const dd = Math.abs(+new Date(r.time + "T00:00:00Z") - x); if (dd < bd) { bd = dd; best = r.time; } } return best; };
      const xOf = (t: string) => chart.timeScale().timeToCoordinate(snapT(t) as any) as number | null;
      const yOf = (p: number) => priceS.priceToCoordinate(p) as number | null;
      const barIndex = (t: string) => { const tt = snapT(t); const b = barsRef.current; for (let k = 0; k < b.length; k++) if (b[k].time === tt) return k; return -1; };
      // ── signal badges: TradingView-style BUY/SELL (★) + CUT/RE-BUY pills, anchored at each signal bar ──
      const SIGCFG: Record<string, { dir: "up" | "down"; fill: string; tc: string; txt: string; star?: boolean }> = {
        BUY:   { dir: "up",   fill: c.buy,    tc: "#fff",     txt: "★",      star: true },
        SELL:  { dir: "down", fill: c.sell,   tc: "#fff",     txt: "★",      star: true },
        REBUY: { dir: "up",   fill: "#b6e94a", tc: "#16310a",  txt: "RE-BUY" },
        CUT:   { dir: "down", fill: "#ff8a3d", tc: "#2a1400",  txt: "CUT" },
      };
      const renderSignals = () => {
        const layer = sigRef.current; if (!layer) return;
        while (layer.firstChild) layer.removeChild(layer.firstChild);
        for (const m of sigMarks) {
          const cfg = SIGCFG[m.type]; if (!cfg) continue;
          const x = xOf(m.t), y = yOf(m.price); if (x == null || y == null) continue;
          const star = !!cfg.star;
          const w = star ? 19 : Math.max(20, 9 + cfg.txt.length * 7), h = 15, r = 4, ptr = 5, gap = 9;
          const up = cfg.dir === "up";
          const top = up ? y + gap + ptr : y - gap - ptr - h;
          const g = mk("g", { opacity: 0.97 });
          g.appendChild(mk("rect", { x: x - w / 2, y: top, width: w, height: h, rx: r, ry: r, fill: cfg.fill }));
          g.appendChild(mk("path", { d: up ? `M${x - ptr} ${top} L${x + ptr} ${top} L${x} ${top - ptr} Z` : `M${x - ptr} ${top + h} L${x + ptr} ${top + h} L${x} ${top + h + ptr} Z`, fill: cfg.fill }));
          const tEl = mk("text", { x, y: top + h / 2 + (star ? 4.3 : 3.4), fill: cfg.tc, "font-size": star ? 11.5 : 9, "font-weight": 800, "text-anchor": "middle", "font-family": star ? "Georgia,serif" : "var(--font-ui)", "letter-spacing": star ? "0" : ".02em" });
          tEl.textContent = cfg.txt;
          g.appendChild(tEl);
          layer.appendChild(g);
        }
      };
      const snap = (px: number, py: number) => {
        const bars = barsRef.current; let bt = bars[bars.length - 1]?.time, bd = 1e18;
        for (const b of bars) { const xc = xOf(b.time); if (xc == null) continue; const dd = Math.abs(xc - px); if (dd < bd) { bd = dd; bt = b.time; } }
        let p = priceS.coordinateToPrice(py) as number | null; if (p == null) p = bars[bars.length - 1].c;
        if (magnetRef.current) { const bar = bars[barIndex(bt)]; if (bar) { const cand = [bar.o, bar.h, bar.l, bar.c]; p = cand.reduce((a, v) => Math.abs(v - (p as number)) < Math.abs(a - (p as number)) ? v : a, cand[0]); } }
        return { t: bt, p: +(p as number).toFixed(prec) } as { t: string; p: number };
      };
      let pending: { kind: string; a: { t: string; p: number } } | null = null;
      let sel: string | null = null;

      function shape(d: Drawing, preview = false) {
        const col = dcol(d); const W = el!.clientWidth, H = el!.clientHeight, op = preview ? 0.7 : 1; const on = d.id === sel && !preview;
        const g = mk("g", { "data-id": d.id, opacity: op, "pointer-events": preview ? "none" : "all", style: "cursor:pointer" });
        const fat = (x1: number, y1: number, x2: number, y2: number) => g.appendChild(mk("line", { x1, y1, x2, y2, stroke: "transparent", "stroke-width": 12 }));
        const grip = (pts: { x: number; y: number }[]) => { if (on) pts.forEach((p) => g.appendChild(mk("circle", { cx: p.x, cy: p.y, r: 4.5, fill: "var(--bg)", stroke: col, "stroke-width": 2 }))); };
        const A = d.points[0], B = d.points[1];
        const dash = d.dash === "dashed" ? "7 5" : d.dash === "dotted" ? "2 4" : (d.auto ? "5 4" : "");
        const lw = (base: number, boost: number) => (d.width ?? base) + (on ? boost : 0);
        const ax = A ? xOf(A.t) : null, ay = A ? yOf(A.p) : null;
        if (d.kind === "hline") {
          if (ay == null) return g;
          const sw = (d.width ?? (d.meta && (d.meta as any).strength ? 0.4 + 1.0 * (d.meta as any).strength : 1.3)) + (on ? 1 : 0);
          g.appendChild(mk("line", { x1: 0, y1: ay, x2: W, y2: ay, stroke: col, "stroke-width": sw, "stroke-dasharray": dash }));
          fat(0, ay, W, ay);
          const label = (d.meta as any)?.label || A.p.toFixed(prec);
          const tx = mk("text", { x: W - 6, y: ay - 4, fill: col, "font-size": 10, "text-anchor": "end", "font-family": "var(--font-num)" }); tx.textContent = String(label);
          g.appendChild(tx); grip([{ x: W / 2, y: ay }]); return g;
        }
        if (d.kind === "vline") {
          if (ax == null) return g;
          g.appendChild(mk("line", { x1: ax, y1: 0, x2: ax, y2: H, stroke: col, "stroke-width": lw(1.3, 1), "stroke-dasharray": dash }));
          fat(ax, 0, ax, H); grip([{ x: ax, y: H / 2 }]); return g;
        }
        const bx = B ? xOf(B.t) : null, by = B ? yOf(B.p) : null;
        if (d.kind === "text") { if (ax == null || ay == null) return g; const fs = d.fontSize ?? 13; g.appendChild(mk("rect", { x: ax - 3, y: ay - fs - 1, width: Math.max(40, (d.text || "").length * fs * 0.6), height: fs + 6, fill: "transparent" })); const tx = mk("text", { x: ax, y: ay, fill: col, "font-size": fs, "font-family": "var(--font-ui)" }); tx.textContent = d.text || "text"; g.appendChild(tx); grip([{ x: ax, y: ay - fs / 2 }]); return g; }
        if (ax == null || ay == null || bx == null || by == null) return g;
        if (d.kind === "trendline" || d.kind === "ray" || d.kind === "measure" || d.kind === "arrow") {
          let ex = bx, ey = by;
          if (d.kind === "ray" && bx !== ax) { const m = (by - ay) / (bx - ax); ex = W; ey = ay + m * (W - ax); }
          g.appendChild(mk("line", { x1: ax, y1: ay, x2: ex, y2: ey, stroke: col, "stroke-width": lw(1.6, 0.8), "stroke-dasharray": dash }));
          fat(ax, ay, ex, ey);
          if (d.kind === "arrow") { const an = Math.atan2(by - ay, bx - ax), h = 9; g.appendChild(mk("path", { d: `M${bx} ${by} L${bx + h * Math.cos(an + Math.PI - 0.45)} ${by + h * Math.sin(an + Math.PI - 0.45)} M${bx} ${by} L${bx + h * Math.cos(an + Math.PI + 0.45)} ${by + h * Math.sin(an + Math.PI + 0.45)}`, stroke: col, "stroke-width": lw(1.6, 0.8), fill: "none" })); }
          if (d.kind === "measure") { const pc = ((B.p - A.p) / A.p) * 100; const di = Math.abs(barIndex(B.t) - barIndex(A.t)); const lab = mk("text", { x: (ax + bx) / 2, y: Math.min(ay, by) - 8, fill: col, "font-size": 11, "text-anchor": "middle", "font-family": "var(--font-num)" }); lab.textContent = `${pc >= 0 ? "+" : ""}${pc.toFixed(2)}% · ${di} bars`; g.appendChild(lab); }
          grip([{ x: ax, y: ay }, { x: bx, y: by }]); return g;
        }
        if (d.kind === "rect") { g.appendChild(mk("rect", { x: Math.min(ax, bx), y: Math.min(ay, by), width: Math.abs(bx - ax), height: Math.abs(by - ay), fill: col, "fill-opacity": 0.08, stroke: col, "stroke-width": lw(1, 1), "stroke-dasharray": dash })); grip([{ x: ax, y: ay }, { x: bx, y: by }]); return g; }
        if (d.kind === "fib") {
          const hi = Math.max(A.p, B.p), lo = Math.min(A.p, B.p), x1 = Math.min(ax, bx);
          FIB.forEach((f) => { const price = hi - (hi - lo) * f; const y = yOf(price); if (y == null) return; g.appendChild(mk("line", { x1, y1: y, x2: W, y2: y, stroke: col, "stroke-width": 1, "stroke-dasharray": "4 4", opacity: 0.6 })); const tx = mk("text", { x: x1 + 4, y: y - 3, fill: col, "font-size": 9.5, "font-family": "var(--font-num)", opacity: 0.85 }); tx.textContent = `${(f * 100).toFixed(1)}%  ${price.toFixed(prec)}`; g.appendChild(tx); });
          fat(x1, yOf(hi) ?? 0, x1, yOf(lo) ?? 0); grip([{ x: ax, y: ay }, { x: bx, y: by }]); return g;
        }
        return g;
      }
      // floating style/delete toolbar over the selected drawing
      // TradingView-style floating style bar over the selected drawing: color, width, dash, (text) size, delete
      const bar = document.createElement("div"); bar.className = "draw-bar"; bar.style.display = "none"; wrap.appendChild(bar); barRef.current = bar;
      const COLORS = ["#4d82ff", "#26c281", "#f0566b", "#e8b339", "#d6dae3"];
      const styled = new Set(["trendline", "ray", "vline", "hline", "arrow", "rect"]);   // width + dash apply
      const DASHES: [string, string][] = [["solid", "M2 6h16"], ["dashed", "M2 6h4M8 6h4M14 6h4"], ["dotted", "M2 6h.5M6 6h.5M10 6h.5M14 6h.5M18 6h.5"]];
      const buildBar = (d: Drawing) => {
        const sw = (a: boolean) => (a ? " on" : "");
        let h = COLORS.map((cc) => `<button data-c="${cc}" class="dsw${sw((d.color || "#4d82ff") === cc)}" style="background:${cc}" title="${cc}"></button>`).join("");
        if (d.kind === "text") {
          h += `<span class="bar-sep"></span>` + [["12", "S"], ["16", "M"], ["22", "L"]].map(([fs, l]) => `<button data-fs="${fs}" class="dfi${sw((d.fontSize ?? 13) === +fs)}">${l}</button>`).join("");
        } else if (styled.has(d.kind)) {
          h += `<span class="bar-sep"></span>` + [1.5, 2.5, 4].map((w) => `<button data-w="${w}" class="dwi${sw((d.width ?? 1.6) === w)}" title="${w}px"><i style="height:${Math.max(1, Math.round(w - 0.5))}px"></i></button>`).join("");
          h += `<span class="bar-sep"></span>` + DASHES.map(([k, p]) => `<button data-dash="${k}" class="ddi${sw((d.dash || "solid") === k)}" title="${k}"><svg viewBox="0 0 20 12"><path d="${p}"/></svg></button>`).join("");
        }
        h += `<span class="bar-sep"></span><button class="bar-del" data-del="1" title="Delete"><svg viewBox="0 0 24 24"><path d="M5 7h14M9 7V5h6v2M7 7l1 13h8l1-13"/></svg></button>`;
        bar.innerHTML = h;
      };
      bar.addEventListener("pointerdown", (e) => {
        e.stopPropagation(); const tg = (e.target as HTMLElement)?.closest("button") as HTMLElement | null; if (!tg || !sel) return;
        if (tg.getAttribute("data-del")) { const s = sel; sel = null; onChangeRef.current?.(drawRef.current.filter((d) => d.id !== s)); return; }
        const cc = tg.getAttribute("data-c"), w = tg.getAttribute("data-w"), dd = tg.getAttribute("data-dash"), fs = tg.getAttribute("data-fs");
        const patch = cc ? { color: cc } : w ? { width: +w } : dd ? { dash: dd as any } : fs ? { fontSize: +fs } : null;
        if (patch) { drawRef.current = drawRef.current.map((d) => d.id === sel ? { ...d, ...patch } : d); onChangeRef.current?.([...drawRef.current]); }
      });
      let barSig = "";
      const positionBar = () => {
        const d = drawRef.current.find((x) => x.id === sel);
        if (sel && d && d.points[0]) {
          const ax = xOf(d.points[0].t), ay = yOf(d.points[0].p);
          if (ax != null && ay != null) {
            const sig = `${d.id}|${d.kind}|${d.color}|${d.width}|${d.dash}|${d.fontSize}`;
            if (sig !== barSig) { buildBar(d); barSig = sig; }
            bar.style.display = "flex";
            bar.style.left = Math.max(4, Math.min(el!.clientWidth - bar.offsetWidth - 4, ax - 8)) + "px";
            bar.style.top = Math.max(4, ay - 46) + "px";
            return;
          }
        }
        bar.style.display = "none"; barSig = "";
      };
      // inline, editable text box (replaces the old window.prompt) — type directly on the chart
      let textEditEl: HTMLInputElement | null = null;
      const openTextEditor = (at: { t: string; p: number }, existing?: Drawing) => {
        if (textEditEl) { try { textEditEl.remove(); } catch {} textEditEl = null; } textEditRef.current = null;
        const ax = xOf(at.t), ay = yOf(at.p); if (ax == null || ay == null) return;
        const fs = existing?.fontSize ?? 13;
        const inp = document.createElement("input");
        inp.className = "text-edit"; inp.value = existing?.text || ""; inp.placeholder = "Add text";
        inp.style.left = ax + "px"; inp.style.top = (ay - fs - 4) + "px"; inp.style.fontSize = fs + "px";
        inp.style.color = existing ? dcol(existing) : css("--text");
        wrap.appendChild(inp); textEditEl = inp; textEditRef.current = inp;
        window.setTimeout(() => { inp.focus(); inp.select(); }, 0);
        let done = false;
        const commit = (save: boolean) => {
          if (done) return; done = true; const val = inp.value.trim();
          try { inp.remove(); } catch {} textEditEl = null; if (textEditRef.current === inp) textEditRef.current = null;
          if (!save) return;
          if (existing) onChangeRef.current?.(val ? drawRef.current.map((d) => d.id === existing.id ? { ...d, text: val } : d) : drawRef.current.filter((d) => d.id !== existing.id));
          else if (val) onChangeRef.current?.([...drawRef.current, { id: uid(), kind: "text", points: [at], text: val, fontSize: fs }]);
        };
        inp.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") { e.preventDefault(); commit(true); } else if (e.key === "Escape") { e.preventDefault(); commit(false); } });
        inp.addEventListener("blur", () => commit(true));
      };
      // right-click context menu
      const ctxm = document.createElement("div"); ctxm.className = "ctx-menu"; ctxm.style.display = "none"; wrap.appendChild(ctxm); ctxRef.current = ctxm;
      ctxm.innerHTML = `<div data-a="hline">Horizontal line here</div><div data-a="clear">Remove all drawings</div><div class="sep"></div><div data-a="reset">Reset chart view</div>`;
      let ctxPt: { t: string; p: number } = { t: "", p: 0 };
      const hideCtx = () => { if (ctxRef.current) ctxRef.current.style.display = "none"; };
      onCtx = (e: MouseEvent) => { e.preventDefault(); const r = wrap.getBoundingClientRect(); const x = e.clientX - r.left, y = e.clientY - r.top; ctxPt = snap(x, y); ctxm.style.left = Math.min(x, el!.clientWidth - 180) + "px"; ctxm.style.top = Math.min(y, el!.clientHeight - 130) + "px"; ctxm.style.display = "block"; };
      ctxm.addEventListener("pointerdown", (e) => {
        e.stopPropagation(); const a = (e.target as HTMLElement).getAttribute("data-a"); hideCtx();
        if (a === "hline") onChangeRef.current?.([...drawRef.current, { id: uid(), kind: "hline", points: [ctxPt] }]);
        else if (a === "clear") onChangeRef.current?.([]);
        else if (a === "reset") { try { chart.timeScale().fitContent(); } catch {} }
      });
      wrap.addEventListener("contextmenu", onCtx);
      winDown = (e: PointerEvent) => { hideCtx(); if (!toolRef.current && sel) { const tg = e.target as Element; if (tg && !tg.closest?.("g[data-id]") && !tg.closest?.(".draw-bar") && !tg.closest?.(".text-edit")) { sel = null; renderDraw(); } } };
      window.addEventListener("pointerdown", winDown);
      const renderDraw = () => {
        const svgEl = svgRef.current; if (!svgEl) return;
        while (svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);
        for (const d of drawRef.current) svgEl.appendChild(shape(d));
        positionBar();
      };
      renderRef.current = renderDraw;
      // coalesce the overlay rebuild to one paint per frame on the hot pan/zoom path
      // (a drag fires many range-change events; with sync this is also mirrored across panes)
      const scheduleRender = () => { if (rafId != null) return; rafId = requestAnimationFrame(() => { rafId = null; if (!dead) { renderSignals(); renderDraw(); } }); };
      chart.timeScale().subscribeVisibleLogicalRangeChange(scheduleRender);
      renderSignals(); renderDraw();

      // ── pane geometry measurement → drives the legend/pane-menu overlay layer ──
      const measureImpl = () => {
        const ch = chartRef.current, w = wrapElRef.current; if (!ch || dead || !w) return;
        const wr = w.getBoundingClientRect();
        // match panes by current index, not object identity — lightweight-charts hands back fresh
        // IPaneApi wrappers, so series.getPane() !== chart.panes()[i]; paneIndex() stays consistent
        // for the same underlying pane (and updates together after swapPanes reorders).
        const metaByIndex = new Map<number, typeof panesMeta.current[number]>();
        for (const m of panesMeta.current) { let mi = -1; try { mi = m.pane.paneIndex(); } catch {} if (mi >= 0) metaByIndex.set(mi, m); }
        const ctl = paneCtl.current;
        const layout: PaneInfo[] = [];
        let panesApi: IPaneApi<any>[] = []; try { panesApi = ch.panes(); } catch {}
        for (const paneApi of panesApi) {
          let pi = 0; try { pi = paneApi.paneIndex(); } catch {}
          const m = metaByIndex.get(pi); if (!m) continue;
          let top = 0, height = 0;
          try { const pe = paneApi.getHTMLElement(); if (pe) { const r = pe.getBoundingClientRect(); top = r.top - wr.top; height = r.height; } } catch {}
          layout.push({ key: m.key, paneIndex: pi, isPrice: m.isPrice, top, height, collapsed: ctl.collapsed.has(m.key), maximized: ctl.maximized === m.key, entries: m.entries.map((e) => ({ ...e, hidden: hiddenRef.current.has(e.key) })) });
        }
        layout.sort((a, b) => a.paneIndex - b.paneIndex);
        paneLayoutRef.current = layout; setPaneLayout(layout);
      };
      measureRef.current = measureImpl;
      const scheduleMeasure = () => { if (measRaf != null) return; measRaf = requestAnimationFrame(() => { measRaf = null; if (!dead) measureImpl(); }); };

      // cross-pane sync: register this pane, then mirror crosshair (by time) + visible range
      if (syncId != null) {
        const closeByTime = new Map(barsRef.current.map((r) => [r.time, r.c]));
        syncCleanup = registerPane(syncId, { chart, series: priceS, valueAt: (t) => closeByTime.get(t as any) ?? null, tf: timeframe });
        chart.subscribeCrosshairMove((p) => { if (dead) return; broadcastCrosshair(syncId, (p.time ?? null) as any); });
        chart.timeScale().subscribeVisibleLogicalRangeChange((r) => { if (dead) return; broadcastRange(syncId, r as any); });
      }

      const rectXY = (ev: PointerEvent) => { const r = svg.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; };
      const idAt = (ev: Event) => (ev.target as Element)?.closest?.("g[data-id]")?.getAttribute("data-id") || null;
      const TWO = new Set(["trendline", "ray", "rect", "fib", "measure", "arrow"]);

      // select + drag existing drawings in cursor mode (capture phase; runs before creation)
      svg.addEventListener("pointerdown", (ev) => {
        if (toolRef.current || !activeRef.current) return; const id = idAt(ev); if (!id) { if (sel) { sel = null; renderDraw(); } return; }
        ev.stopPropagation(); sel = id; renderDraw();
        const d0 = drawRef.current.find((x) => x.id === id); if (!d0) return;
        const s0 = rectXY(ev); const start = snap(s0.x, s0.y); const orig = d0.points.map((p) => ({ ...p }));
        const move = (e: PointerEvent) => {
          const m0 = rectXY(e); const cur = snap(m0.x, m0.y); const dp = cur.p - start.p, di = barIndex(cur.t) - barIndex(start.t), bars = barsRef.current;
          drawRef.current = drawRef.current.map((x) => x.id !== id ? x : { ...x, points: orig.map((pt) => { const ni = Math.max(0, Math.min(bars.length - 1, barIndex(pt.t) + di)); return { t: bars[ni]?.time || pt.t, p: +(pt.p + dp).toFixed(prec) }; }) });
          renderDraw();
        };
        const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); dragCleanup = null; onChangeRef.current?.([...drawRef.current]); };
        dragCleanup = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
        window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
      }, true);

      // creation / erase (bubble; svg is pointer-events:auto only when a tool is active)
      svg.addEventListener("pointerdown", (ev) => {
        const t = toolRef.current; if (!t) return; const { x, y } = rectXY(ev); const a = snap(x, y);
        if (t === "erase") { const id = idAt(ev); if (id) onChangeRef.current?.(drawRef.current.filter((d) => d.id !== id)); return; }
        if (t === "hline") { onChangeRef.current?.([...drawRef.current, { id: uid(), kind: "hline", points: [a] }]); return; }
        if (t === "vline") { onChangeRef.current?.([...drawRef.current, { id: uid(), kind: "vline", points: [a] }]); return; }
        if (t === "text") { openTextEditor(a); return; }
        if (TWO.has(t)) { pending = { kind: t, a }; try { svg.setPointerCapture(ev.pointerId); } catch {} }
      });
      // double-click a text drawing to edit it in place
      svg.addEventListener("dblclick", (ev) => {
        if (!activeRef.current) return; const id = idAt(ev); const d = drawRef.current.find((x) => x.id === id);
        if (d && d.kind === "text") { ev.stopPropagation(); ev.preventDefault(); openTextEditor(d.points[0], d); }
      });
      svg.addEventListener("pointermove", (ev) => {
        if (!pending) return; const { x, y } = rectXY(ev); const b = snap(x, y);
        renderDraw(); svg.appendChild(shape({ id: "_p", kind: pending.kind as any, points: [pending.a, b] }, true));
      });
      svg.addEventListener("pointerup", (ev) => {
        if (!pending) return; const { x, y } = rectXY(ev); const b = snap(x, y); const a = pending.a; const kind = pending.kind; pending = null;
        if (Math.abs((xOf(a.t) ?? 0) - (xOf(b.t) ?? 0)) < 3 && Math.abs((yOf(a.p) ?? 0) - (yOf(b.p) ?? 0)) < 3) { renderDraw(); return; }
        onChangeRef.current?.([...drawRef.current, { id: uid(), kind: kind as any, points: [a, b] }]);
      });

      onKey = (e: KeyboardEvent) => {
        if (!activeRef.current) return;
        const tag = (e.target as HTMLElement)?.tagName?.toLowerCase(); if (tag === "input" || tag === "textarea") return;
        if (e.key === "Escape") { if (sel) { sel = null; renderDraw(); } }
        else if ((e.key === "Delete" || e.key === "Backspace") && sel) { e.preventDefault(); const s = sel; sel = null; onChangeRef.current?.(drawRef.current.filter((d) => d.id !== s)); }
      };
      window.addEventListener("keydown", onKey);

      // ── pane hover + double-click (collapse-all on the price pane, maximize on a sub-pane) ──
      onPaneMove = (e: MouseEvent) => {
        const w = wrapElRef.current; if (!w) return; const wr = w.getBoundingClientRect(); const y = e.clientY - wr.top;
        let hk: string | null = null; for (const p of paneLayoutRef.current) { if (y >= p.top && y <= p.top + p.height) { hk = p.key; break; } }
        if (hk !== hoveredKeyRef.current) { hoveredKeyRef.current = hk; setHoveredKey(hk); }
      };
      onPaneLeave = () => { if (hoveredKeyRef.current !== null) { hoveredKeyRef.current = null; setHoveredKey(null); } };
      onPaneDbl = (e: MouseEvent) => {
        if ((e.target as Element)?.closest?.(".chart-overlays")) return; if (toolRef.current) return;
        const w = wrapElRef.current; if (!w) return; const wr = w.getBoundingClientRect(); const y = e.clientY - wr.top;
        const p = paneLayoutRef.current.find((q) => y >= q.top && y <= q.top + q.height); if (!p) return;
        if (p.isPrice) collapseAllPanes(); else doMaximize(p.paneIndex);
      };
      wrap.addEventListener("mousemove", onPaneMove); wrap.addEventListener("mouseleave", onPaneLeave); wrap.addEventListener("dblclick", onPaneDbl);

      // observe each pane element so separator drags / collapses reposition the overlay + rebaseline sizes
      paneRO = new ResizeObserver(() => { if (dead) return; captureNormal(); scheduleMeasure(); });
      for (const m of panesMeta.current) { try { const pe = m.pane.getHTMLElement(); if (pe) paneRO.observe(pe); } catch {} }

      ro = new ResizeObserver(() => { const ch2 = chartRef.current; if (!ch2) return; const r = ch2.timeScale().getVisibleLogicalRange(); ch2.resize(el.clientWidth, el.clientHeight); if (r) ch2.timeScale().setVisibleLogicalRange(r); scheduleRender(); scheduleMeasure(); });
      ro.observe(el);

      applyHidden();
      scheduleMeasure();
    })();

    return () => { dead = true; if (rafId != null) cancelAnimationFrame(rafId); if (measRaf != null) cancelAnimationFrame(measRaf); if (syncCleanup) syncCleanup(); if (dragCleanup) dragCleanup(); window.removeEventListener("mm:snapshot", snap0); if (onKey) window.removeEventListener("keydown", onKey); if (winDown) window.removeEventListener("pointerdown", winDown); const wEl = wrapElRef.current; if (wEl) { if (onCtx) wEl.removeEventListener("contextmenu", onCtx); if (onPaneMove) wEl.removeEventListener("mousemove", onPaneMove); if (onPaneLeave) wEl.removeEventListener("mouseleave", onPaneLeave); if (onPaneDbl) wEl.removeEventListener("dblclick", onPaneDbl); } paneRO?.disconnect(); ro?.disconnect(); if (textEditRef.current) { try { textEditRef.current.remove(); } catch {} textEditRef.current = null; } if (ctxRef.current) { try { ctxRef.current.remove(); } catch {} ctxRef.current = null; } if (barRef.current) { try { barRef.current.remove(); } catch {} barRef.current = null; } if (sigRef.current) { try { sigRef.current.remove(); } catch {} sigRef.current = null; } if (svgRef.current) { try { svgRef.current.remove(); } catch {} svgRef.current = null; } if (chartRef.current) { try { chartRef.current.remove(); } catch {} chartRef.current = null; } };
  }, [symbol, chartType, timeframe, replayIdx, Array.from(indicators).sort().join(","), (compare || []).join(","), syncId, csNonce, pineKey, indParamsKey]); // eslint-disable-line

  // re-render overlay + toggle interactivity on tool/drawings change (no chart rebuild)
  useEffect(() => { renderRef.current?.(); const svg = svgRef.current; if (svg) { svg.style.pointerEvents = tool ? "auto" : "none"; svg.style.cursor = tool === "erase" ? "pointer" : tool ? "crosshair" : "default"; } }, [tool, drawings]);

  // flip series visibility when the legend's eye toggles an indicator hidden (no chart rebuild)
  useEffect(() => { hiddenRef.current = hidden; applyHidden(); measureRef.current(); }, [hidden]); // eslint-disable-line

  // detection commands → append auto-drawings (or clear)
  useEffect(() => {
    if (!detectCmd) return; let tries = 0; let timer: any;
    const run = () => {
      const bars = barsRef.current as DBar[];
      if (!bars.length) { if (tries++ < 25) timer = setTimeout(run, 150); return; }   // data still loading — retry instead of silently dropping
      if (detectCmd.kind === "clear") { onChangeRef.current?.(drawRef.current.filter((d) => !d.auto)); return; }
      let add: Drawing[] = [];
      if (detectCmd.kind === "trendlines") add = autoTrendlines(bars);
      else if (detectCmd.kind === "fib") { const f = autoFib(bars); if (f) add = [f]; }
      else if (detectCmd.kind === "sr") add = srDrawings(bars);
      else if (detectCmd.kind === "mtfa") add = mtfaDrawings(bars);
      if (add.length) onChangeRef.current?.([...drawRef.current.filter((d) => !d.auto), ...add]);
    };
    run();
    return () => clearTimeout(timer);
  }, [detectCmd?.nonce]); // eslint-disable-line

  return (
    <div className="chart-wrap">
      <div className="statusline">
        <span ref={statusRef} />
        <span className="mm"><i style={{ background: "currentColor" }} /><span ref={verdictRef}>GOLDEN ORACLE</span></span>
        {replayIdx != null && <span className="mm" style={{ background: "rgba(232,179,57,.14)", borderColor: "rgba(232,179,57,.35)", color: "var(--signal)" }}><i style={{ background: "var(--signal)" }} />REPLAY</span>}
      </div>
      <div ref={ref} style={{ position: "absolute", inset: 0 }} />
      <ChartOverlays
        panes={paneLayout} hoveredKey={hoveredKey} legendOpen={legendOpen} onToggleLegend={() => setLegendOpen((o) => !o)}
        onEye={(k) => onToggleHidden?.(k)} onSettings={(k) => onOpenSettings?.(k)} onSource={(k) => onOpenSource?.(k)} onRemove={(k) => onRemoveInd?.(k)}
        onMoveUp={(pi) => doMove(pi, -1)} onMoveDown={(pi) => doMove(pi, 1)} onCollapse={doCollapse} onMaximize={doMaximize}
        canMoveUp={canMoveUp} canMoveDown={canMoveDown}
      />
    </div>
  );
}
