"use client";
import { useEffect, useRef } from "react";
import {
  createChart, CandlestickSeries, BarSeries, LineSeries, AreaSeries, HistogramSeries,
  CrosshairMode, createSeriesMarkers, type IChartApi,
} from "lightweight-charts";

const css = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
type Bar = { time: string; o: number; h: number; l: number; c: number; v: number };

// ---- indicator math ----
function ema(a: (number | null)[], p: number) { const o: (number | null)[] = Array(a.length).fill(null); const k = 2 / (p + 1); let pr: number | null = null, s = 0, c = 0; for (let i = 0; i < a.length; i++) { const v = a[i]; if (v == null) { o[i] = pr; continue; } if (pr == null) { s += v; c++; if (c === p) { pr = s / p; o[i] = pr; } } else { pr = v * k + pr * (1 - k); o[i] = pr; } } return o; }
function sma(a: (number | null)[], p: number) { const o: (number | null)[] = Array(a.length).fill(null); const q: number[] = []; let s = 0; for (let i = 0; i < a.length; i++) { const v = a[i]; q.push(v == null ? 0 : v); if (v != null) s += v; if (q.length > p) s -= q.shift()!; if (q.length === p) o[i] = s / p; } return o; }
function stddev(a: number[], p: number) { const o: (number | null)[] = Array(a.length).fill(null); for (let i = p - 1; i < a.length; i++) { const w = a.slice(i - p + 1, i + 1); const m = w.reduce((x, y) => x + y, 0) / p; o[i] = Math.sqrt(w.reduce((x, y) => x + (y - m) ** 2, 0) / p); } return o; }
function rsi(cl: number[], p = 14) { const o: (number | null)[] = Array(cl.length).fill(null); let g = 0, l = 0; for (let i = 1; i < cl.length; i++) { const ch = cl[i] - cl[i - 1], u = ch > 0 ? ch : 0, d = ch < 0 ? -ch : 0; if (i <= p) { g += u; l += d; if (i === p) { g /= p; l /= p; o[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); } } else { g = (g * (p - 1) + u) / p; l = (l * (p - 1) + d) / p; o[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); } } return o; }
function stochRsi(cl: number[]) { const r = rsi(cl, 14); const raw: (number | null)[] = Array(cl.length).fill(null); for (let i = 0; i < cl.length; i++) { if (r[i] == null) continue; let hh = -1e9, ll = 1e9, ok = true; for (let j = i - 13; j <= i; j++) { if (j < 0 || r[j] == null) { ok = false; break; } hh = Math.max(hh, r[j]!); ll = Math.min(ll, r[j]!); } if (ok) raw[i] = hh === ll ? 50 : (100 * (r[i]! - ll)) / (hh - ll); } const k = sma(raw, 3); return { k, d: sma(k, 3) }; }
function macd(cl: number[]) { const ef = ema(cl, 12), es = ema(cl, 26); const line = cl.map((_, i) => (ef[i] != null && es[i] != null ? ef[i]! - es[i]! : null)); const sig = ema(line, 9); const hist = line.map((_, i) => (line[i] != null && sig[i] != null ? line[i]! - sig[i]! : null)); return { line, sig, hist }; }
const toLine = (rows: Bar[], arr: (number | null)[]) => rows.map((r, i) => (arr[i] != null && isFinite(arr[i]!) ? { time: r.time, value: arr[i]! } : null)).filter(Boolean) as any[];

// ---- transforms ----
function resample(rows: Bar[], tf: string): Bar[] {
  if (tf === "D" || rows.length === 0) return rows;
  const out: Bar[] = []; let cur: Bar | null = null; let key: any = null;
  const isoWeek = (d: string) => { const dt = new Date(d + "T00:00:00Z"); const day = (dt.getUTCDay() + 6) % 7; dt.setUTCDate(dt.getUTCDate() - day); return dt.toISOString().slice(0, 10); };
  for (let i = 0; i < rows.length; i++) { const r = rows[i]; const k = tf === "W" ? isoWeek(r.time) : tf === "1M" ? r.time.slice(0, 7) : Math.floor(i / 3); if (k !== key) { if (cur) out.push(cur); key = k; cur = { ...r }; } else { cur!.h = Math.max(cur!.h, r.h); cur!.l = Math.min(cur!.l, r.l); cur!.c = r.c; cur!.time = r.time; cur!.v += r.v; } }
  if (cur) out.push(cur); return out;
}
function heikin(rows: Bar[]): Bar[] { const out: Bar[] = []; let po = 0, pc = 0; for (let i = 0; i < rows.length; i++) { const r = rows[i]; const hc = (r.o + r.h + r.l + r.c) / 4; const ho = i === 0 ? (r.o + r.c) / 2 : (po + pc) / 2; out.push({ ...r, o: ho, c: hc, h: Math.max(r.h, ho, hc), l: Math.min(r.l, ho, hc) }); po = ho; pc = hc; } return out; }

const cache: Record<string, { ohlc: any; slice: any }> = {};

export default function ChartPanel({ symbol, chartType = "candles", indicators, timeframe = "D", replayIdx = null, onMeta }:
  { symbol: string; chartType?: string; indicators: Set<string>; timeframe?: string; replayIdx?: number | null; onMeta?: (m: { total: number }) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLSpanElement>(null);
  const verdictRef = useRef<HTMLSpanElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    const el = ref.current; if (!el) return;
    let ro: ResizeObserver | null = null, dead = false;
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
      rows = resample(rows, timeframe).slice(-220);
      if (onMeta) onMeta({ total: rows.length });
      if (replayIdx != null) rows = rows.slice(0, Math.max(20, replayIdx + 1));
      const display = chartType === "heikin" ? heikin(rows) : rows;
      const closes = rows.map((r) => r.c);
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

      // overlays
      if (indicators.has("ema")) ([[20, c.warn], [50, c.link], [200, "rgba(214,218,227,.4)"]] as [number, string][]).forEach(([p, col]) => { const ln = chart.addSeries(LineSeries, { color: col, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }, 0); ln.setData(toLine(rows, ema(closes, p))); });
      if (indicators.has("bb")) { const basis = sma(closes, 20); const sd = stddev(closes, 20); const up = closes.map((_, i) => (basis[i] != null && sd[i] != null ? basis[i]! + 2 * sd[i]! : null)); const lo = closes.map((_, i) => (basis[i] != null && sd[i] != null ? basis[i]! - 2 * sd[i]! : null)); [up, basis, lo].forEach((arr, j) => { const ln = chart.addSeries(LineSeries, { color: j === 1 ? "rgba(214,218,227,.45)" : "rgba(77,130,255,.55)", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }, 0); ln.setData(toLine(rows, arr)); }); }
      if (indicators.has("vwap")) { let cum = 0, cumv = 0; const vw = rows.map((r) => { const tp = (r.h + r.l + r.c) / 3; cum += tp * r.v; cumv += r.v; return cumv ? cum / cumv : null; }); const ln = chart.addSeries(LineSeries, { color: "#e8b339", lineWidth: 1.4, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }, 0); ln.setData(toLine(rows, vw)); }

      // signal markers (from the slice; only up to the replay cutoff)
      const times = rows.map((r) => r.time);
      const lastDate = times[times.length - 1];
      const sigs = (slice?.indicator?.signals || []).filter((s: any) => s.ts <= lastDate).slice(-8);
      const near = (iso: string) => { let b: string | null = null, bd = 1e18; const x = new Date(iso + "T00:00:00Z").getTime(); times.forEach((y) => { const dd = Math.abs(new Date(y + "T00:00:00Z").getTime() - x); if (dd < bd) { bd = dd; b = y; } }); return bd < 9e8 ? b : null; };
      const mk = sigs.map((s: any) => { const t = near(s.ts); if (!t) return null; const buy = s.type === "BUY" || s.type === "REBUY"; return { time: t, position: buy ? "belowBar" : "aboveBar", color: buy ? c.buy : c.sell, shape: buy ? "arrowUp" : "arrowDown", text: s.type }; }).filter(Boolean);
      if (mk.length) createSeriesMarkers(priceS, mk as any);

      // oscillator panes
      let pane = 1;
      if (indicators.has("vol")) { const vs = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "" }, pane); vs.setData(rows.map((r) => ({ time: r.time, value: r.v, color: r.c >= r.o ? "rgba(38,194,129,.4)" : "rgba(240,86,107,.4)" }))); pane++; }
      if (indicators.has("rsi") || indicators.has("stochrsi")) {
        if (indicators.has("stochrsi")) { const sr = stochRsi(closes); const kS = chart.addSeries(LineSeries, { color: c.buy, lineWidth: 1.6, lastValueVisible: true, title: "%K" }, pane); const dS = chart.addSeries(LineSeries, { color: c.sell, lineWidth: 1, lastValueVisible: true, title: "%D" }, pane); kS.setData(toLine(rows, sr.k)); dS.setData(toLine(rows, sr.d)); }
        if (indicators.has("rsi")) { const rS = chart.addSeries(LineSeries, { color: indicators.has("stochrsi") ? "rgba(214,218,227,.5)" : c.brand2, lineWidth: 1.2, lastValueVisible: true, title: "RSI" }, pane); rS.setData(toLine(rows, rsi(closes, 14))); }
        pane++;
      }
      if (indicators.has("macd")) { const m = macd(closes); const hs = chart.addSeries(HistogramSeries, {}, pane); hs.setData(rows.map((r, i) => (m.hist[i] != null ? { time: r.time, value: m.hist[i]!, color: m.hist[i]! >= 0 ? "rgba(38,194,129,.5)" : "rgba(240,86,107,.5)" } : null)).filter(Boolean) as any); const lS = chart.addSeries(LineSeries, { color: c.brand2, lineWidth: 1.3, title: "MACD" }, pane); const sS = chart.addSeries(LineSeries, { color: c.warn, lineWidth: 1, title: "signal" }, pane); lS.setData(toLine(rows, m.line)); sS.setData(toLine(rows, m.sig)); pane++; }

      try { const pn = chart.panes(); pn[0].setStretchFactor(3.4); for (let i = 1; i < pn.length; i++) pn[i].setStretchFactor(1); } catch {}

      const last = rows[rows.length - 1], prev = rows[rows.length - 2] || last;
      if (statusRef.current) { const ch = last.c - prev.c, cp = (ch / prev.c) * 100, u = ch >= 0, f = (x: number) => x.toFixed(prec); statusRef.current.innerHTML = `<span class="mut">O</span><b>${f(last.o)}</b> <span class="mut">H</span><b>${f(last.h)}</b> <span class="mut">L</span><b>${f(last.l)}</b> <span class="mut">C</span><b>${f(last.c)}</b> <b class="${u ? "up" : "down"}">${u ? "+" : ""}${f(ch)} (${u ? "+" : ""}${cp.toFixed(2)}%)</b>`; }
      if (verdictRef.current) { const v = slice?.indicator?.state?.last_signal || "—"; const buy = v === "BUY" || v === "REBUY"; verdictRef.current.textContent = `GOLDEN ORACLE · ${v}`; verdictRef.current.style.color = buy ? c.buy : c.sell; const w = verdictRef.current.parentElement as HTMLElement; if (w) { w.style.background = buy ? "rgba(38,194,129,.12)" : "rgba(240,86,107,.12)"; w.style.borderColor = buy ? "rgba(38,194,129,.3)" : "rgba(240,86,107,.3)"; } }
      chart.timeScale().fitContent();
      ro = new ResizeObserver(() => { const ch2 = chartRef.current; if (!ch2) return; const r = ch2.timeScale().getVisibleLogicalRange(); ch2.resize(el.clientWidth, el.clientHeight); if (r) ch2.timeScale().setVisibleLogicalRange(r); });
      ro.observe(el);
    })();

    return () => { dead = true; window.removeEventListener("mm:snapshot", snap); ro?.disconnect(); if (chartRef.current) { try { chartRef.current.remove(); } catch {} chartRef.current = null; } };
  }, [symbol, chartType, timeframe, replayIdx, Array.from(indicators).sort().join(",")]); // eslint-disable-line

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
