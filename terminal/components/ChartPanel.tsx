"use client";
import { useEffect, useRef } from "react";
import {
  createChart, CandlestickSeries, BarSeries, LineSeries, AreaSeries, HistogramSeries,
  CrosshairMode, createSeriesMarkers, type IChartApi, type ISeriesApi,
} from "lightweight-charts";
import { type Drawing, type Bar as DBar, FIB, uid, autoTrendlines, autoFib, srDrawings, mtfaDrawings } from "@/lib/drawings";

const css = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
type Bar = { time: string; o: number; h: number; l: number; c: number; v: number };
export type DetectCmd = { kind: "trendlines" | "fib" | "sr" | "mtfa" | "clear"; nonce: number } | null;

// ---- indicator math ----
function ema(a: (number | null)[], p: number) { const o: (number | null)[] = Array(a.length).fill(null); const k = 2 / (p + 1); let pr: number | null = null, s = 0, c = 0; for (let i = 0; i < a.length; i++) { const v = a[i]; if (v == null) { o[i] = pr; continue; } if (pr == null) { s += v; c++; if (c === p) { pr = s / p; o[i] = pr; } } else { pr = v * k + pr * (1 - k); o[i] = pr; } } return o; }
function sma(a: (number | null)[], p: number) { const o: (number | null)[] = Array(a.length).fill(null); const q: number[] = []; let s = 0; for (let i = 0; i < a.length; i++) { const v = a[i]; q.push(v == null ? 0 : v); if (v != null) s += v; if (q.length > p) s -= q.shift()!; if (q.length === p) o[i] = s / p; } return o; }
function stddev(a: number[], p: number) { const o: (number | null)[] = Array(a.length).fill(null); for (let i = p - 1; i < a.length; i++) { const w = a.slice(i - p + 1, i + 1); const m = w.reduce((x, y) => x + y, 0) / p; o[i] = Math.sqrt(w.reduce((x, y) => x + (y - m) ** 2, 0) / p); } return o; }
function rsi(cl: number[], p = 14) { const o: (number | null)[] = Array(cl.length).fill(null); let g = 0, l = 0; for (let i = 1; i < cl.length; i++) { const ch = cl[i] - cl[i - 1], u = ch > 0 ? ch : 0, d = ch < 0 ? -ch : 0; if (i <= p) { g += u; l += d; if (i === p) { g /= p; l /= p; o[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); } } else { g = (g * (p - 1) + u) / p; l = (l * (p - 1) + d) / p; o[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); } } return o; }
function stochRsi(cl: number[]) { const r = rsi(cl, 14); const raw: (number | null)[] = Array(cl.length).fill(null); for (let i = 0; i < cl.length; i++) { if (r[i] == null) continue; let hh = -1e9, ll = 1e9, ok = true; for (let j = i - 13; j <= i; j++) { if (j < 0 || r[j] == null) { ok = false; break; } hh = Math.max(hh, r[j]!); ll = Math.min(ll, r[j]!); } if (ok) raw[i] = hh === ll ? 50 : (100 * (r[i]! - ll)) / (hh - ll); } const k = sma(raw, 3); return { k, d: sma(k, 3) }; }
function macd(cl: number[]) { const ef = ema(cl, 12), es = ema(cl, 26); const line = cl.map((_, i) => (ef[i] != null && es[i] != null ? ef[i]! - es[i]! : null)); const sig = ema(line, 9); const hist = line.map((_, i) => (line[i] != null && sig[i] != null ? line[i]! - sig[i]! : null)); return { line, sig, hist }; }
const toLine = (rows: Bar[], arr: (number | null)[]) => rows.map((r, i) => (arr[i] != null && isFinite(arr[i]!) ? { time: r.time, value: arr[i]! } : null)).filter(Boolean) as any[];

function resampleTf(rows: Bar[], tf: string): Bar[] {
  if (tf === "D" || rows.length === 0) return rows;
  const out: Bar[] = []; let cur: Bar | null = null; let key: any = null;
  const isoWeek = (d: string) => { const dt = new Date(d + "T00:00:00Z"); const day = (dt.getUTCDay() + 6) % 7; dt.setUTCDate(dt.getUTCDate() - day); return dt.toISOString().slice(0, 10); };
  for (let i = 0; i < rows.length; i++) { const r = rows[i]; const k = tf === "W" ? isoWeek(r.time) : tf === "1M" ? r.time.slice(0, 7) : Math.floor(i / 3); if (k !== key) { if (cur) out.push(cur); key = k; cur = { ...r }; } else { cur!.h = Math.max(cur!.h, r.h); cur!.l = Math.min(cur!.l, r.l); cur!.c = r.c; cur!.time = r.time; cur!.v += r.v; } }
  if (cur) out.push(cur); return out;
}
function heikin(rows: Bar[]): Bar[] { const out: Bar[] = []; let po = 0, pc = 0; for (let i = 0; i < rows.length; i++) { const r = rows[i]; const hc = (r.o + r.h + r.l + r.c) / 4; const ho = i === 0 ? (r.o + r.c) / 2 : (po + pc) / 2; out.push({ ...r, o: ho, c: hc, h: Math.max(r.h, ho, hc), l: Math.min(r.l, ho, hc) }); po = ho; pc = hc; } return out; }

const cache: Record<string, { ohlc: any; slice: any }> = {};
const NS = "http://www.w3.org/2000/svg";
const mk = (tag: string, attrs: Record<string, any>) => { const e = document.createElementNS(NS, tag); for (const k in attrs) if (attrs[k] != null) e.setAttribute(k, String(attrs[k])); return e; };

export default function ChartPanel({ symbol, chartType = "candles", indicators, timeframe = "D", replayIdx = null, onMeta, tool = null, drawings = [], onDrawingsChange, detectCmd = null, magnet = false, compare = [] }:
  { symbol: string; chartType?: string; indicators: Set<string>; timeframe?: string; replayIdx?: number | null; onMeta?: (m: { total: number }) => void;
    tool?: string | null; drawings?: Drawing[]; onDrawingsChange?: (d: Drawing[]) => void; detectCmd?: DetectCmd; magnet?: boolean; compare?: string[] }) {
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
  const barRef = useRef<HTMLDivElement | null>(null);
  const ctxRef = useRef<HTMLDivElement | null>(null);
  drawRef.current = drawings; toolRef.current = tool; onChangeRef.current = onDrawingsChange; magnetRef.current = magnet;

  useEffect(() => {
    const el = ref.current; if (!el) return;
    let ro: ResizeObserver | null = null, dead = false;
    let onKey: ((e: KeyboardEvent) => void) | null = null;
    let onCtx: ((e: MouseEvent) => void) | null = null, winDown: ((e: PointerEvent) => void) | null = null, dragCleanup: (() => void) | null = null;
    const snap = () => { try { const c = chartRef.current!.takeScreenshot(); const a = document.createElement("a"); a.href = c.toDataURL(); a.download = `${symbol}.png`; a.click(); } catch {} };
    window.addEventListener("mm:snapshot", snap);

    (async () => {
      if (!cache[symbol]) {
        const [ohlc, slice] = await Promise.all([
          fetch(`/data/${symbol}.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
          fetch(`/data/${symbol}.slice.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        ]);
        cache[symbol] = { ohlc, slice };
      }
      if (dead) return;
      const { ohlc, slice } = cache[symbol];
      if (!ohlc?.bars?.length) { if (statusRef.current) statusRef.current.textContent = "No data for this symbol."; return; }

      let rows: Bar[] = ohlc.bars.map((b: any[]) => ({ time: b[0], o: b[1], h: b[2], l: b[3], c: b[4], v: b[5] }));
      rows = resampleTf(rows, timeframe).slice(-220);
      if (onMeta) onMeta({ total: rows.length });
      if (replayIdx != null) rows = rows.slice(0, Math.max(20, replayIdx + 1));
      const display = chartType === "heikin" ? heikin(rows) : rows;
      const closes = rows.map((r) => r.c);
      barsRef.current = rows;
      const c = { up: css("--up"), down: css("--down"), grid: css("--grid"), line: css("--line"), p3: css("--panel-3"), link: css("--link"), warn: css("--warn"), buy: css("--buy"), sell: css("--sell"), mut: css("--muted"), brand2: css("--brand-2") };

      if (chartRef.current) { try { chartRef.current.remove(); } catch {} }
      const chart = createChart(el, {
        width: el.clientWidth || 900, height: el.clientHeight || 600,
        layout: { background: { color: "transparent" }, textColor: c.mut, fontSize: 11, attributionLogo: false, panes: { separatorColor: c.line } },
        grid: { vertLines: { color: c.grid }, horzLines: { color: c.grid } },
        crosshair: { mode: CrosshairMode.Normal, vertLine: { color: "rgba(214,218,227,.32)", width: 1, labelBackgroundColor: c.p3 }, horzLine: { color: "rgba(214,218,227,.32)", width: 1, labelBackgroundColor: c.p3 } },
        rightPriceScale: { borderColor: c.line, scaleMargins: { top: 0.1, bottom: 0.08 } },
        timeScale: { borderColor: c.line, rightOffset: 6, barSpacing: 8 },
      });
      chartRef.current = chart;
      const prec = closes[closes.length - 1] < 10 ? 4 : 2;
      const pf = { type: "price" as const, precision: prec, minMove: Math.pow(10, -prec) };

      let priceS: any;
      if (chartType === "line") { priceS = chart.addSeries(LineSeries, { color: c.brand2, lineWidth: 2, priceFormat: pf }, 0); priceS.setData(display.map((r) => ({ time: r.time, value: r.c }))); }
      else if (chartType === "area") { priceS = chart.addSeries(AreaSeries, { lineColor: c.brand2, topColor: "rgba(41,98,255,.30)", bottomColor: "rgba(41,98,255,.02)", lineWidth: 2, priceFormat: pf }, 0); priceS.setData(display.map((r) => ({ time: r.time, value: r.c }))); }
      else if (chartType === "bars") { priceS = chart.addSeries(BarSeries, { upColor: c.up, downColor: c.down, priceFormat: pf }, 0); priceS.setData(display.map((r) => ({ time: r.time, open: r.o, high: r.h, low: r.l, close: r.c }))); }
      else { priceS = chart.addSeries(CandlestickSeries, { upColor: c.up, downColor: c.down, wickUpColor: c.up, wickDownColor: c.down, borderVisible: false, priceFormat: pf }, 0); priceS.setData(display.map((r) => ({ time: r.time, open: r.o, high: r.h, low: r.l, close: r.c }))); }
      seriesRef.current = priceS;

      if (indicators.has("ema")) ([[20, c.warn], [50, c.link], [200, "rgba(214,218,227,.4)"]] as [number, string][]).forEach(([p, col]) => { const ln = chart.addSeries(LineSeries, { color: col, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }, 0); ln.setData(toLine(rows, ema(closes, p))); });
      if (indicators.has("bb")) { const basis = sma(closes, 20); const sd = stddev(closes, 20); const up = closes.map((_, i) => (basis[i] != null && sd[i] != null ? basis[i]! + 2 * sd[i]! : null)); const lo = closes.map((_, i) => (basis[i] != null && sd[i] != null ? basis[i]! - 2 * sd[i]! : null)); [up, basis, lo].forEach((arr, j) => { const ln = chart.addSeries(LineSeries, { color: j === 1 ? "rgba(214,218,227,.45)" : "rgba(77,130,255,.55)", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }, 0); ln.setData(toLine(rows, arr)); }); }
      if (indicators.has("vwap")) { let cum = 0, cumv = 0; const vw = rows.map((r) => { const tp = (r.h + r.l + r.c) / 3; cum += tp * r.v; cumv += r.v; return cumv ? cum / cumv : null; }); const ln = chart.addSeries(LineSeries, { color: "#e8b339", lineWidth: 1.4 as any, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }, 0); ln.setData(toLine(rows, vw)); }

      // compare overlays — each symbol rebased to the main symbol's first price (relative performance)
      const CMP_COLORS = ["#e8a33d", "#9d86ff", "#19c2c2", "#f06bd0"];
      for (let ci = 0; ci < (compare || []).length && ci < 4; ci++) {
        const cs = compare[ci]; if (!cs || cs === symbol) continue;
        if (!cache[cs]) { const o = await fetch(`/data/${cs}.json`).then((rr) => (rr.ok ? rr.json() : null)).catch(() => null); cache[cs] = { ohlc: o, slice: null }; }
        const co = cache[cs]?.ohlc; if (!co?.bars?.length || dead) continue;
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
      const sigs = (slice?.indicator?.signals || []).filter((s: any) => s.ts <= lastDate).slice(-8);
      const near = (iso: string) => { let b: string | null = null, bd = 1e18; const x = new Date(iso + "T00:00:00Z").getTime(); times.forEach((y) => { const dd = Math.abs(new Date(y + "T00:00:00Z").getTime() - x); if (dd < bd) { bd = dd; b = y; } }); return bd < 9e8 ? b : null; };
      const marks = sigs.map((s: any) => { const t = near(s.ts); if (!t) return null; const buy = s.type === "BUY" || s.type === "REBUY"; return { time: t, position: buy ? "belowBar" : "aboveBar", color: buy ? c.buy : c.sell, shape: buy ? "arrowUp" : "arrowDown", text: s.type }; }).filter(Boolean);
      if (marks.length) createSeriesMarkers(priceS, marks as any);

      let pane = 1;
      if (indicators.has("vol")) { const vs = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "" }, pane); vs.setData(rows.map((r) => ({ time: r.time, value: r.v, color: r.c >= r.o ? "rgba(38,194,129,.4)" : "rgba(240,86,107,.4)" }))); pane++; }
      if (indicators.has("rsi") || indicators.has("stochrsi")) {
        if (indicators.has("stochrsi")) { const sr = stochRsi(closes); const kS = chart.addSeries(LineSeries, { color: c.buy, lineWidth: 1.6 as any, lastValueVisible: true, title: "%K" }, pane); const dS = chart.addSeries(LineSeries, { color: c.sell, lineWidth: 1, lastValueVisible: true, title: "%D" }, pane); kS.setData(toLine(rows, sr.k)); dS.setData(toLine(rows, sr.d)); }
        if (indicators.has("rsi")) { const rS = chart.addSeries(LineSeries, { color: indicators.has("stochrsi") ? "rgba(214,218,227,.5)" : c.brand2, lineWidth: 1.2 as any, lastValueVisible: true, title: "RSI" }, pane); rS.setData(toLine(rows, rsi(closes, 14))); }
        pane++;
      }
      if (indicators.has("macd")) { const m = macd(closes); const hs = chart.addSeries(HistogramSeries, {}, pane); hs.setData(rows.map((r, i) => (m.hist[i] != null ? { time: r.time, value: m.hist[i]!, color: m.hist[i]! >= 0 ? "rgba(38,194,129,.5)" : "rgba(240,86,107,.5)" } : null)).filter(Boolean) as any); const lS = chart.addSeries(LineSeries, { color: c.brand2, lineWidth: 1.3 as any, title: "MACD" }, pane); const sS = chart.addSeries(LineSeries, { color: c.warn, lineWidth: 1, title: "signal" }, pane); lS.setData(toLine(rows, m.line)); sS.setData(toLine(rows, m.sig)); pane++; }

      try { const pn = chart.panes(); pn[0].setStretchFactor(3.4); for (let i = 1; i < pn.length; i++) pn[i].setStretchFactor(1); } catch {}

      const last = rows[rows.length - 1], prev = rows[rows.length - 2] || last;
      if (statusRef.current) { const ch = last.c - prev.c, cp = (ch / prev.c) * 100, u = ch >= 0, f = (x: number) => x.toFixed(prec); statusRef.current.innerHTML = `<span class="mut">O</span><b>${f(last.o)}</b> <span class="mut">H</span><b>${f(last.h)}</b> <span class="mut">L</span><b>${f(last.l)}</b> <span class="mut">C</span><b>${f(last.c)}</b> <b class="${u ? "up" : "down"}">${u ? "+" : ""}${f(ch)} (${u ? "+" : ""}${cp.toFixed(2)}%)</b>`; }
      if (verdictRef.current) { const v = slice?.indicator?.state?.last_signal || "—"; const buy = v === "BUY" || v === "REBUY"; verdictRef.current.textContent = `GOLDEN ORACLE · ${v}`; verdictRef.current.style.color = buy ? c.buy : c.sell; const w = verdictRef.current.parentElement as HTMLElement; if (w) { w.style.background = buy ? "rgba(38,194,129,.12)" : "rgba(240,86,107,.12)"; w.style.borderColor = buy ? "rgba(38,194,129,.3)" : "rgba(240,86,107,.3)"; } }
      chart.timeScale().fitContent();

      // ---------- drawing overlay (synced to chart coordinates) ----------
      const wrap = el.parentElement as HTMLElement;
      const svg = mk("svg", { style: "position:absolute;inset:0;width:100%;height:100%;z-index:4;pointer-events:none" }) as SVGSVGElement;
      wrap.appendChild(svg); svgRef.current = svg;
      const dcol = (d: Drawing) => d.color?.startsWith("var(") ? css(d.color.slice(4, -1)) : (d.color || c.brand2);
      const xOf = (t: string) => chart.timeScale().timeToCoordinate(t as any) as number | null;
      const yOf = (p: number) => priceS.priceToCoordinate(p) as number | null;
      const barIndex = (t: string) => { const b = barsRef.current; for (let k = 0; k < b.length; k++) if (b[k].time === t) return k; return -1; };
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
        const ax = A ? xOf(A.t) : null, ay = A ? yOf(A.p) : null;
        if (d.kind === "hline") {
          if (ay == null) return g;
          const sw = (d.meta && (d.meta as any).strength ? 0.4 + 1.0 * (d.meta as any).strength : 1.3) + (on ? 1 : 0);
          g.appendChild(mk("line", { x1: 0, y1: ay, x2: W, y2: ay, stroke: col, "stroke-width": sw, "stroke-dasharray": d.auto ? "5 4" : "" }));
          fat(0, ay, W, ay);
          const label = (d.meta as any)?.label || A.p.toFixed(prec);
          const tx = mk("text", { x: W - 6, y: ay - 4, fill: col, "font-size": 10, "text-anchor": "end", "font-family": "var(--font-num)" }); tx.textContent = String(label);
          g.appendChild(tx); grip([{ x: W / 2, y: ay }]); return g;
        }
        if (d.kind === "vline") {
          if (ax == null) return g;
          g.appendChild(mk("line", { x1: ax, y1: 0, x2: ax, y2: H, stroke: col, "stroke-width": on ? 2.3 : 1.3, "stroke-dasharray": d.auto ? "5 4" : "" }));
          fat(ax, 0, ax, H); grip([{ x: ax, y: H / 2 }]); return g;
        }
        const bx = B ? xOf(B.t) : null, by = B ? yOf(B.p) : null;
        if (d.kind === "text") { if (ax == null || ay == null) return g; g.appendChild(mk("rect", { x: ax - 3, y: ay - 13, width: Math.max(40, (d.text || "").length * 7), height: 18, fill: "transparent" })); const tx = mk("text", { x: ax, y: ay, fill: col, "font-size": 12, "font-family": "var(--font-ui)" }); tx.textContent = d.text || "text"; g.appendChild(tx); grip([{ x: ax, y: ay - 6 }]); return g; }
        if (ax == null || ay == null || bx == null || by == null) return g;
        if (d.kind === "trendline" || d.kind === "ray" || d.kind === "measure" || d.kind === "arrow") {
          let ex = bx, ey = by;
          if (d.kind === "ray" && bx !== ax) { const m = (by - ay) / (bx - ax); ex = W; ey = ay + m * (W - ax); }
          g.appendChild(mk("line", { x1: ax, y1: ay, x2: ex, y2: ey, stroke: col, "stroke-width": on ? 2.4 : 1.6 }));
          fat(ax, ay, ex, ey);
          if (d.kind === "arrow") { const an = Math.atan2(by - ay, bx - ax), h = 9; g.appendChild(mk("path", { d: `M${bx} ${by} L${bx + h * Math.cos(an + Math.PI - 0.45)} ${by + h * Math.sin(an + Math.PI - 0.45)} M${bx} ${by} L${bx + h * Math.cos(an + Math.PI + 0.45)} ${by + h * Math.sin(an + Math.PI + 0.45)}`, stroke: col, "stroke-width": on ? 2.4 : 1.6, fill: "none" })); }
          if (d.kind === "measure") { const pc = ((B.p - A.p) / A.p) * 100; const di = Math.abs(barIndex(B.t) - barIndex(A.t)); const lab = mk("text", { x: (ax + bx) / 2, y: Math.min(ay, by) - 8, fill: col, "font-size": 11, "text-anchor": "middle", "font-family": "var(--font-num)" }); lab.textContent = `${pc >= 0 ? "+" : ""}${pc.toFixed(2)}% · ${di} bars`; g.appendChild(lab); }
          grip([{ x: ax, y: ay }, { x: bx, y: by }]); return g;
        }
        if (d.kind === "rect") { g.appendChild(mk("rect", { x: Math.min(ax, bx), y: Math.min(ay, by), width: Math.abs(bx - ax), height: Math.abs(by - ay), fill: col, "fill-opacity": 0.08, stroke: col, "stroke-width": on ? 2 : 1 })); grip([{ x: ax, y: ay }, { x: bx, y: by }]); return g; }
        if (d.kind === "fib") {
          const hi = Math.max(A.p, B.p), lo = Math.min(A.p, B.p), x1 = Math.min(ax, bx);
          FIB.forEach((f) => { const price = hi - (hi - lo) * f; const y = yOf(price); if (y == null) return; g.appendChild(mk("line", { x1, y1: y, x2: W, y2: y, stroke: col, "stroke-width": 1, "stroke-dasharray": "4 4", opacity: 0.6 })); const tx = mk("text", { x: x1 + 4, y: y - 3, fill: col, "font-size": 9.5, "font-family": "var(--font-num)", opacity: 0.85 }); tx.textContent = `${(f * 100).toFixed(1)}%  ${price.toFixed(prec)}`; g.appendChild(tx); });
          fat(x1, yOf(hi) ?? 0, x1, yOf(lo) ?? 0); grip([{ x: ax, y: ay }, { x: bx, y: by }]); return g;
        }
        return g;
      }
      // floating style/delete toolbar over the selected drawing
      const bar = document.createElement("div"); bar.className = "draw-bar"; bar.style.display = "none"; wrap.appendChild(bar); barRef.current = bar;
      const COLORS = ["#4d82ff", "#26c281", "#f0566b", "#e8b339", "#d6dae3"];
      bar.innerHTML = COLORS.map((cc) => `<button data-c="${cc}" style="background:${cc}" title="${cc}"></button>`).join("") + `<span class="bar-sep"></span><button class="bar-del" data-del="1" title="Delete">✕</button>`;
      bar.addEventListener("pointerdown", (e) => {
        e.stopPropagation(); const tg = e.target as HTMLElement; const cc = tg.getAttribute("data-c");
        if (cc && sel) { drawRef.current = drawRef.current.map((d) => d.id === sel ? { ...d, color: cc } : d); onChangeRef.current?.([...drawRef.current]); }
        else if (tg.getAttribute("data-del") && sel) { const s = sel; sel = null; onChangeRef.current?.(drawRef.current.filter((d) => d.id !== s)); }
      });
      const positionBar = () => {
        const d = drawRef.current.find((x) => x.id === sel);
        if (sel && d && d.points[0]) { const ax = xOf(d.points[0].t), ay = yOf(d.points[0].p); if (ax != null && ay != null) { bar.style.display = "flex"; bar.style.left = Math.max(4, Math.min(el!.clientWidth - 150, ax - 8)) + "px"; bar.style.top = Math.max(4, ay - 42) + "px"; return; } }
        bar.style.display = "none";
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
      winDown = (e: PointerEvent) => { hideCtx(); if (!toolRef.current && sel) { const tg = e.target as Element; if (tg && !tg.closest?.("g[data-id]") && !tg.closest?.(".draw-bar")) { sel = null; renderDraw(); } } };
      window.addEventListener("pointerdown", winDown);
      const renderDraw = () => {
        const svgEl = svgRef.current; if (!svgEl) return;
        while (svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);
        for (const d of drawRef.current) svgEl.appendChild(shape(d));
        positionBar();
      };
      renderRef.current = renderDraw;
      chart.timeScale().subscribeVisibleLogicalRangeChange(renderDraw);
      renderDraw();

      const rectXY = (ev: PointerEvent) => { const r = svg.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; };
      const idAt = (ev: Event) => (ev.target as Element)?.closest?.("g[data-id]")?.getAttribute("data-id") || null;
      const TWO = new Set(["trendline", "ray", "rect", "fib", "measure", "arrow"]);

      // select + drag existing drawings in cursor mode (capture phase; runs before creation)
      svg.addEventListener("pointerdown", (ev) => {
        if (toolRef.current) return; const id = idAt(ev); if (!id) { if (sel) { sel = null; renderDraw(); } return; }
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
        if (t === "text") { const txt = window.prompt("Label"); if (txt) onChangeRef.current?.([...drawRef.current, { id: uid(), kind: "text", points: [a], text: txt }]); return; }
        if (TWO.has(t)) { pending = { kind: t, a }; try { svg.setPointerCapture(ev.pointerId); } catch {} }
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
        const tag = (e.target as HTMLElement)?.tagName?.toLowerCase(); if (tag === "input" || tag === "textarea") return;
        if (e.key === "Escape") { if (sel) { sel = null; renderDraw(); } }
        else if ((e.key === "Delete" || e.key === "Backspace") && sel) { e.preventDefault(); const s = sel; sel = null; onChangeRef.current?.(drawRef.current.filter((d) => d.id !== s)); }
      };
      window.addEventListener("keydown", onKey);

      ro = new ResizeObserver(() => { const ch2 = chartRef.current; if (!ch2) return; const r = ch2.timeScale().getVisibleLogicalRange(); ch2.resize(el.clientWidth, el.clientHeight); if (r) ch2.timeScale().setVisibleLogicalRange(r); renderDraw(); });
      ro.observe(el);
    })();

    return () => { dead = true; if (dragCleanup) dragCleanup(); window.removeEventListener("mm:snapshot", snap); if (onKey) window.removeEventListener("keydown", onKey); if (winDown) window.removeEventListener("pointerdown", winDown); if (onCtx && ref.current?.parentElement) ref.current.parentElement.removeEventListener("contextmenu", onCtx); ro?.disconnect(); if (ctxRef.current) { try { ctxRef.current.remove(); } catch {} ctxRef.current = null; } if (barRef.current) { try { barRef.current.remove(); } catch {} barRef.current = null; } if (svgRef.current) { try { svgRef.current.remove(); } catch {} svgRef.current = null; } if (chartRef.current) { try { chartRef.current.remove(); } catch {} chartRef.current = null; } };
  }, [symbol, chartType, timeframe, replayIdx, Array.from(indicators).sort().join(","), (compare || []).join(",")]); // eslint-disable-line

  // re-render overlay + toggle interactivity on tool/drawings change (no chart rebuild)
  useEffect(() => { renderRef.current?.(); const svg = svgRef.current; if (svg) { svg.style.pointerEvents = tool ? "auto" : "none"; svg.style.cursor = tool === "erase" ? "pointer" : tool ? "crosshair" : "default"; } }, [tool, drawings]);

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
    </div>
  );
}
