// Server-side intraday OHLC sources for the Terminal chart.
//   US / crypto      → Polygon aggregates (intraday + full extended hours, on the current plan)
//   China .SS/.SZ    → Tencent kline (free, no auth)
//   Hong Kong .HK    → Tencent kline (free, no auth)
//
// Bars are returned as [epochSec, o, h, l, c, v] to match the daily /data/<SYM>.json contract.
// Intraday uses epoch SECONDS; the daily files use "YYYY-MM-DD" strings — never mix the two on one
// render (see ingest/README). lightweight-charts renders timestamps in UTC, so to keep each market's
// intraday axis in its OWN local trading time we emit a "display epoch" built from the market-local
// wall-clock components (ET for US, UTC+8 for CN/HK), not the true UTC instant. Cross-market compare
// is disabled on intraday in the chart, so this local-time shift has no alignment cost.

export type Bar6 = [number, number, number, number, number, number];

export const INTRADAY_TFS = ["1m", "2m", "3m", "5m", "10m", "15m", "30m", "45m", "1h", "2h", "3h", "4h"];
const INTRADAY_SET = new Set(INTRADAY_TFS);
export const isIntradayTf = (tf: string) => INTRADAY_SET.has(tf);

export function tfMinutes(tf: string): number {
  const m = /^(\d+)(m|h)$/.exec(tf);
  if (!m) return 0;
  const n = parseInt(m[1], 10) || 1;
  return m[2] === "h" ? n * 60 : n;
}

export type Market = "cn" | "hk" | "crypto" | "us";
export function classify(sym: string): Market {
  if (/\.(SS|SZ)$/i.test(sym)) return "cn";
  if (/\.HK$/i.test(sym)) return "hk";
  if (/-USD$/i.test(sym)) return "crypto";
  return "us";
}

// Aggregate base bars into coarser `minutes` buckets, keyed by absolute (display-)epoch so buckets
// align to local clock boundaries. Bar6 layout: [epoch, open, high, low, close, vol].
function resample(bars: Bar6[], minutes: number): Bar6[] {
  if (minutes <= 0 || bars.length === 0) return bars;
  const span = minutes * 60;
  const out: Bar6[] = [];
  let cur: Bar6 | null = null;
  let key = NaN;
  for (const b of bars) {
    const k = Math.floor(b[0] / span);
    if (k !== key) { if (cur) out.push(cur); key = k; cur = [k * span, b[1], b[2], b[3], b[4], b[5]]; }
    else { cur![2] = Math.max(cur![2], b[2]); cur![3] = Math.min(cur![3], b[3]); cur![4] = b[4]; cur![5] += b[5]; }
  }
  if (cur) out.push(cur);
  return out;
}

// ── US / crypto → Polygon ──
const ET_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York", hourCycle: "h23",
  year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
});
function etDisplay(ms: number): { epoch: number; minOfDay: number } {
  const p: Record<string, string> = {};
  for (const part of ET_FMT.formatToParts(ms)) p[part.type] = part.value;
  const hh = +p.hour % 24;
  const epoch = Date.UTC(+p.year, +p.month - 1, +p.day, hh, +p.minute) / 1000;
  return { epoch, minOfDay: hh * 60 + +p.minute };
}

async function fetchPolygon(sym: string, market: Market, tf: string, ext: boolean): Promise<Bar6[]> {
  const key = process.env.POLYGON_API_KEY || process.env.MASSIVE_API_KEY;
  if (!key) throw new Error("POLYGON_API_KEY not set");
  const m = /^(\d+)(m|h)$/.exec(tf)!;
  const mult = parseInt(m[1], 10) || 1;
  const unit = m[2] === "h" ? "hour" : "minute";
  const minutes = tfMinutes(tf);
  const days = minutes <= 5 ? 10 : minutes <= 30 ? 25 : minutes <= 60 ? 60 : 120;
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const to = new Date();
  const from = new Date(to.getTime() - days * 86400000);
  const ticker = market === "crypto" ? "X:" + sym.replace(/-/g, "").toUpperCase() : sym.toUpperCase();
  const url = `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(ticker)}/range/${mult}/${unit}/${iso(from)}/${iso(to)}?adjusted=true&sort=asc&limit=50000&apiKey=${key}`;
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error("polygon " + r.status);
  const j: any = await r.json();
  const res: any[] = j?.results || [];
  const out: Bar6[] = [];
  for (const b of res) {
    if (market === "crypto") { out.push([Math.floor(b.t / 1000), b.o, b.h, b.l, b.c, b.v]); continue; }
    const { epoch, minOfDay } = etDisplay(b.t);
    if (!ext && unit === "minute" && (minOfDay < 570 || minOfDay >= 960)) continue; // RTH = 09:30–16:00 ET
    out.push([epoch, b.o, b.h, b.l, b.c, b.v]);
  }
  return out;
}

// ── China / Hong Kong → Tencent (free) ──
// Native minute scales: m1/m5/m15/m30/m60. Non-native tfs resample from the largest native divisor.
function tencentCode(sym: string, market: Market): string | null {
  if (market === "cn") { const m = /^(\d+)\.(SS|SZ)$/i.exec(sym); return m ? (m[2].toUpperCase() === "SS" ? "sh" : "sz") + m[1] : null; }
  if (market === "hk") { const m = /^(\d+)\.HK$/i.exec(sym); return m ? "hk" + m[1].padStart(5, "0") : null; }
  return null;
}

async function fetchTencent(sym: string, market: Market, tf: string): Promise<Bar6[]> {
  const code = tencentCode(sym, market);
  if (!code) return [];
  const minutes = tfMinutes(tf);
  const base = [60, 30, 15, 5, 1].find((b) => b <= minutes && minutes % b === 0) || 1;
  const scale = "m" + base;
  const url = `https://ifzq.gtimg.cn/appstock/app/kline/mkline?param=${code},${scale},,640`;
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error("tencent " + r.status);
  const j: any = await r.json();
  const node = j?.data?.[code] || {};
  const rows: any[] = Array.isArray(node[scale]) ? node[scale] : [];
  const baseBars: Bar6[] = [];
  for (const row of rows) {
    const dt = String(row[0]); // "YYYYmmddHHMM" in market-local time (UTC+8, no DST)
    if (dt.length < 12) continue;
    const epoch = Date.UTC(+dt.slice(0, 4), +dt.slice(4, 6) - 1, +dt.slice(6, 8), +dt.slice(8, 10), +dt.slice(10, 12)) / 1000;
    const o = +row[1], c = +row[2], h = +row[3], l = +row[4], v = +row[5]; // Tencent order: open, close, high, low, vol
    if (!Number.isFinite(o) || !Number.isFinite(h) || !Number.isFinite(l) || !Number.isFinite(c)) continue;
    baseBars.push([epoch, o, h, l, c, v]);
  }
  return base === minutes ? baseBars : resample(baseBars, minutes);
}

export async function fetchIntraday(sym: string, tf: string, ext: boolean): Promise<Bar6[]> {
  if (!isIntradayTf(tf)) return [];
  const market = classify(sym);
  const bars = (market === "us" || market === "crypto")
    ? await fetchPolygon(sym, market, tf, ext)
    : await fetchTencent(sym, market, tf);
  bars.sort((a, b) => a[0] - b[0]);
  const out: Bar6[] = [];
  let last = -1;
  for (const b of bars) { if (b[0] !== last) { out.push(b); last = b[0]; } } // ascending + unique
  return out.slice(-1200);
}
