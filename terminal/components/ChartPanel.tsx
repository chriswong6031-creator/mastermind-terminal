"use client";
import { useEffect, useRef } from "react";
import {
  createChart, CandlestickSeries, LineSeries, CrosshairMode, createSeriesMarkers,
  type IChartApi,
} from "lightweight-charts";

const css = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

function ema(a: (number | null)[], p: number) {
  const o: (number | null)[] = Array(a.length).fill(null);
  let k = 2 / (p + 1), pr: number | null = null, s = 0, c = 0;
  for (let i = 0; i < a.length; i++) { const v = a[i]; if (v == null) { o[i] = pr; continue; }
    if (pr == null) { s += v; c++; if (c === p) { pr = s / p; o[i] = pr; } } else { pr = v * k + pr * (1 - k); o[i] = pr; } }
  return o;
}
function rsi(cl: number[], p = 14) {
  const o: (number | null)[] = Array(cl.length).fill(null); let g = 0, l = 0;
  for (let i = 1; i < cl.length; i++) { const ch = cl[i] - cl[i - 1], u = ch > 0 ? ch : 0, d = ch < 0 ? -ch : 0;
    if (i <= p) { g += u; l += d; if (i === p) { g /= p; l /= p; o[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); } }
    else { g = (g * (p - 1) + u) / p; l = (l * (p - 1) + d) / p; o[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); } }
  return o;
}
function sma(a: (number | null)[], p: number) {
  const o: (number | null)[] = Array(a.length).fill(null); const q: number[] = []; let s = 0;
  for (let i = 0; i < a.length; i++) { const v = a[i]; q.push(v == null ? 0 : v); if (v != null) s += v; if (q.length > p) s -= q.shift()!; if (q.length === p) o[i] = s / p; }
  return o;
}
function stochRsi(cl: number[]) {
  const r = rsi(cl, 14); const raw: (number | null)[] = Array(cl.length).fill(null);
  for (let i = 0; i < cl.length; i++) { if (r[i] == null) continue; let hh = -1e9, ll = 1e9, ok = true;
    for (let j = i - 13; j <= i; j++) { if (j < 0 || r[j] == null) { ok = false; break; } hh = Math.max(hh, r[j]!); ll = Math.min(ll, r[j]!); }
    if (ok) raw[i] = hh === ll ? 50 : (100 * (r[i]! - ll)) / (hh - ll); }
  const k = sma(raw, 3); return { k, d: sma(k, 3) };
}
const toLine = (rows: any[], arr: (number | null)[]) =>
  rows.map((r, i) => (arr[i] != null && isFinite(arr[i]!) ? { time: r.time, value: arr[i]! } : null)).filter(Boolean) as any[];
function nearest(times: string[], iso: string) {
  let b: string | null = null, bd = 1e18; const x = new Date(iso + "T00:00:00Z").getTime();
  times.forEach((y) => { const d = Math.abs(new Date(y + "T00:00:00Z").getTime() - x); if (d < bd) { bd = d; b = y; } });
  return bd < 1.2e9 ? b : null;
}

export default function ChartPanel() {
  const ref = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current; if (!el) return;
    let chart: IChartApi | null = null, ro: ResizeObserver | null = null, dead = false;

    (async () => {
      const [ohlc, slice] = await Promise.all([
        fetch("/data/NVDA.json").then((r) => r.json()),
        fetch("/data/NVDA.slice.json").then((r) => r.json()).catch(() => ({})),
      ]);
      if (dead) return;
      const rows = ohlc.bars.slice(-170).map((b: any[]) => ({ time: b[0], o: b[1], h: b[2], l: b[3], c: b[4], v: b[5] }));
      const closes = rows.map((r: any) => r.c);
      const c = { up: css("--up"), down: css("--down"), grid: css("--grid"), line: css("--line"), p3: css("--panel-3"),
        link: css("--link"), warn: css("--warn"), buy: css("--buy"), sell: css("--sell"), mut: css("--muted") };

      chart = createChart(el, {
        width: el.clientWidth || 900, height: el.clientHeight || 600,
        layout: { background: { color: "transparent" }, textColor: c.mut, fontSize: 11, attributionLogo: false,
          panes: { separatorColor: c.line } },
        grid: { vertLines: { color: c.grid }, horzLines: { color: c.grid } },
        crosshair: { mode: CrosshairMode.Normal,
          vertLine: { color: "rgba(214,218,227,.32)", width: 1, labelBackgroundColor: c.p3 },
          horzLine: { color: "rgba(214,218,227,.32)", width: 1, labelBackgroundColor: c.p3 } },
        rightPriceScale: { borderColor: c.line, scaleMargins: { top: 0.12, bottom: 0.1 } },
        timeScale: { borderColor: c.line, rightOffset: 6, barSpacing: 8.5 },
      });

      const ps = chart.addSeries(CandlestickSeries, { upColor: c.up, downColor: c.down, wickUpColor: c.up, wickDownColor: c.down, borderVisible: false }, 0);
      ps.setData(rows.map((r: any) => ({ time: r.time, open: r.o, high: r.h, low: r.l, close: r.c })));
      ([[20, c.warn], [50, c.link], [200, "rgba(214,218,227,.38)"]] as [number, string][]).forEach(([p, col]) => {
        const ln = chart!.addSeries(LineSeries, { color: col, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }, 0);
        ln.setData(toLine(rows, ema(closes, p)));
      });
      const times = rows.map((r: any) => r.time);
      const sigs = (slice?.indicator?.signals || []).slice(-7);
      const mk = sigs.map((s: any) => {
        const t = nearest(times, s.ts); if (!t) return null;
        const buy = s.type === "BUY" || s.type === "REBUY";
        return { time: t, position: buy ? "belowBar" : "aboveBar", color: buy ? c.buy : c.sell, shape: buy ? "arrowUp" : "arrowDown", text: s.type };
      }).filter(Boolean);
      if (mk.length) createSeriesMarkers(ps, mk as any);

      const sr = stochRsi(closes), r14 = rsi(closes, 14);
      const kS = chart.addSeries(LineSeries, { color: c.buy, lineWidth: 2, priceLineVisible: false, lastValueVisible: true, title: "%K" }, 1);
      const dS = chart.addSeries(LineSeries, { color: c.sell, lineWidth: 1, priceLineVisible: false, lastValueVisible: true, title: "%D" }, 1);
      const rS = chart.addSeries(LineSeries, { color: "rgba(214,218,227,.5)", lineWidth: 1, priceLineVisible: false, lastValueVisible: true, title: "RSI" }, 1);
      kS.setData(toLine(rows, sr.k)); dS.setData(toLine(rows, sr.d)); rS.setData(toLine(rows, r14));
      try { const pn = chart.panes(); pn[0].setStretchFactor(3.6); if (pn[1]) pn[1].setStretchFactor(1); } catch {}

      const last = rows[rows.length - 1], prev = rows[rows.length - 2];
      if (statusRef.current) {
        const ch = last.c - prev.c, cp = (ch / prev.c) * 100, u = ch >= 0;
        statusRef.current.innerHTML =
          `<span class="mut">O</span><b>${last.o.toFixed(2)}</b> <span class="mut">H</span><b>${last.h.toFixed(2)}</b> ` +
          `<span class="mut">L</span><b>${last.l.toFixed(2)}</b> <span class="mut">C</span><b>${last.c.toFixed(2)}</b> ` +
          `<b class="${u ? "up" : "down"}">${u ? "+" : ""}${ch.toFixed(2)} (${u ? "+" : ""}${cp.toFixed(2)}%)</b>`;
      }
      chart.timeScale().fitContent();
      ro = new ResizeObserver(() => { if (!chart) return; const r = chart.timeScale().getVisibleLogicalRange(); chart.resize(el.clientWidth, el.clientHeight); if (r) chart.timeScale().setVisibleLogicalRange(r); });
      ro.observe(el);
    })();

    return () => { dead = true; ro?.disconnect(); chart?.remove(); };
  }, []);

  return (
    <div className="chart-wrap">
      <div className="statusline">
        <span ref={statusRef} />
        <span className="mm"><i />GOLDEN ORACLE · BUY</span>
      </div>
      <div ref={ref} style={{ position: "absolute", inset: 0 }} />
    </div>
  );
}
