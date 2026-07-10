"use client";
import { useEffect, useRef, useState } from "react";

// ── Boot-trace helper — mirrors the one in TerminalShell (?boottrace=1) ──────
const _cpStart = typeof performance !== "undefined" ? performance.now() : 0;
function cpMark(name: string) {
  if (typeof window === "undefined") return;
  if (!new URLSearchParams(window.location.search).has("boottrace")) return;
  const now = performance.now();
  try { performance.mark("bt:" + name); } catch {}
  // eslint-disable-next-line no-console
  console.log(`[boottrace] ${name} +${(now - _cpStart).toFixed(1)}ms`);
}
import {
  createChart, CandlestickSeries, BarSeries, LineSeries, AreaSeries, HistogramSeries,
  createSeriesMarkers, type ISeriesMarkersPluginApi,
  createTextWatermark,
  CrosshairMode, type IChartApi, type ISeriesApi, type IPaneApi,
} from "lightweight-charts";
import { runPine, type RunResult } from "@/lib/pine-engine";
import { type Drawing, type Bar as DBar, FIB, uid, autoTrendlines, autoFib, srDrawings, mtfaDrawings } from "@/lib/drawings";
import { registerPane, broadcastCrosshair, broadcastRange } from "@/lib/paneSync";
import { getJSON, getSliceAndOhlc, getCompositeOhlc } from "@/lib/dataCache";
import { parseComposite, alignAndSum } from "@/lib/composite";
import { CMP_PALETTE, type CmpCfg, defaultCmpCfg, cmpKey } from "@/lib/compare";
import { isIntradayTf, classify, tfMinutes, type Market } from "@/lib/intradaySources";
import { IND_DEFS, withDefaults, isIndKey } from "@/lib/indicators";
import { ichimoku, supertrend, avwap as computeAvwap, vprofile, volbox, rsiStack, accumPct, trendRibbon, buyShare as mfBuyShare } from "@/lib/indicatorMath";
import ChartOverlays, { type PaneInfo, type LegendEntry } from "@/components/ChartOverlays";
import { listTemplates } from "@/lib/chartTemplates";

const css = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
type Bar = { time: string; o: number; h: number; l: number; c: number; v: number };
export type DetectCmd = { kind: "trendlines" | "fib" | "sr" | "mtfa" | "clear" | "clearAll"; nonce: number } | null;

// Optional live/delayed snapshot threaded ChartPane → ChartPanel for the R11 live-bar splice.
// `ts` is a unix epoch in SECONDS (from the quote hub); `basis` gates whether we splice at all.
export type LiveQuote = { last?: number; open?: number; high?: number; low?: number; vol?: number; ts?: number; basis?: string } | null | undefined;

// Which markets can show intraday TFs (R12): everyone but Canadian `.TO` (no Polygon intraday leg).
// Exported so the shell can gate its TF picker per active symbol.
export function intradayCapable(market: Market): boolean { return market !== "ca"; }

// ── R11 live-bar splice (pure, exported for unit tests) ────────────────────────
// Splice a live quote onto a DAILY bar array. `sessionDate` is the quote's market-local
// wall-clock date ("YYYY-MM-DD"). Returns a NEW daily array (never mutates the input):
//   • sessionDate > last bar date  → APPEND a synthetic in-progress daily bar
//   • sessionDate === last bar date → PATCH the last bar (c=last, h=max, l=min, v when known)
//   • sessionDate < last bar date OR no quote/last → return the input unchanged (no-op)
// Callers own the replay / basis / intraday guards (this helper is math-only).
export function spliceDaily(daily: Bar[], q: { last?: number; open?: number; high?: number; low?: number; vol?: number } | null | undefined, sessionDate: string | null): Bar[] {
  if (!daily.length || !q || sessionDate == null) return daily;
  const last = q.last;
  if (last == null || !isFinite(last)) return daily;
  const tail = daily[daily.length - 1];
  if (sessionDate < tail.time) return daily;   // quote is older than the freshest bar — nothing to do
  if (sessionDate === tail.time) {
    const h = Math.max(tail.h, last, isFinite(q.high as number) ? (q.high as number) : -Infinity);
    const l = Math.min(tail.l, last, isFinite(q.low as number) ? (q.low as number) : Infinity);
    const patched: Bar = { ...tail, h, l, c: last, v: isFinite(q.vol as number) ? (q.vol as number) : tail.v };
    return [...daily.slice(0, -1), patched];
  }
  // newer session → append a synthetic bar built from the snapshot fields (open/high/low fall back to last)
  const o = isFinite(q.open as number) ? (q.open as number) : last;
  const h = Math.max(o, last, isFinite(q.high as number) ? (q.high as number) : -Infinity);
  const l = Math.min(o, last, isFinite(q.low as number) ? (q.low as number) : Infinity);
  const bar: Bar = { time: sessionDate, o, h, l, c: last, v: isFinite(q.vol as number) ? (q.vol as number) : 0 };
  return [...daily, bar];
}

// Fold a spliced DAILY array into the final resampled bucket for tf∈{3D,W,1M}. Returns the ONE
// bucket (time key + OHLCV) that `series.update()` should push — reusing the existing bucketer so
// the time key matches whatever Effect 2 produced (never invents a bucket unless the new daily date
// genuinely starts one, e.g. a fresh ISO week). Returns null for tf=D (caller updates the raw bar).
export function foldFinalBucket(daily: Bar[], tf: string): Bar | null {
  if (!daily.length) return null;
  if (tf === "D") return daily[daily.length - 1];
  const res = resampleTf(daily, tf);
  return res.length ? res[res.length - 1] : null;
}

// Derive the quote's session date in the symbol's market-local wall-clock ("YYYY-MM-DD").
// CN/HK live in UTC+8 (no DST); US in America/New_York; crypto/ca fall back to UTC.
export function sessionDateOf(ts: number | undefined, market: Market): string | null {
  if (ts == null || !isFinite(ts)) return null;
  const ms = ts * 1000;
  if (market === "cn" || market === "hk") return new Date(ms + 8 * 3600_000).toISOString().slice(0, 10);
  if (market === "us") {
    const p: Record<string, string> = {};
    for (const part of US_DATE_FMT.formatToParts(ms)) p[part.type] = part.value;
    return `${p.year}-${p.month}-${p.day}`;
  }
  return new Date(ms).toISOString().slice(0, 10);
}
const US_DATE_FMT = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });

// ── last-price tag: bar-close countdown (the "07:36" / "1d 20h" next to the price) ──
// Per-market UTC offsets + session-close hours (both DST/holiday-agnostic — good enough for a
// countdown; ≤1h drift under DST). Intraday close is exact (bar open + interval). Daily+ counts
// to the exchange session close of the last trading day of the period: 24/7 crypto rolls at local
// midnight (closeH=24), equities close at 16:00 (15:00 CN) on the last weekday of the period.
const MARKET_TZ_OFFSET: Record<Market, number> = { us: -5 * 3600, ca: -5 * 3600, cn: 8 * 3600, hk: 8 * 3600, crypto: 0 };
const SESSION_CLOSE_H: Record<Market, number> = { us: 16, ca: 16, cn: 15, hk: 16, crypto: 24 };

/** Unix seconds when the current daily/weekly/2-week/monthly/quarter bar closes. */
export function periodCloseTs(tf: string, nowSec: number, market: Market): number {
  const off = MARKET_TZ_OFFSET[market] ?? 0;
  const closeH = SESSION_CLOSE_H[market] ?? 24;
  const weekend = market === "crypto";                        // 24/7 → no weekend walk-back, midnight roll
  const HOUR = 3600, DAYMS = 86400_000;
  const d = new Date((nowSec + off) * 1000);
  const Y = d.getUTCFullYear(), Mo = d.getUTCMonth(), Da = d.getUTCDate();
  // unix-sec of the session close on local calendar day (y,m,dd), walked back to the last
  // trading weekday for markets that don't trade weekends.
  const closeOn = (y: number, m: number, dd: number): number => {
    let t = Date.UTC(y, m, dd);
    if (!weekend) { let wd = new Date(t).getUTCDay(); while (wd === 0 || wd === 6) { t -= DAYMS; wd = new Date(t).getUTCDay(); } }
    return Math.floor(t / 1000) + closeH * HOUR - off;
  };
  for (let i = 0; i < 3; i++) {                               // advance to the next period if this one already closed
    let cand: number;
    if (tf === "W" || tf === "2W") {
      const dow = new Date(Date.UTC(Y, Mo, Da)).getUTCDay();
      cand = closeOn(Y, Mo, Da + ((7 - dow) % 7) + i * 7);    // ISO-week end (Sunday) → walked to Fri close for equities
    } else if (tf === "1M") {
      cand = closeOn(Y, Mo + i, new Date(Date.UTC(Y, Mo + i + 1, 0)).getUTCDate());   // last day of month
    } else if (tf === "3M") {
      const qEndMo = Math.floor(Mo / 3) * 3 + 2 + i * 3;      // last month of the calendar quarter
      cand = closeOn(Y, qEndMo, new Date(Date.UTC(Y, qEndMo + 1, 0)).getUTCDate());
    } else {
      cand = closeOn(Y, Mo, Da + i);                          // D + any unknown daily-derived TF
    }
    if (cand > nowSec) return cand;
  }
  return closeOn(Y, Mo, Da + 1);
}

/** Format a bar-close countdown (seconds), TradingView-style, tiered by timeframe. */
export function fmtCountdown(remaining: number, intraday: boolean): string {
  let r = Math.max(0, Math.floor(remaining));
  const d = Math.floor(r / 86400); r -= d * 86400;
  const h = Math.floor(r / 3600); r -= h * 3600;
  const m = Math.floor(r / 60); const s = r - m * 60;
  const p2 = (n: number) => String(n).padStart(2, "0");
  if (d > 0) return `${d}d ${h}h`;
  if (intraday) return h > 0 ? `${h}:${p2(m)}:${p2(s)}` : `${p2(m)}:${p2(s)}`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

const EMPTY_SET: Set<string> = new Set();
const EMPTY_OBJ: Record<string, any> = {};
const EMPTY_PINE: PineScript[] = [];

// An enabled custom script threaded from TerminalShell. `params` already has the user's per-script
// overrides merged over the script's declared input defaults (keyed by the input's assignment-var).
export type PineScript = { id: string; name: string; source: string; params: Record<string, any> };
// Sub-pane pine scripts get a namespaced pane key so they never collide with a built-in sub-pane key.
const pineKeyOf = (id: string) => "pine:" + id;
// ~2s coarse runtime cap: a pathological script is skipped with an error rather than freezing the tab.
const PINE_RUNTIME_CAP_MS = 2000;

// Preserve the visible logical range across an indicator toggle (§0.4 ratified = true).
// The one-line escape hatch: flip to false to restore the pre-refactor "view resets on toggle" behavior.
const PRESERVE_VIEW_ON_INDICATOR_TOGGLE = true;


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
  // 2W / 3M use ABSOLUTE-calendar bucketing (anchored to a fixed epoch, not the data's first bar), so
  // buckets are stable across a month/quarter boundary regardless of where the window starts:
  //   2W → floor(days-since-epoch of the bar's ISO-week-start / 14)   (fixed fortnight blocks)
  //   3M → year + calendar quarter (Q0=Jan-Mar … Q3=Oct-Dec)
  const biWeek = (d: string) => { const dt = new Date(isoWeek(d) + "T00:00:00Z"); return Math.floor(dt.getTime() / 86400_000 / 14); };
  const quarter = (d: string) => { const y = d.slice(0, 4); const m = +d.slice(5, 7) - 1; return `${y}-Q${Math.floor(m / 3)}`; };
  for (let i = 0; i < rows.length; i++) { const r = rows[i]; const k = tf === "W" ? isoWeek(r.time) : tf === "2W" ? biWeek(r.time) : tf === "1M" ? r.time.slice(0, 7) : tf === "3M" ? quarter(r.time) : tf === "2D" ? Math.floor(i / 2) : Math.floor(i / 3); if (k !== key) { if (cur) out.push(cur); key = k; cur = { ...r }; } else { cur!.h = Math.max(cur!.h, r.h); cur!.l = Math.min(cur!.l, r.l); cur!.c = r.c; cur!.time = r.time; cur!.v += r.v; } }
  if (cur) out.push(cur); return out;
}

// ── resampleTf memoization: cache per (symbol, tf) so D→W→D doesn't recompute ──
// Keys are evicted when the symbol changes (clearResampleCache). Max ~10 entries (6 TFs × recent symbols).
// The cache stores the FULL resampled array; callers still slice for replay.
const _resampleCache = new Map<string, Bar[]>();
function resampleTfCached(rows: Bar[], tf: string, sym: string): Bar[] {
  const key = sym + "::" + tf;
  const cached = _resampleCache.get(key);
  if (cached !== undefined) return cached;
  const result = resampleTf(rows, tf);
  _resampleCache.set(key, result);
  return result;
}
function clearResampleCache(sym?: string): void {
  if (sym === undefined) { _resampleCache.clear(); return; }
  for (const k of Array.from(_resampleCache.keys())) { if (k.startsWith(sym + "::")) _resampleCache.delete(k); }
}
function heikin(rows: Bar[]): Bar[] { const out: Bar[] = []; let po = 0, pc = 0; for (let i = 0; i < rows.length; i++) { const r = rows[i]; const hc = (r.o + r.h + r.l + r.c) / 4; const ho = i === 0 ? (r.o + r.c) / 2 : (po + pc) / 2; out.push({ ...r, o: ho, c: hc, h: Math.max(r.h, ho, hc), l: Math.min(r.l, ho, hc) }); po = ho; pc = hc; } return out; }

const NS = "http://www.w3.org/2000/svg";
const mk = (tag: string, attrs: Record<string, any>) => { const e = document.createElementNS(NS, tag); for (const k in attrs) if (attrs[k] != null) e.setAttribute(k, String(attrs[k])); return e; };

// ── color-token snapshot (re-read on mount and on the up/down color flip, Effect 5) ──
type Tokens = { up: string; down: string; grid: string; line: string; p3: string; link: string; warn: string; buy: string; sell: string; mut: string; brand2: string };
const readTokens = (): Tokens => ({ up: css("--up"), down: css("--down"), grid: css("--grid"), line: css("--line"), p3: css("--panel-3"), link: css("--link"), warn: css("--warn"), buy: css("--buy"), sell: css("--sell"), mut: css("--muted"), brand2: css("--brand-2") });

// ── the canonical sub-pane order (parity with the base's sequential pane assignment) ──
// overlays (ema/bb/vwap/vol + new DT overlays) always live in pane 0.
// rsi + stochrsi SHARE one sub-pane (the "osc" pane), exactly as the base did.
// rsistack and accum each get their own sub-pane.
const SUBPANE_ORDER = ["osc", "macd", "rsistack", "accum"] as const;

// Bases that carry a fresher-than-EOD price we can splice onto the last daily bar.
const SPLICE_BASES = new Set(["LIVE", "DELAYED_15M"]);

export default function ChartPanel({ symbol, chartType = "candles", indicators, timeframe = "D", replayIdx = null, onMeta, tool = null, drawStyle, drawings = [], onDrawingsChange, detectCmd = null, magnet = false, compare = [], compareCfg = EMPTY_OBJ, isActive = true, syncId = null, liveQuote = null,
  indParams = EMPTY_OBJ, hidden = EMPTY_SET, onToggleHidden, onRemoveInd, onOpenSettings, onOpenSource, pineScripts = EMPTY_PINE, chartSettings, onChartApi, extHours = false,
  onAddAlert, onTableView, onObjectTree, onOpenSettingsModal, lockedVLine = null, onSetLockedVLine, onIndRowsAt }:
  { symbol: string; chartType?: string; indicators: Set<string>; timeframe?: string; replayIdx?: number | null; onMeta?: (m: { total: number }) => void;
    tool?: string | null; drawStyle?: { color: string; width: number; dash: "solid" | "dashed" | "dotted" }; drawings?: Drawing[]; onDrawingsChange?: (d: Drawing[]) => void; detectCmd?: DetectCmd; magnet?: boolean; compare?: string[]; compareCfg?: Record<string, CmpCfg>; isActive?: boolean; syncId?: number | null; liveQuote?: LiveQuote;
    indParams?: Record<string, any>; hidden?: Set<string>; onToggleHidden?: (key: string) => void; onRemoveInd?: (key: string) => void; onOpenSettings?: (key: string) => void; onOpenSource?: (key: string) => void; pineScripts?: PineScript[];
    chartSettings?: { mode?: number; invertScale?: boolean; scaleLeft?: boolean; autoScale?: boolean; priceLineVisible?: boolean; lastValueVisible?: boolean;
      gridHVisible?: boolean; gridVVisible?: boolean;
      candleUpColor?: string; candleDownColor?: string; candleUpBorder?: string; candleDownBorder?: string; candleUpWick?: string; candleDownWick?: string;
      showWatermark?: boolean; showOHLC?: boolean; showBarChange?: boolean; showSymbolName?: boolean; };
    onChartApi?: (api: IChartApi | null) => void; extHours?: boolean;
    onAddAlert?: (price: number) => void;
    onTableView?: () => void;
    onObjectTree?: () => void;
    onOpenSettingsModal?: (tab?: string) => void;
    lockedVLine?: string | null;
    onSetLockedVLine?: (time: string | null) => void;
    /** Called once after each data load with a function that returns per-key indicator values at a bar time. */
    onIndRowsAt?: (fn: ((barTime: string | number) => Record<string, number | null>) | null) => void;
  }) {
  const ref = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLSpanElement>(null);
  const verdictRef = useRef<HTMLSpanElement>(null);
  // ── chart / series refs (never in a dep array) ──
  const chartRef = useRef<IChartApi | null>(null);
  const priceSeriesRef = useRef<ISeriesApi<any> | null>(null);
  const priceFamilyRef = useRef<string | null>(null);   // which series family is on the chart now
  const indSeriesRef = useRef<Map<string, ISeriesApi<any>[]>>(new Map());   // indKey → its series
  const cmpSeriesRef = useRef<Map<string, ISeriesApi<any>>>(new Map());      // compare-sym → series
  const paneMapRef = useRef<Map<string, number>>(new Map());                 // sub-pane indKey → pane index
  // ── custom-script (Pine) render state (parallels the built-in indicator refs) ──
  const pineSeriesRef = useRef<Map<string, ISeriesApi<any>[]>>(new Map());   // scriptId → its series (all panes)
  const pineMarkersRef = useRef<Map<string, ISeriesMarkersPluginApi<any>>>(new Map()); // scriptId → its markers plugin
  const pinePaneMapRef = useRef<Map<string, number>>(new Map());             // sub-pane scriptId → pane index (overlay scripts absent)
  const pineErrRef = useRef<Map<string, string>>(new Map());                 // scriptId → error text (surfaced in the legend)
  const pineCacheRef = useRef<Map<string, { key: string; result: RunResult | null; error: string | null }>>(new Map()); // memo: scriptId → last run
  const pineScriptsRef = useRef<PineScript[]>(pineScripts); pineScriptsRef.current = pineScripts;
  const barsRef = useRef<Bar[]>([]);        // the bars currently ON the chart (full OR replay-sliced)
  const fullBarsRef = useRef<Bar[]>([]);    // the full resampled history — NEVER mutated by replay
  const dailyBarsRef = useRef<Bar[]>([]);   // the raw DAILY source (pre-resample) — the R11 splice operates here
  const isIntradayRef = useRef<boolean>(false);   // true when the active TF is an intraday branch (skip splice/resample/date-keyed overlays)
  const closesRef = useRef<number[]>([]);   // closes of barsRef
  const prevSymbolRef = useRef<string>("");  // tracks the symbol from the last Effect 2 run to detect symbol changes
  const precRef = useRef<number>(2);
  // GC v2: sig marks additionally carry keeper quality + recipe tier for BUY|REBUY (drives the marker
  // dimming/hollow style + the A+/Q badge). CUT is discriminated by `type` (the schema guarantees CUT ⟺
  // scored:false), so `score`/`scored` aren't needed on the chart. All optional — v1 slices omit them.
  const sigMarksRef = useRef<{ t: string; type: string; price: number; highlight?: boolean; quality?: string; tier?: string | null }[]>([]);
  // GC v2 side channels: anticipation dots (dates) + structure-break warnings ({t, kind}), resolved to bar times.
  const earlyDotsRef = useRef<{ t: string }[]>([]);
  const warnMarksRef = useRef<{ t: string; kind: string }[]>([]);
  const showDetailRef = useRef<boolean>(true);   // "Signals detail" chip → early dots + warnings visibility
  const highlightTimerRef = useRef<any>(null);   // R14 pulse timer — cleared on symbol/TF change
  const epochRef = useRef(0);               // race guard: latest data-effect run wins
  const cmpGenRef = useRef(0);              // compare-specific generation token (epoch doesn't bump on compare change)
  const sliceRef = useRef<any>(null);       // latest slice, so replay re-resolves sig marks without a refetch
  const viewSavedRef = useRef<{ from: number; to: number } | null>(null);
  // SSR-safe: seed with empty tokens (this client component still renders on the server for initial
  // HTML, where getComputedStyle/document are unavailable). Effect 1 populates real tokens on mount.
  const tokensRef = useRef<Tokens>({ up: "", down: "", grid: "", line: "", p3: "", link: "", warn: "", buy: "", sell: "", mut: "", brand2: "" });
  const chartTypeRef = useRef<string>(chartType);
  const timeframeRef = useRef<string>(timeframe);
  const compareRef = useRef<string[]>(compare || []);
  const compareCfgRef = useRef<Record<string, CmpCfg>>(compareCfg);
  const indicatorsRef = useRef<Set<string>>(indicators);
  const syncIdRef = useRef<number | null>(syncId);
  const replayIdxRef = useRef<number | null>(replayIdx);   // live replayIdx so Effect 2 doesn't build against a stale closure if replay starts mid-fetch
  const liveQuoteRef = useRef<LiveQuote>(liveQuote);       // latest live quote, so Effect 2's tail can re-apply the splice after setData
  const renderRef = useRef<() => void>(() => {});
  const renderTagRef = useRef<(() => void) | null>(null);   // updates the last-price + bar-close-countdown axis tag
  const symbolRef = useRef(symbol);                          // current symbol (Effect 1 mounts once; symbol changes in Effect 2)
  const renderSignalsRef = useRef<() => void>(() => {});
  const syncCleanupRef = useRef<(() => void) | null>(null);
  // D3 table-view: stable lookup of per-key indicator values by bar time (built after each data load).
  const indDataMapRef = useRef<Map<string, Record<string, number | null>>>(new Map());

  // ── indicator-legend + pane-management plumbing (grafted onto the persistent-chart model) ──
  // one entry per chart pane (price pane + each sub-pane); pane KEY is the sub-pane store key
  // ("__price__" | "vol" | "osc" | "macd") so it survives an incremental sub-pane rebuild / reorder.
  const panesMeta = useRef<{ key: string; isPrice: boolean; entries: Omit<LegendEntry, "hidden">[]; pane: IPaneApi<any> }[]>([]);
  // collapse/maximize/resize state, keyed by pane key — survives reorder + indicator churn
  const paneCtl = useRef<{ collapsed: Set<string>; maximized: string | null; normal: Map<string, number> }>({ collapsed: new Set(), maximized: null, normal: new Map() });
  const hiddenRef = useRef<Set<string>>(hidden); hiddenRef.current = hidden;
  const indParamsRef = useRef<Record<string, any>>(indParams); indParamsRef.current = indParams;
  const wrapElRef = useRef<HTMLElement | null>(null);
  const paneLayoutRef = useRef<PaneInfo[]>([]);
  const hoveredKeyRef = useRef<string | null>(null);   // pane under cursor, tracked by stable key
  const measureRef = useRef<() => void>(() => {});
  const paneRORef = useRef<ResizeObserver | null>(null);
  const [paneLayout, setPaneLayout] = useState<PaneInfo[]>([]);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [legendOpen, setLegendOpen] = useState(true);
  const [showDetail, setShowDetail] = useState(true);   // GC v2: early-dots + warnings overlay toggle
  useEffect(() => { showDetailRef.current = showDetail; renderSignalsRef.current(); }, [showDetail]);
  // ── new D1-D4 callback refs (stable closures so Effect 1 can read latest without re-mounting) ──
  const onAddAlertRef = useRef(onAddAlert); onAddAlertRef.current = onAddAlert;
  const onTableViewRef = useRef(onTableView); onTableViewRef.current = onTableView;
  const onObjectTreeRef = useRef(onObjectTree); onObjectTreeRef.current = onObjectTree;
  const onOpenSettingsModalRef = useRef(onOpenSettingsModal); onOpenSettingsModalRef.current = onOpenSettingsModal;
  const onSetLockedVLineRef = useRef(onSetLockedVLine); onSetLockedVLineRef.current = onSetLockedVLine;
  const lockedVLineRef = useRef(lockedVLine); lockedVLineRef.current = lockedVLine;
  const onIndRowsAtRef = useRef(onIndRowsAt); onIndRowsAtRef.current = onIndRowsAt;
  // params for the ACTIVE indicators drive an indicator rebuild (Effect 3b)
  const indParamsKey = JSON.stringify(Array.from(indicators).sort().map((k) => indParams[k]));
  // ── existing DOM / interaction refs (unchanged) ──
  const svgRef = useRef<SVGSVGElement | null>(null);
  const drawRef = useRef<Drawing[]>(drawings);
  const toolRef = useRef<string | null>(tool);
  const styleRef = useRef(drawStyle);
  const onChangeRef = useRef(onDrawingsChange);
  const magnetRef = useRef(magnet);
  const activeRef = useRef(isActive); activeRef.current = isActive;
  const barRef = useRef<HTMLDivElement | null>(null);
  const ctxRef = useRef<HTMLDivElement | null>(null);
  const textEditRef = useRef<HTMLInputElement | null>(null);
  const sigRef = useRef<SVGSVGElement | null>(null);
  const priceTagRef = useRef<HTMLDivElement | null>(null);  // TradingView-style last-price + countdown tag on the right axis
  const tagTimerRef = useRef<number | null>(null);          // 1s ticker so the bar-close countdown stays live
  const watermarkPluginRef = useRef<{ applyOptions: (opts: Record<string, any>) => void } | null>(null); // v5 text watermark plugin
  const lastValueVisibleRef = useRef<boolean>(true);        // mirrors chartSettings.lastValueVisible; gates the custom priceTag
  // status-line visibility knobs (chartSettings.showOHLC/showBarChange/showSymbolName)
  const showOHLCRef = useRef<boolean>(true);
  const showBarChangeRef = useRef<boolean>(true);
  const showSymbolNameRef = useRef<boolean>(true);
  // intraday dead-end empty-state overlay ("Back to Daily") — built in Effect 1, toggled from Effect 2
  const emptyRef = useRef<HTMLDivElement | null>(null);
  const showEmptyRef = useRef<(msg: string) => void>(() => {});
  const hideEmptyRef = useRef<() => void>(() => {});
  // SVG layer for indicator overlays (ichimoku cloud, ribbon fill, vprofile, volbox)
  const indSvgRef = useRef<SVGSVGElement | null>(null);
  // cached indicator overlay data — rebuilt when indicators/params/bars change, read by render
  const indOverlayRef = useRef<Record<string, any>>({});
  // rebuild the CHART STYLE (not the chart) when the up/down color scheme flips (Effect 5)
  const [csNonce, setCsNonce] = useState(0);
  useEffect(() => { const h = () => setCsNonce((n) => n + 1); window.addEventListener("mm:updown", h); return () => window.removeEventListener("mm:updown", h); }, []);
  drawRef.current = drawings; toolRef.current = tool; onChangeRef.current = onDrawingsChange; magnetRef.current = magnet; styleRef.current = drawStyle;
  // keep the data-effect's non-trigger props readable from the mount closures without re-subscribing
  chartTypeRef.current = chartType; timeframeRef.current = timeframe; compareRef.current = compare || []; compareCfgRef.current = compareCfg; indicatorsRef.current = indicators; syncIdRef.current = syncId; replayIdxRef.current = replayIdx; liveQuoteRef.current = liveQuote; symbolRef.current = symbol;
  lastValueVisibleRef.current = chartSettings?.lastValueVisible !== false;
  showOHLCRef.current = chartSettings?.showOHLC !== false;
  showBarChangeRef.current = chartSettings?.showBarChange !== false;
  showSymbolNameRef.current = chartSettings?.showSymbolName !== false;

  // ────────────────────────────────────────────────────────────────────────────
  // Shared helpers (module-level within the component, referenced from every effect).
  // They read *Ref.current so they stay valid across data reloads without re-binding.
  // ────────────────────────────────────────────────────────────────────────────

  // HTML-escape helper for context menu template strings
  const escH = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  // price format for the current precision
  const priceFmt = () => { const prec = precRef.current; return { type: "price" as const, precision: prec, minMove: Math.pow(10, -prec) }; };

  // Build price-series data for the current chartType from a bar set.
  const priceData = (rows: Bar[]) => {
    const display = chartTypeRef.current === "heikin" ? heikin(rows) : rows;
    if (chartTypeRef.current === "line" || chartTypeRef.current === "area") return display.map((r) => ({ time: r.time, value: r.c }));
    return display.map((r) => ({ time: r.time, open: r.o, high: r.h, low: r.l, close: r.c }));
  };

  // Create the price series (removed+re-added when the chartType actually changes).
  const addPriceSeries = (chart: IChartApi, t: Tokens) => {
    const pf = priceFmt();
    if (chartTypeRef.current === "line") return chart.addSeries(LineSeries, { color: t.brand2, lineWidth: 2, priceFormat: pf, lastValueVisible: false, priceLineVisible: true }, 0);
    if (chartTypeRef.current === "area") return chart.addSeries(AreaSeries, { lineColor: t.brand2, topColor: "rgba(41,98,255,.30)", bottomColor: "rgba(41,98,255,.02)", lineWidth: 2, priceFormat: pf, lastValueVisible: false, priceLineVisible: true }, 0);
    if (chartTypeRef.current === "bars") return chart.addSeries(BarSeries, { upColor: t.up, downColor: t.down, priceFormat: pf, lastValueVisible: false, priceLineVisible: true }, 0);
    return chart.addSeries(CandlestickSeries, { upColor: t.up, downColor: t.down, wickUpColor: t.up, wickDownColor: t.down, borderVisible: false, priceFormat: pf, lastValueVisible: false, priceLineVisible: true }, 0);
  };

  // per-indicator params merged over the registry defaults (drives the Settings dialog + the math/style)
  const P = (k: string) => withDefaults(k, indParamsRef.current[k]);
  const labelOf = (k: string) => (isIndKey(k) ? IND_DEFS[k].label : k);

  // ── indicator builders (param-driven; params flow from the Settings dialog via indParams) ──
  // Each returns the list of ISeriesApi it created, tracked in indSeriesRef under its indKey.
  const buildEma = (chart: IChartApi, rows: Bar[], closes: number[]): ISeriesApi<any>[] => {
    const out: ISeriesApi<any>[] = []; const p = P("ema");
    ([[p.ma1On, p.ma1Len, p.ma1Col], [p.ma2On, p.ma2Len, p.ma2Col], [p.ma3On, p.ma3Len, p.ma3Col]] as [boolean, number, string][]).forEach(([on, len, col]) => {
      if (!on) return; const ln = chart.addSeries(LineSeries, { color: col, lineWidth: p.width, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }, 0); ln.setData(toLine(rows, ema(closes, len))); out.push(ln);
    });
    return out;
  };
  const buildBb = (chart: IChartApi, rows: Bar[], closes: number[]): ISeriesApi<any>[] => {
    const out: ISeriesApi<any>[] = []; const p = P("bb");
    const basis = sma(closes, p.length); const sd = stddev(closes, p.length);
    const up = closes.map((_, i) => (basis[i] != null && sd[i] != null ? basis[i]! + p.mult * sd[i]! : null));
    const lo = closes.map((_, i) => (basis[i] != null && sd[i] != null ? basis[i]! - p.mult * sd[i]! : null));
    [up, basis, lo].forEach((arr, j) => { const ln = chart.addSeries(LineSeries, { color: j === 1 ? p.basisCol : p.bandCol, lineWidth: p.width, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }, 0); ln.setData(toLine(rows, arr)); out.push(ln); });
    return out;
  };
  const buildVwap = (chart: IChartApi, rows: Bar[]): ISeriesApi<any>[] => {
    const p = P("vwap");
    let cum = 0, cumv = 0; const vw = rows.map((r) => { const tp = (r.h + r.l + r.c) / 3; cum += tp * r.v; cumv += r.v; return cumv ? cum / cumv : null; });
    const ln = chart.addSeries(LineSeries, { color: p.col, lineWidth: p.width as any, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }, 0); ln.setData(toLine(rows, vw));
    return [ln];
  };
  // volume rebuilt with param-aware colors so Effect 5 can recolor by re-setData (see volData)
  const volData = (rows: Bar[]) => { const p = P("vol"); return rows.map((r) => ({ time: r.time, value: r.v, color: r.c >= r.o ? p.upCol : p.downCol })); };
  const buildVol = (chart: IChartApi, rows: Bar[]): ISeriesApi<any>[] => {
    const vs = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
      priceLineVisible: false,
      lastValueVisible: false,
    }, 0);
    try { chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } }); } catch {}
    vs.setData(volData(rows));
    return [vs];
  };
  // osc = the shared rsi+stochrsi pane (this build combines them into one pane)
  const buildOsc = (chart: IChartApi, rows: Bar[], closes: number[], pane: number): ISeriesApi<any>[] => {
    const out: ISeriesApi<any>[] = []; const inds = indicatorsRef.current;
    if (inds.has("stochrsi")) { const p = P("stochrsi"); const sr = stochRsi(closes, p.rsiLength, p.stochLength, p.smoothK, p.smoothD); const kS = chart.addSeries(LineSeries, { color: p.kCol, lineWidth: p.width as any, lastValueVisible: true, title: "%K" }, pane); const dS = chart.addSeries(LineSeries, { color: p.dCol, lineWidth: 1, lastValueVisible: true, title: "%D" }, pane); kS.setData(toLine(rows, sr.k)); dS.setData(toLine(rows, sr.d)); out.push(kS, dS); }
    if (inds.has("rsi")) { const p = P("rsi"); const rS = chart.addSeries(LineSeries, { color: inds.has("stochrsi") ? "rgba(214,218,227,.5)" : p.col, lineWidth: p.width as any, lastValueVisible: true, title: "RSI" }, pane); rS.setData(toLine(rows, rsi(closes, p.length))); if (p.showLevels) { try { rS.createPriceLine({ price: p.obLevel, color: "rgba(214,218,227,.25)", lineWidth: 1, lineStyle: 2, axisLabelVisible: false } as any); rS.createPriceLine({ price: p.osLevel, color: "rgba(214,218,227,.25)", lineWidth: 1, lineStyle: 2, axisLabelVisible: false } as any); } catch {} } out.push(rS); }
    return out;
  };
  const buildMacd = (chart: IChartApi, rows: Bar[], closes: number[], pane: number): ISeriesApi<any>[] => {
    const p = P("macd"); const m = macd(closes, p.fast, p.slow, p.signal);
    const hs = chart.addSeries(HistogramSeries, {}, pane); hs.setData(rows.map((r, i) => (m.hist[i] != null ? { time: r.time, value: m.hist[i]!, color: m.hist[i]! >= 0 ? p.upHist : p.downHist } : null)).filter(Boolean) as any);
    const lS = chart.addSeries(LineSeries, { color: p.macdCol, lineWidth: p.width as any, title: "MACD" }, pane); const sS = chart.addSeries(LineSeries, { color: p.signalCol, lineWidth: 1, title: "signal" }, pane);
    lS.setData(toLine(rows, m.line)); sS.setData(toLine(rows, m.sig));
    return [hs, lS, sS];
  };

  // ── custom-script (Pine) run + translate layer ─────────────────────────────────────────────────
  // Memoized per-script run: re-runs only when (id, source, params, symbol, tf, bar identity) change.
  // A throwing/slow/invalid script never crashes the chart — the error is captured and surfaced in the
  // legend row; its series are simply skipped. Bar identity = fullBarsRef.current (the on-chart set is
  // a prefix during replay; v1 re-runs on the full set, cache-keyed by its length + last time).
  const runPineMemo = (script: PineScript, rows: Bar[]): { result: RunResult | null; error: string | null } => {
    const barSig = rows.length ? `${rows.length}:${rows[rows.length - 1].time}` : "0";
    const key = `${script.source}\0${JSON.stringify(script.params)}\0${symbol}\0${timeframeRef.current}\0${barSig}`;
    const cached = pineCacheRef.current.get(script.id);
    if (cached && cached.key === key) return { result: cached.result, error: cached.error };
    let result: RunResult | null = null; let error: string | null = null;
    try {
      const t0 = Date.now();
      const out = runPine(script.source, rows as any, { timeframe: timeframeRef.current, symbol, params: script.params || {} });
      if (Date.now() - t0 > PINE_RUNTIME_CAP_MS) { error = "Script exceeded the 2s runtime cap"; }
      else if (!out.ok) { const e = out.errors[0]; error = e ? (e.line ? `Line ${e.line}: ${e.message}` : e.message) : "Script failed to run"; }
      else result = out.result;
    } catch (e: any) { error = e?.message ? String(e.message) : "Script crashed"; }
    pineCacheRef.current.set(script.id, { key, result, error });
    return { result, error };
  };

  // Map a Pine PlotKind → a Lightweight-Charts series on `pane`. Histogram/columns → HistogramSeries
  // (per-bar colors preserved); area → AreaSeries; everything else (line/stepline/circles/cross) → a
  // LineSeries. Returns the series (or null if the plot has no finite points).
  const addPinePlot = (chart: IChartApi, plot: RunResult["plots"][number], pane: number): ISeriesApi<any> | null => {
    const data = plot.data.filter((d) => d.value != null && isFinite(d.value));
    if (!data.length) return null;
    const lw = Math.max(1, plot.linewidth || 1) as any;
    let s: ISeriesApi<any>;
    if (plot.kind === "histogram" || plot.kind === "columns") {
      s = chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false, title: plot.title }, pane);
      s.setData(data.map((d) => ({ time: d.time, value: d.value, color: d.color || plot.color })) as any);
    } else if (plot.kind === "area") {
      s = chart.addSeries(AreaSeries, { lineColor: plot.color, topColor: plot.color, bottomColor: "rgba(0,0,0,0)", lineWidth: lw, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }, pane);
      s.setData(data.map((d) => ({ time: d.time, value: d.value })) as any);
    } else {
      s = chart.addSeries(LineSeries, { color: plot.color, lineWidth: lw, lineStyle: plot.kind === "stepline" ? 0 : 0, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, title: plot.title }, pane);
      s.setData(data.map((d) => ({ time: d.time, value: d.value })) as any);
    }
    return s;
  };

  // Build ONE script's series onto the chart. Overlay scripts (meta.overlay) plot on the price pane
  // (pane 0); non-overlay scripts get their own sub-pane at index `subPane` (caller-assigned). hlines
  // → createPriceLine on the first series (or the price series for empty overlay scripts); shapes →
  // one markers plugin. Records series/markers/pane in the pine refs. Returns true if it got a pane.
  const buildPineScript = (script: PineScript, rows: Bar[], subPane: number): { ok: boolean; usedPane: boolean } => {
    const chart = chartRef.current, priceS = priceSeriesRef.current; if (!chart || !priceS) return { ok: false, usedPane: false };
    const { result, error } = runPineMemo(script, rows);
    if (error || !result) { pineErrRef.current.set(script.id, error || "Script produced no output"); return { ok: false, usedPane: false }; }
    pineErrRef.current.delete(script.id);
    const overlay = result.meta.overlay;
    const pane = overlay ? 0 : subPane;
    const series: ISeriesApi<any>[] = [];
    for (const plot of result.plots) { const s = addPinePlot(chart, plot, pane); if (s) series.push(s); }
    // hlines → price lines on the anchor series (first plot series, else the price series for overlays)
    const anchor = series[0] || (overlay ? priceS : null);
    if (anchor) for (const hl of result.hlines) { try { anchor.createPriceLine({ price: hl.price, color: hl.color, lineWidth: 1, lineStyle: hl.style === "dashed" ? 2 : hl.style === "dotted" ? 1 : 0, axisLabelVisible: true, title: hl.title } as any); } catch {} }
    // shapes → markers on the anchor series (only meaningful when there's a series to hang them on)
    if (anchor && result.shapes.length) {
      try {
        const markers = result.shapes.map((sh) => ({ time: sh.time as any, position: sh.position, shape: sh.shape, color: sh.color, text: sh.text }));
        const plugin = createSeriesMarkers(anchor, markers as any);
        pineMarkersRef.current.set(script.id, plugin);
      } catch {}
    }
    pineSeriesRef.current.set(script.id, series);
    // a non-overlay script claims its pane only if it actually rendered at least one series there
    const usedPane = !overlay && series.length > 0;
    if (usedPane) pinePaneMapRef.current.set(script.id, subPane);
    return { ok: true, usedPane };
  };

  // Remove EVERY tracked pine series + markers (price/compare/built-ins/drawings survive).
  const clearAllPine = () => {
    const chart = chartRef.current; if (!chart) return;
    for (const plugin of pineMarkersRef.current.values()) { try { plugin.detach(); } catch {} }
    pineMarkersRef.current.clear();
    for (const arr of pineSeriesRef.current.values()) for (const s of arr) { try { chart.removeSeries(s); } catch {} }
    pineSeriesRef.current.clear(); pinePaneMapRef.current.clear();
  };

  // Build ALL enabled scripts onto `rows`. Non-overlay scripts append sub-panes AFTER any built-in
  // sub-panes (osc/macd) in the scripts' array order. Errors are captured per-script (legend), never thrown.
  const buildAllPine = (rows: Bar[]) => {
    const chart = chartRef.current; if (!chart) return;
    const scripts = pineScriptsRef.current; if (!scripts.length) return;
    // next free pane = 1 + max(any built-in sub-pane index already assigned)
    let pane = 1;
    for (const idx of paneMapRef.current.values()) pane = Math.max(pane, idx + 1);
    for (const s of scripts) {
      const { usedPane } = buildPineScript(s, rows, pane);
      if (usedPane) pane++;
    }
  };

  // ── DT Technicals Suite builders ──────────────────────────────────────────
  // Ichimoku: tenkan + kijun lines in pane 0; cloud filled via SVG overlay in indOverlayRef.
  const buildIchimoku = (chart: IChartApi, rows: Bar[]): ISeriesApi<any>[] => {
    const p = P("ichimoku");
    const ich = ichimoku(rows, p.tenkan, p.kijun, p.senkouB, p.displacement);
    const tenS = chart.addSeries(LineSeries, { color: p.tenkanCol, lineWidth: p.width, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, title: "Tenkan" }, 0);
    const kijS = chart.addSeries(LineSeries, { color: p.kijunCol, lineWidth: p.width, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, title: "Kijun" }, 0);
    tenS.setData(rows.map((r, i) => ich.tenkan[i] != null ? { time: r.time, value: ich.tenkan[i]! } : null).filter(Boolean) as any);
    kijS.setData(rows.map((r, i) => ich.kijun[i] != null ? { time: r.time, value: ich.kijun[i]! } : null).filter(Boolean) as any);
    // Span A/B as lines displaced into the future
    const spAData: any[] = [], spBData: any[] = [];
    for (let i = 0; i < ich.futureTimes.length; i++) {
      if (ich.spanA[i] != null) spAData.push({ time: ich.futureTimes[i], value: ich.spanA[i]! });
      if (ich.spanB[i] != null) spBData.push({ time: ich.futureTimes[i], value: ich.spanB[i]! });
    }
    const spAS = chart.addSeries(LineSeries, { color: "rgba(38,194,129,0.6)", lineWidth: 1 as any, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, title: "Span A" }, 0);
    const spBS = chart.addSeries(LineSeries, { color: "rgba(240,86,107,0.6)", lineWidth: 1 as any, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, title: "Span B" }, 0);
    spAS.setData(spAData); spBS.setData(spBData);
    // Store cloud data for SVG polygon rendering
    indOverlayRef.current["ichimoku"] = { ich, futureTimes: ich.futureTimes };
    return [tenS, kijS, spAS, spBS];
  };

  // Ribbon: EMA lines in pane 0; fill + candle coloring via SVG overlay.
  const buildRibbon = (chart: IChartApi, rows: Bar[], closes: number[]): ISeriesApi<any>[] => {
    const p = P("ribbon");
    const rb = trendRibbon(rows, p.fast, p.slow, p.slopeWin);
    const fastS = chart.addSeries(LineSeries, { color: p.colUp, lineWidth: p.width as any, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, title: `EMA${p.fast}` }, 0);
    const slowS = chart.addSeries(LineSeries, { color: p.colDn, lineWidth: p.width as any, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, title: `EMA${p.slow}` }, 0);
    fastS.setData(toLine(rows, rb.emaFast));
    slowS.setData(toLine(rows, rb.emaSlow));
    indOverlayRef.current["ribbon"] = { rb, rows };
    // Apply candle colors if enabled; restore if toggled off (colorCandles=false) while ribbon stays active
    if (p.colorCandles) applyRibbonCandleColors(rows, rb, p);
    else restoreNormalCandleColors(rows);
    return [fastS, slowS];
  };

  // Apply per-bar candle colors for the ribbon indicator.
  const applyRibbonCandleColors = (rows: Bar[], rb: ReturnType<typeof trendRibbon>, p: Record<string, any>) => {
    const priceS = priceSeriesRef.current; if (!priceS) return;
    const chartTyp = chartTypeRef.current;
    if (chartTyp === "line" || chartTyp === "area") return;
    const colored = rows.map((r, i) => {
      const st = rb.state[i], su = rb.shortUp[i];
      let col: string;
      if (st === "ribbonUp") col = su ? "#26c281" : "rgba(38,194,129,0.45)";
      else if (st === "ribbonDown") col = su === false ? "#f0566b" : "rgba(240,86,107,0.45)";
      else col = "#8b93a3";
      return chartTyp === "bars"
        ? { time: r.time, open: r.o, high: r.h, low: r.l, close: r.c, color: col }
        : { time: r.time, open: r.o, high: r.h, low: r.l, close: r.c, color: col, borderColor: col, wickColor: col };
    });
    try { priceS.setData(colored as any); } catch {}
  };

  // Restore normal candle colors (called when ribbon removed or colorCandles toggled off).
  const restoreNormalCandleColors = (rows: Bar[]) => {
    const priceS = priceSeriesRef.current; if (!priceS) return;
    const chartTyp = chartTypeRef.current;
    if (chartTyp === "line" || chartTyp === "area") return;
    try { priceS.setData(priceData(rows) as any); } catch {}
  };

  // SuperTrend: two line series (up/down rails with null gaps at flips).
  const buildSupertrend = (chart: IChartApi, rows: Bar[]): ISeriesApi<any>[] => {
    const p = P("supertrend");
    const st = supertrend(rows, p.period, p.mult);
    const upS = chart.addSeries(LineSeries, { color: p.colUp, lineWidth: p.width as any, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, title: "ST Up" }, 0);
    const dnS = chart.addSeries(LineSeries, { color: p.colDn, lineWidth: p.width as any, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, title: "ST Down" }, 0);
    upS.setData(rows.map((r, i) => st.up[i] != null ? { time: r.time, value: st.up[i]! } : null).filter(Boolean) as any);
    dnS.setData(rows.map((r, i) => st.down[i] != null ? { time: r.time, value: st.down[i]! } : null).filter(Boolean) as any);
    return [upS, dnS];
  };

  // AVWAP: dashed gold line.
  const buildAvwap = (chart: IChartApi, rows: Bar[]): ISeriesApi<any>[] => {
    const p = P("avwap");
    const anchors = ["swing_low", "swing_high", "max_history"] as const;
    const anchorKey = anchors[Math.min(2, Math.max(0, Math.round(p.anchor)))] ?? "swing_low";
    const vals = computeAvwap(rows, anchorKey, p.lookback);
    const ln = chart.addSeries(LineSeries, { color: p.col, lineWidth: p.width as any, lineStyle: 1 /* dashed */, priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: false, title: "AVWAP" }, 0);
    ln.setData(toLine(rows, vals));
    return [ln];
  };

  // Volume Profile: pure SVG overlay, no LWC series; returns empty array.
  const buildVprofile = (rows: Bar[]): ISeriesApi<any>[] => {
    const p = P("vprofile");
    const vp = vprofile(rows, p.window, p.bins, p.shelfMode);
    indOverlayRef.current["vprofile"] = { vp, rows };
    return [];
  };

  // Volatility Box: pure SVG overlay.
  const buildVolbox = (rows: Bar[]): ISeriesApi<any>[] => {
    const p = P("volbox");
    const vb = volbox(rows, p.bbLen, p.mult, p.pctileWin, p.squeezePct, p.boxWin);
    indOverlayRef.current["volbox"] = { vb, rows };
    return [];
  };

  // RSI Stack: three RSI lines in a dedicated sub-pane.
  const buildRsiStack = (chart: IChartApi, rows: Bar[], pane: number): ISeriesApi<any>[] => {
    const p = P("rsistack");
    const rs = rsiStack(rows, p.len1, p.len2, p.len3);
    const s1 = chart.addSeries(LineSeries, { color: p.col1, lineWidth: p.width as any, lastValueVisible: true, title: `RSI${p.len1}` }, pane);
    const s2 = chart.addSeries(LineSeries, { color: p.col2, lineWidth: p.width as any, lastValueVisible: true, title: `RSI${p.len2}` }, pane);
    const s3 = chart.addSeries(LineSeries, { color: p.col3, lineWidth: p.width as any, lastValueVisible: true, title: `RSI${p.len3}` }, pane);
    s1.setData(toLine(rows, rs.r1)); s2.setData(toLine(rows, rs.r2)); s3.setData(toLine(rows, rs.r3));
    if (p.showLevels) {
      try { s2.createPriceLine({ price: p.ob, color: "rgba(214,218,227,.25)", lineWidth: 1, lineStyle: 2, axisLabelVisible: false } as any); } catch {}
      try { s2.createPriceLine({ price: p.os, color: "rgba(214,218,227,.25)", lineWidth: 1, lineStyle: 2, axisLabelVisible: false } as any); } catch {}
    }
    return [s1, s2, s3];
  };

  // Accumulation %: single line pane with reference bands.
  const buildAccum = (chart: IChartApi, rows: Bar[], pane: number): ISeriesApi<any>[] => {
    const p = P("accum");
    const vals = accumPct(rows, p.win);
    const ln = chart.addSeries(LineSeries, { color: "#4d82ff", lineWidth: 1.4 as any, lastValueVisible: true, title: "Accum%" }, pane);
    ln.setData(toLine(rows, vals));
    if (p.showBands) {
      for (const band of [75, 50, 35]) {
        try { ln.createPriceLine({ price: band, color: "rgba(214,218,227,.3)", lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: "ref" } as any); } catch {}
      }
    }
    return [ln];
  };

  // Which sub-pane keys are active given the current indicator set (canonical order).
  const activeSubpanes = (): string[] => {
    const inds = indicatorsRef.current; const out: string[] = [];
    if (inds.has("rsi") || inds.has("stochrsi")) out.push("osc");
    if (inds.has("macd")) out.push("macd");
    if (inds.has("rsistack")) out.push("rsistack");
    if (inds.has("accum")) out.push("accum");
    return out;
  };

  // ── pane sizing: collapse/maximize/normal, keyed by pane KEY so it survives indicator churn+reorder ──
  // applyStretch is the successor to the base's "price 3.4 / sub 1" normalize: same baseline, but it
  // also honors the collapsed set + the maximized pane (via paneCtl) and any user-dragged normal sizes.
  const applyStretch = () => {
    const ctl = paneCtl.current;
    for (const m of panesMeta.current) {
      let s: number;
      if (ctl.maximized) s = m.key === ctl.maximized ? 1000 : 0.0001;
      else s = ctl.collapsed.has(m.key) ? 0.06 : (ctl.normal.get(m.key) ?? (m.isPrice ? 3.4 : 1));
      try { m.pane.setStretchFactor(s); } catch {}
    }
  };
  // legacy call-site name kept: every builder path calls normalizeStretch(). It now rebuilds the pane
  // registry (from the freshly-assigned paneMapRef), sizes via applyStretch, and re-applies the
  // eye/tf visibility to the freshly-built series.
  const normalizeStretch = () => { rebuildPaneMeta(); applyStretch(); applyHidden(); };

  // a genuine separator drag (normal mode only) becomes the new baseline; ignore programmatic sizing
  const captureNormal = () => { const ctl = paneCtl.current; if (ctl.maximized) return; for (const m of panesMeta.current) { if (ctl.collapsed.has(m.key)) continue; try { ctl.normal.set(m.key, m.pane.getStretchFactor()); } catch {} } };

  // Legend swatch color for a script = its first rendered series' color (best-effort), else grey.
  const pineColorOf = (arr?: ISeriesApi<any>[]): string => {
    try { const c = (arr?.[0]?.options() as any)?.color || (arr?.[0]?.options() as any)?.lineColor; if (c) return c; } catch {}
    return tokensRef.current.mut || "#787b86";
  };
  // Build a LegendEntry for a custom script. `key` is the raw scriptId (isPine:true tells the shell
  // to route Settings to the pine branch + resolve remove/eye by scriptId). An error surfaces in the
  // label (⚠ suffix) and — because ChartOverlays doesn't take a tooltip — the shell can read it too.
  const pineLegendEntry = (s: PineScript, kind: "overlay" | "pane", series: ISeriesApi<any>[] | undefined, err?: string): Omit<LegendEntry, "hidden"> => ({
    key: s.id, label: err ? `${s.name} ⚠` : s.name, kind, isPine: true, color: pineColorOf(series),
  });

  // Rebuild the per-pane legend registry from the CURRENT indicator series + paneMapRef. The price pane
  // carries the active overlay entries (ema/bb/vwap/vol + overlay scripts); each sub-pane carries its own
  // indicator(s) / script, with the shared osc pane listing rsi and/or stochrsi separately. Any stale
  // collapse/normal entries for panes that no longer exist are pruned so the sizing map can't leak.
  const rebuildPaneMeta = () => {
    const chart = chartRef.current, priceS = priceSeriesRef.current; if (!chart || !priceS) return;
    const inds = indicatorsRef.current;
    const overlayEntries: Omit<LegendEntry, "hidden">[] = [];
    // Golden Oracle Confluence: not a plotted series but the flagship signal layer (BUY/SELL marks +
    // verdict badge). List it FIRST on the price pane so it can be hidden (eye) or removed like any study.
    if (inds.has("_oracle")) overlayEntries.push({ key: "_oracle", label: "Golden Oracle Confluence", kind: "overlay", isPine: false, noParams: true });
    for (const k of ["ema", "bb", "vwap", "vol", "ichimoku", "ribbon", "supertrend", "avwap", "vprofile", "volbox"] as const) if (inds.has(k) && (indSeriesRef.current.has(k) || k === "vprofile" || k === "volbox")) overlayEntries.push({ key: k, label: labelOf(k), kind: "overlay", isPine: false });
    // Gaps & Demand: signal-layer overlay (no plotted series, like the oracle) — drawn in renderSignals.
    // Registry-backed, so it keeps its Settings/Source/eye/remove menu.
    if (inds.has("gaps")) overlayEntries.push({ key: "gaps", label: labelOf("gaps"), kind: "overlay", isPine: false });
    // custom scripts: OVERLAY ones (or errored ones) list on the price pane; each SUB-PANE script gets
    // its own pane meta below. An errored script still gets a legend row so the user sees + can remove it.
    // On INTRADAY the pine build is skipped entirely (buildAllPine is date-keyed — see buildAllIndicators),
    // so NO series or engine error exists for any enabled script; surface an explicit "not available on
    // intraday" error on the row (⚠) instead of a phantom active-looking legend entry with no plot.
    for (const s of pineScriptsRef.current) {
      const err = isIntradayRef.current ? "Not available on intraday timeframes" : pineErrRef.current.get(s.id);
      const series = pineSeriesRef.current.get(s.id);
      const hasPane = pinePaneMapRef.current.has(s.id);
      if (hasPane) continue;   // sub-pane script → handled in the sub-pane loop
      overlayEntries.push(pineLegendEntry(s, "overlay", series, err));
    }
    // compare overlays: append to overlay entries so they appear as real legend rows in the price pane.
    const cmp = compareRef.current || []; const cfgM = compareCfgRef.current || {};
    for (let ci = 0; ci < cmp.length && ci < 4; ci++) { const cs = cmp[ci]; if (!cs || cs === symbol) continue; const cfg = cfgM[cs]; overlayEntries.push({ key: cmpKey(cs), label: cs, kind: "overlay", isPine: false, isCompare: true, color: cfg?.color || CMP_PALETTE[ci % CMP_PALETTE.length] }); }
    const metas: { key: string; isPrice: boolean; entries: Omit<LegendEntry, "hidden">[]; pane: IPaneApi<any> }[] = [];
    metas.push({ key: "__price__", isPrice: true, entries: overlayEntries, pane: priceS.getPane() });
    for (const key of SUBPANE_ORDER) {
      const arr = indSeriesRef.current.get(key); if (!arr || !arr.length) continue;
      const entries: Omit<LegendEntry, "hidden">[] = key === "osc"
        ? (["stochrsi", "rsi"] as const).filter((k) => inds.has(k)).map((k) => ({ key: k, label: labelOf(k), kind: "pane", isPine: false }))
        : [{ key, label: labelOf(key), kind: "pane", isPine: false }];
      metas.push({ key, isPrice: false, entries, pane: arr[0].getPane() });
    }
    // pine SUB-PANE scripts, in their assigned-pane order
    for (const s of pineScriptsRef.current) {
      if (!pinePaneMapRef.current.has(s.id)) continue;
      const arr = pineSeriesRef.current.get(s.id); if (!arr || !arr.length) continue;
      metas.push({ key: pineKeyOf(s.id), isPrice: false, entries: [pineLegendEntry(s, "pane", arr, pineErrRef.current.get(s.id))], pane: arr[0].getPane() });
    }
    panesMeta.current = metas;
    // prune sizing/collapse state for panes that no longer exist
    const surv = new Set(metas.map((m) => m.key)); const ctl = paneCtl.current;
    for (const k of Array.from(ctl.collapsed)) if (!surv.has(k)) ctl.collapsed.delete(k);
    for (const k of Array.from(ctl.normal.keys())) if (!surv.has(k)) ctl.normal.delete(k);
    if (ctl.maximized && !surv.has(ctl.maximized)) ctl.maximized = null;
    // re-observe pane elements so separator drags / collapses reposition the overlay + rebaseline
    const pRO = paneRORef.current; if (pRO) { try { pRO.disconnect(); } catch {} for (const m of metas) { try { const pe = m.pane.getHTMLElement(); if (pe) pRO.observe(pe); } catch {} } }
    measureRef.current();
  };

  // ── pane-control operations (read chart refs; safe to recreate every render) ──
  const keyOfPaneIndex = (pi: number) => { const m = panesMeta.current.find((x) => { try { return x.pane.paneIndex() === pi; } catch { return false; } }); return m?.key ?? null; };
  const measure = () => measureRef.current();
  const doMaximize = (pi: number) => { const key = keyOfPaneIndex(pi); if (!key) return; const ctl = paneCtl.current; if (ctl.maximized === key) ctl.maximized = null; else { ctl.maximized = key; ctl.collapsed.delete(key); } applyStretch(); requestAnimationFrame(measure); };
  const doCollapse = (pi: number) => { const key = keyOfPaneIndex(pi); if (!key) return; const ctl = paneCtl.current; ctl.maximized = null; if (ctl.collapsed.has(key)) ctl.collapsed.delete(key); else ctl.collapsed.add(key); applyStretch(); requestAnimationFrame(measure); };
  const collapseAllPanes = () => { const ctl = paneCtl.current; ctl.maximized = null; const subs = panesMeta.current.filter((m) => !m.isPrice).map((m) => m.key); if (!subs.length) return; const all = subs.every((k) => ctl.collapsed.has(k)); if (all) subs.forEach((k) => ctl.collapsed.delete(k)); else subs.forEach((k) => ctl.collapsed.add(k)); applyStretch(); requestAnimationFrame(measure); };
  const doMove = (pi: number, dir: -1 | 1) => { const ch = chartRef.current; if (!ch) return; const tgt = pi + dir; let n = 1; try { n = ch.panes().length; } catch {} if (tgt < 0 || tgt >= n) return; try { ch.swapPanes(pi, tgt); } catch {} requestAnimationFrame(measure); };
  const canMoveUp = (pi: number) => pi > 0;
  const canMoveDown = (pi: number) => pi < paneLayoutRef.current.length - 1;
  // visibility-on-intervals: is this indicator allowed to show on the current timeframe? (Settings → Visibility)
  const tfVisible = (k: string) => {
    const v = (indParamsRef.current[k] || {})._vis; if (!v) return true;
    const m = /^(\d*)([DWM])$/.exec(timeframeRef.current); if (!m) return true;   // intraday tf → no _vis gating
    const n = parseInt(m[1] || "1", 10) || 1;
    const u = m[2] === "D" ? v.days : m[2] === "W" ? v.weeks : v.months;
    return !u ? true : (u.on !== false && n >= (u.min ?? 1) && n <= (u.max ?? 1e9));
  };
  // flip series visibility (eye toggle + tf-visibility) WITHOUT a chart/series rebuild
  const applyHidden = () => {
    const h = hiddenRef.current; const SB = indSeriesRef.current;
    // rsi + stochrsi share the osc series list; toggle each series by which indicator it belongs to via its title
    for (const [k, arr] of SB) {
      if (k === "osc") { for (const s of arr) { try { const ttl = ((s.options() as any)?.title || "").toUpperCase(); const own = ttl.includes("RSI") && !ttl.includes("%") ? "rsi" : "stochrsi"; s.applyOptions({ visible: !h.has(own) && tfVisible(own) } as any); } catch {} } continue; }
      const vis = !h.has(k) && tfVisible(k); for (const s of arr) { try { s.applyOptions({ visible: vis } as any); } catch {} }
    }
    // custom scripts: eye toggle by scriptId (no tf-visibility gating — scripts don't declare _vis)
    for (const [id, arr] of pineSeriesRef.current) { const vis = !h.has(id); for (const s of arr) { try { s.applyOptions({ visible: vis } as any); } catch {} } }
    // compare series: eye toggle by cmpKey(sym)
    for (const [sym, s] of cmpSeriesRef.current) { try { s.applyOptions({ visible: !h.has(cmpKey(sym)) } as any); } catch {} }
  };

  // Remove EVERY tracked indicator series (price/compare/drawings survive). Used by the bounded rebuild.
  const clearAllIndicators = () => {
    const chart = chartRef.current; if (!chart) return;
    for (const arr of indSeriesRef.current.values()) for (const s of arr) { try { chart.removeSeries(s); } catch {} }
    indSeriesRef.current.clear(); paneMapRef.current.clear();
    indOverlayRef.current = {};
  };

  // Build the full indicator set from scratch in canonical order onto `rows`.
  // Overlays first (pane 0), then sub-panes appended sequentially → assigns paneMapRef.
  const buildAllIndicators = (rows: Bar[], closes: number[]) => {
    const chart = chartRef.current; if (!chart) return; const inds = indicatorsRef.current;
    // Clear SVG overlay data for overlays being rebuilt
    indOverlayRef.current = {};
    if (inds.has("ema")) indSeriesRef.current.set("ema", buildEma(chart, rows, closes));
    if (inds.has("bb")) indSeriesRef.current.set("bb", buildBb(chart, rows, closes));
    if (inds.has("vwap")) indSeriesRef.current.set("vwap", buildVwap(chart, rows));
    if (inds.has("vol")) indSeriesRef.current.set("vol", buildVol(chart, rows));
    // DT overlay indicators
    if (inds.has("ichimoku")) indSeriesRef.current.set("ichimoku", buildIchimoku(chart, rows));
    if (inds.has("ribbon")) indSeriesRef.current.set("ribbon", buildRibbon(chart, rows, closes));
    if (inds.has("supertrend")) indSeriesRef.current.set("supertrend", buildSupertrend(chart, rows));
    if (inds.has("avwap")) indSeriesRef.current.set("avwap", buildAvwap(chart, rows));
    if (inds.has("vprofile")) indSeriesRef.current.set("vprofile", buildVprofile(rows));
    if (inds.has("volbox")) indSeriesRef.current.set("volbox", buildVolbox(rows));
    // If ribbon is NOT active, ensure normal candle colors
    if (!inds.has("ribbon")) restoreNormalCandleColors(rows);
    let pane = 1;
    for (const key of activeSubpanes()) {
      if (key === "osc") indSeriesRef.current.set("osc", buildOsc(chart, rows, closes, pane));
      else if (key === "macd") indSeriesRef.current.set("macd", buildMacd(chart, rows, closes, pane));
      else if (key === "rsistack") indSeriesRef.current.set("rsistack", buildRsiStack(chart, rows, pane));
      else if (key === "accum") indSeriesRef.current.set("accum", buildAccum(chart, rows, pane));
      paneMapRef.current.set(key, pane); pane++;
    }
    // custom scripts always ride along a full indicator rebuild (bars/indicator/replay change): rebuild
    // them on the SAME on-chart `rows` so their series align with the visible bars. runPineMemo caches
    // per script, so unchanged scripts don't recompute; only a fresh bar set / edited script re-runs.
    // Skipped on intraday (bars carry a NUMERIC epoch `time`; the engine's date math assumes "YYYY-MM-DD").
    clearAllPine();
    if (!isIntradayRef.current) buildAllPine(rows);
    normalizeStretch();
  };

  // Update EXISTING indicator series in-place via setData (no removeSeries/addSeries).
  // Safe to call only when the indicator SET is unchanged (same keys in indSeriesRef).
  // Used by Effect 2 on same-symbol timeframe/chartType switches to avoid the DOM series lifecycle cost.
  const updateAllIndicators = (rows: Bar[], closes: number[]) => {
    const inds = indicatorsRef.current; const SB = indSeriesRef.current;
    if (!SB.size) return;  // nothing to update (no indicators active)
    // overlays
    if (inds.has("ema")) {
      const sArr = SB.get("ema"); const p = P("ema");
      const configs = ([[p.ma1On, p.ma1Len], [p.ma2On, p.ma2Len], [p.ma3On, p.ma3Len]] as [boolean, number][]).filter(([on]) => on);
      if (sArr) configs.forEach(([, len], i) => { if (sArr[i]) sArr[i].setData(toLine(rows, ema(closes, len))); });
    }
    if (inds.has("bb")) {
      const sArr = SB.get("bb"); const p = P("bb");
      const basis = sma(closes, p.length); const sd = stddev(closes, p.length);
      const up = closes.map((_, i) => (basis[i] != null && sd[i] != null ? basis[i]! + p.mult * sd[i]! : null));
      const lo = closes.map((_, i) => (basis[i] != null && sd[i] != null ? basis[i]! - p.mult * sd[i]! : null));
      if (sArr) { [up, basis, lo].forEach((arr, j) => { if (sArr[j]) sArr[j].setData(toLine(rows, arr)); }); }
    }
    if (inds.has("vwap")) {
      const sArr = SB.get("vwap"); if (sArr?.[0]) { let cum = 0, cumv = 0; const vw = rows.map((r) => { const tp = (r.h + r.l + r.c) / 3; cum += tp * r.v; cumv += r.v; return cumv ? cum / cumv : null; }); sArr[0].setData(toLine(rows, vw)); }
    }
    if (inds.has("vol")) {
      const sArr = SB.get("vol"); if (sArr?.[0]) sArr[0].setData(volData(rows));
    }
    // sub-pane oscillators
    if (SB.has("osc")) {
      const sArr = SB.get("osc")!; let si = 0;
      if (inds.has("stochrsi")) { const p = P("stochrsi"); const sr = stochRsi(closes, p.rsiLength, p.stochLength, p.smoothK, p.smoothD); if (sArr[si]) sArr[si].setData(toLine(rows, sr.k)); si++; if (sArr[si]) sArr[si].setData(toLine(rows, sr.d)); si++; }
      if (inds.has("rsi")) { const p = P("rsi"); if (sArr[si]) sArr[si].setData(toLine(rows, rsi(closes, p.length))); }
    }
    if (SB.has("macd")) {
      const sArr = SB.get("macd")!; const p = P("macd"); const m = macd(closes, p.fast, p.slow, p.signal);
      if (sArr[0]) sArr[0].setData(rows.map((r, i) => (m.hist[i] != null ? { time: r.time, value: m.hist[i]!, color: m.hist[i]! >= 0 ? p.upHist : p.downHist } : null)).filter(Boolean) as any);
      if (sArr[1]) sArr[1].setData(toLine(rows, m.line));
      if (sArr[2]) sArr[2].setData(toLine(rows, m.sig));
    }
  };

  // Build indDataMapRef: time → {indKey: value} for every active built-in indicator.
  // Keys match the indCols `key` field (same as the indicator id: "ema", "rsi", etc.) so ChartTableView
  // can look them up directly. Multi-line indicators (EMA, BB) expose their first/primary line value.
  const buildIndDataMap = (rows: Bar[], closes: number[]) => {
    const inds = indicatorsRef.current;
    const m = new Map<string, Record<string, number | null>>();
    const slot = (t: string | number) => { const k = String(t); if (!m.has(k)) m.set(k, {}); return m.get(k)!; };
    if (inds.has("ema")) {
      const p = P("ema");
      // Expose the first active EMA line under "ema" so the column always has a value
      const [on1, len1] = [p.ma1On as boolean, p.ma1Len as number];
      const [on2, len2] = [p.ma2On as boolean, p.ma2Len as number];
      const [on3, len3] = [p.ma3On as boolean, p.ma3Len as number];
      const activeLen = on1 ? len1 : on2 ? len2 : on3 ? len3 : null;
      if (activeLen != null) { const vals = ema(closes, activeLen); rows.forEach((r, i) => { slot(r.time)["ema"] = vals[i] ?? null; }); }
    }
    if (inds.has("bb")) {
      const p = P("bb"); const basis = sma(closes, p.length);
      rows.forEach((r, i) => { slot(r.time)["bb"] = basis[i] ?? null; });
    }
    if (inds.has("vwap")) {
      let cum = 0, cumv = 0; rows.forEach((r) => { const tp = (r.h + r.l + r.c) / 3; cum += tp * r.v; cumv += r.v; slot(r.time)["vwap"] = cumv ? cum / cumv : null; });
    }
    if (inds.has("rsi")) {
      const p = P("rsi"); const rsiVals = rsi(closes, p.length);
      rows.forEach((r, i) => { slot(r.time)["rsi"] = rsiVals[i] ?? null; });
    }
    if (inds.has("stochrsi")) {
      const p = P("stochrsi"); const sr = stochRsi(closes, p.rsiLength, p.stochLength, p.smoothK, p.smoothD);
      // expose %K under "stochrsi" (the primary line shown in the legend)
      rows.forEach((r, i) => { slot(r.time)["stochrsi"] = sr.k[i] ?? null; });
    }
    if (inds.has("macd")) {
      const p = P("macd"); const mv = macd(closes, p.fast, p.slow, p.signal);
      rows.forEach((r, i) => { slot(r.time)["macd"] = mv.line[i] ?? null; });
    }
    indDataMapRef.current = m;
    // Publish the stable getter to the parent (TerminalShell → ChartTableView)
    onIndRowsAtRef.current?.((barTime) => indDataMapRef.current.get(String(barTime)) ?? {});
  };

  // Rebuild ONLY the compare overlays onto `rows` (used by data + replay effects).
  const rebuildCompare = async (rows: Bar[], epoch: number) => {
    // Compare has its OWN generation token: two rapid compare edits share the same symbol `epoch`
    // (epochRef only bumps in Effect 2), so without this a superseded run would resume after its
    // await and re-add series into a map the winning run has already repopulated → orphaned line + leak.
    const gen = ++cmpGenRef.current;
    const chart = chartRef.current; if (!chart) return;
    for (const s of cmpSeriesRef.current.values()) { try { chart.removeSeries(s); } catch {} }
    cmpSeriesRef.current.clear();
    const prec = precRef.current; const cmp = compareRef.current || [];
    for (let ci = 0; ci < cmp.length && ci < 4; ci++) {
      const cs = cmp[ci]; if (!cs || cs === symbol) continue;
      const co = await getJSON(`/data/${cs}.json`);
      if (cmpGenRef.current !== gen || epochRef.current !== epoch) return;   // superseded compare run OR symbol/tf changed mid-fetch — abandon this build
      if (!co?.bars?.length) continue;
      let crows: Bar[] = co.bars.map((b: any[]) => ({ time: b[0], o: b[1], h: b[2], l: b[3], c: b[4], v: b[5] }));
      crows = resampleTf(crows, timeframeRef.current);
      const cmap: Record<string, number> = {}; for (const cr of crows) cmap[cr.time] = cr.c;
      const cfg = compareCfgRef.current[cs] || defaultCmpCfg(ci);
      let lv: number | null = null;
      let cdata: any[];
      if (cfg.mode === "price") {
        cdata = rows.map((r) => { const v = cmap[r.time]; if (v != null) lv = v; return lv != null ? { time: r.time, value: +lv.toFixed(prec) } : null; }).filter(Boolean);
        const ln = chart.addSeries(LineSeries, { color: cfg.color, lineWidth: cfg.lineWidth as any, lineStyle: cfg.lineStyle as any, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, title: cs, priceScaleId: cmpKey(cs), visible: !hiddenRef.current.has(cmpKey(cs)) }, 0);
        ln.setData(cdata as any); cmpSeriesRef.current.set(cs, ln);
      } else {
        let bse = 0, baseA = rows[0]?.c ?? 0; for (const r of rows) { if (cmap[r.time] != null) { bse = cmap[r.time]; baseA = r.c; break; } }
        if (!bse) continue; const scl = baseA / bse;
        cdata = rows.map((r) => { const v = cmap[r.time]; if (v != null) lv = v; return lv != null ? { time: r.time, value: +(lv * scl).toFixed(prec) } : null; }).filter(Boolean);
        const ln = chart.addSeries(LineSeries, { color: cfg.color, lineWidth: cfg.lineWidth as any, lineStyle: cfg.lineStyle as any, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, title: cs, visible: !hiddenRef.current.has(cmpKey(cs)) }, 0);
        ln.setData(cdata as any); cmpSeriesRef.current.set(cs, ln);
      }
    }
  };

  // Resolve BUY/SELL/CUT/REBUY marks against the CURRENT bar set (base's `sigMarks` logic).
  const resolveSigMarks = (slice: any, rows: Bar[]) => {
    const times = rows.map((r) => r.time);
    const lastDate = times[times.length - 1];
    const near = (iso: string) => { let b: string | null = null, bd = 1e18; const x = new Date(iso + "T00:00:00Z").getTime(); times.forEach((y) => { const dd = Math.abs(new Date(y + "T00:00:00Z").getTime() - x); if (dd < bd) { bd = dd; b = y; } }); return bd < 9e8 ? b : null; };
    return (slice?.indicator?.signals || [])
      .filter((s: any) => s.ts <= lastDate)
      // GC v2: carry quality/tier so renderSignals can style keeper take/block/pending + regime_blocked
      // entries and draw the A+/Q tier badge. All optional — v1 slices leave them undefined.
      .map((s: any) => ({ t: near(s.ts), type: s.type as string, price: s.price as number, quality: s.quality, tier: s.tier }))
      .filter((m: any) => m.t && m.price != null) as { t: string; type: string; price: number; quality?: string; tier?: string | null }[];
  };

  // GC v2 side channels → bar-snapped marks. early_dots is a list of date strings (anticipation
  // pre-cross); warnings is a list of {ts, kind:"arm"|"confirm"} (structure-break). Both live on the
  // slice indicator parallel to signals (emitter: ingest/gen_slices_all.py writes {"indicator": ind}).
  const resolveSideChannels = (slice: any, rows: Bar[]) => {
    const times = rows.map((r) => r.time);
    const lastDate = times[times.length - 1];
    const near = (iso: string) => { let b: string | null = null, bd = 1e18; const x = new Date(iso + "T00:00:00Z").getTime(); times.forEach((y) => { const dd = Math.abs(new Date(y + "T00:00:00Z").getTime() - x); if (dd < bd) { bd = dd; b = y; } }); return bd < 9e8 ? b : null; };
    const dots = ((slice?.indicator?.early_dots || []) as string[])
      .filter((ts) => ts <= lastDate)
      .map((ts) => ({ t: near(ts) as string | null }))
      .filter((m) => m.t) as { t: string }[];
    const warns = ((slice?.indicator?.warnings || []) as { ts: string; kind: string }[])
      .filter((w) => w?.ts <= lastDate)
      .map((w) => ({ t: near(w.ts) as string | null, kind: w.kind }))
      .filter((m) => m.t) as { t: string; kind: string }[];
    return { dots, warns };
  };

  // Status line + verdict badge from the current bars + slice.
  const paintStatus = (rows: Bar[], slice: any) => {
    const prec = precRef.current; const t = tokensRef.current;
    const last = rows[rows.length - 1], prev = rows[rows.length - 2] || last;
    if (statusRef.current && last) {
      const showOHLC = showOHLCRef.current;
      const showBarChange = showBarChangeRef.current;
      const ch = last.c - prev.c, cp = (ch / prev.c) * 100, u = ch >= 0, f = (x: number) => x.toFixed(prec);
      let html = "";
      if (showOHLC) html += `<span class="mut">O</span><b>${f(last.o)}</b> <span class="mut">H</span><b>${f(last.h)}</b> <span class="mut">L</span><b>${f(last.l)}</b> <span class="mut">C</span><b>${f(last.c)}</b>`;
      if (showBarChange) { if (html) html += " "; html += `<b class="${u ? "up" : "down"}">${u ? "+" : ""}${f(ch)} (${u ? "+" : ""}${cp.toFixed(2)}%)</b>`; }
      statusRef.current.innerHTML = html;
    }
    if (verdictRef.current) { const v = slice?.indicator?.state?.last_signal || "—"; const buy = v === "BUY" || v === "REBUY"; verdictRef.current.textContent = `GOLDEN ORACLE · ${v}`; verdictRef.current.style.color = buy ? t.buy : t.sell; const w = verdictRef.current.parentElement as HTMLElement; if (w) { w.style.background = buy ? "rgba(38,194,129,.12)" : "rgba(240,86,107,.12)"; w.style.borderColor = buy ? "rgba(38,194,129,.3)" : "rgba(240,86,107,.3)"; } }
  };

  // ── R11 live-bar splice ───────────────────────────────────────────────────
  // Patch/append the live quote onto the last (daily or resampled) bar so the chart's newest
  // candle agrees with the header price. Operates on the RAW daily source (dailyBarsRef), folds
  // the final bucket for resampled TFs, and `series.update()`s exactly one bar. Also updates
  // barsRef/fullBarsRef so the status line, sig-mark snapping and pane-sync map stay consistent.
  // Guards (any → no-op): no chart/series, intraday TF, replay active, basis not spliceable,
  // no quote/last, or the daily source is empty.
  const applyLiveSplice = () => {
    const priceS = priceSeriesRef.current; if (!priceS) return;
    if (isIntradayRef.current) return;                     // intraday is already live
    if (replayIdxRef.current != null) return;              // never splice under replay
    const q = liveQuoteRef.current;
    if (!q || q.last == null || !isFinite(q.last)) return;
    if (!SPLICE_BASES.has(q.basis || "")) return;          // EOD / missing basis → no splice
    const daily = dailyBarsRef.current; if (!daily.length) return;
    const tf = timeframeRef.current;
    const market = classify(symbol);
    const sd = sessionDateOf(q.ts, market);
    if (sd == null) return;
    const spliced = spliceDaily(daily, q, sd);
    if (spliced === daily) return;                         // nothing changed (older session)
    // fold to the bar the chart actually plots at this TF, then push it via update()
    let bucket = foldFinalBucket(spliced, tf);
    if (!bucket) return;
    // R11: reuse the EXISTING final-bucket time key unless the spliced daily date GENUINELY starts a
    // new bucket (e.g. a fresh ISO week / month / 3D group). For resampled TFs the bucketer re-stamps
    // the merged bucket's time to the newest daily date, which > the on-chart key → update() would
    // APPEND a phantom bar. Detect "same bucket" by comparing pre/post bucket counts and, if equal,
    // rewrite the key to the on-chart final bucket's time so update() REPLACES it in place.
    if (tf !== "D") {
      const preCount = resampleTf(daily, tf).length;
      const postCount = resampleTf(spliced, tf).length;
      const chartLastTime = fullBarsRef.current[fullBarsRef.current.length - 1]?.time;
      if (postCount === preCount && chartLastTime != null && chartLastTime !== bucket.time) {
        bucket = { ...bucket, time: chartLastTime as string };
      }
    }
    // heikin falls through to the OHLC mapping (raw candle acceptable per spec caveat) — passing the
    // raw {o,h,l,c,v} bucket to a candlestick series is read as a whitespace point (no `open` key)
    // and BLANKS the live candle. Map to {open,high,low,close} like the candle/bars family.
    try { priceS.update((chartTypeRef.current === "line" || chartTypeRef.current === "area" ? { time: bucket.time, value: bucket.c } : { time: bucket.time, open: bucket.o, high: bucket.h, low: bucket.l, close: bucket.c }) as any); } catch { return; }
    // keep the in-memory bar sets in step with what's on the chart (last bucket only)
    const fb = fullBarsRef.current;
    const bs = barsRef.current;
    // Capture ref identity BEFORE the fullBarsRef append below reassigns it to a new array. Off-replay
    // Effect 2 sets barsRef.current === fullBarsRef.current, so wasSame is true; on the APPEND case
    // fullBarsRef is reassigned to [...fb, bucket] while `fb`/`bs` still hold the old array — we must
    // resync barsRef to the new fullBarsRef (else the status line reads the pre-splice tail for a poll).
    const wasSame = bs.length > 0 && bs === fb;
    if (fb.length) { if (fb[fb.length - 1].time === bucket.time) fb[fb.length - 1] = bucket; else fullBarsRef.current = [...fb, bucket]; }
    if (wasSame) { barsRef.current = fullBarsRef.current; }
    else if (bs.length) { if (bs[bs.length - 1].time === bucket.time) bs[bs.length - 1] = bucket; else barsRef.current = [...bs, bucket]; }
    closesRef.current = barsRef.current.map((r) => r.c);
    paintStatus(barsRef.current, sliceRef.current);
    renderSignalsRef.current();
    renderTagRef.current?.();   // live-quote splice moved the last close → refresh the price/countdown tag now
  };

  // Apply the default view (recent ~240 window in normal mode; fit the slice in replay).
  const applyView = (rows: Bar[], replay: number | null) => {
    const chart = chartRef.current; if (!chart) return;
    const DEFAULT_VIEW = 240, n = rows.length;
    try { if (replay == null && n > DEFAULT_VIEW) chart.timeScale().setVisibleLogicalRange({ from: n - DEFAULT_VIEW, to: n - 1 + 6 }); else chart.timeScale().fitContent(); } catch {}
  };

  // ────────────────────────────────────────────────────────────────────────────
  // EFFECT 1 — mount once. createChart + ALL listeners/overlays + render closures.
  // ────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    cpMark(`chart-effect1-start[${symbol}]`);
    const el = ref.current; if (!el) return;
    let ro: ResizeObserver | null = null, paneRO: ResizeObserver | null = null, dead = false;
    let onKey: ((e: KeyboardEvent) => void) | null = null;
    let onCtx: ((e: MouseEvent) => void) | null = null, winDown: ((e: PointerEvent) => void) | null = null, dragCleanup: (() => void) | null = null;
    let rafId: number | null = null, measRaf: number | null = null;
    let onPaneMove: ((e: MouseEvent) => void) | null = null, onPaneLeave: (() => void) | null = null, onPaneDbl: ((e: MouseEvent) => void) | null = null;
    // ── snapshot: composite the chart with per-pane labels + brand logo + timestamp ──
    // action = "download" | "copy" | "share" | "tab" (from event detail; default = "download")
    // Reads live refs so labels match the on-screen state.
    // Scale: takeScreenshot() returns a canvas at lightweight-charts' own pixel ratio (may be 1:1).
    // We derive realScale from src.width / wrap.clientWidth and upscale the output to TARGET_SCALE (2x)
    // for crispness. Drawing overlays (sigSvg z-index:3, drawSvg z-index:4) are composited separately.
    const TARGET_SCALE = 2;
    // Serialize an SVG element to a bitmap at the given CSS dimensions scaled to TARGET_SCALE.
    const svgToImage = (svgEl: SVGSVGElement, cssW: number, cssH: number): Promise<HTMLImageElement | null> => {
      return new Promise((resolve) => {
        try {
          const clone = svgEl.cloneNode(true) as SVGSVGElement;
          clone.setAttribute("width", String(cssW * TARGET_SCALE));
          clone.setAttribute("height", String(cssH * TARGET_SCALE));
          const xml = new XMLSerializer().serializeToString(clone);
          const blob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
          const url = URL.createObjectURL(blob);
          const img = new Image();
          img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
          img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
          img.src = url;
        } catch { resolve(null); }
      });
    };
    const snapshot = (ev?: Event) => {
      if (!activeRef.current) return;
      const action: string = (ev as CustomEvent)?.detail?.action || "download";
      (async () => {
        try {
          const src = chartRef.current!.takeScreenshot();   // HTMLCanvasElement — all panes (lightweight-charts' own px ratio)
          const wrap = wrapElRef.current;
          const cssW = wrap ? wrap.clientWidth : src.width;
          const cssH = wrap ? wrap.clientHeight : src.height;
          // Output scale for the final PNG: always TARGET_SCALE (2x) for crisp sharing.
          // takeScreenshot() may return a 1:1 canvas (lightweight-charts' own ratio); we upscale
          // via drawImage so the final PNG is always 2x regardless of the chart's native resolution.
          const dpr = TARGET_SCALE;
          // Upscaled chart dimensions in output px.
          const chartW = Math.round(cssW * dpr);
          const chartH = Math.round(cssH * dpr);
          const HDR = Math.round(52 * dpr);                        // header band height in output px
          const out = document.createElement("canvas");
          out.width = chartW; out.height = chartH + HDR;
          const g = out.getContext("2d"); if (!g) return;
          const bg = css("--bg") || "#0a0b0e";
          const text = css("--text") || "#d6dae3";
          const mut = tokensRef.current.mut || css("--muted") || "#5a616f";
          const brand2 = tokensRef.current.brand2 || css("--brand-2") || "#4d82ff";
          const fam = css("--font-ui") || "system-ui, sans-serif";
          // ── background ──
          g.fillStyle = bg;
          g.fillRect(0, 0, out.width, out.height);
          // Draw chart upscaled from its native resolution to TARGET_SCALE.
          g.drawImage(src, 0, HDR, chartW, chartH);
          // ── composite drawing overlays (signal markers z:3, user drawings z:4) ──
          // Each SVG occupies the full wrap (inset:0 100% 100%), so we draw them at (0, HDR).
          if (wrap) {
            const sigSvgEl = sigRef.current;
            const drawSvgEl = svgRef.current;
            const [sigImg, drawImg] = await Promise.all([
              sigSvgEl ? svgToImage(sigSvgEl, cssW, cssH) : Promise.resolve(null),
              drawSvgEl ? svgToImage(drawSvgEl, cssW, cssH) : Promise.resolve(null),
            ]);
            if (sigImg) g.drawImage(sigImg, 0, HDR, chartW, chartH);
            if (drawImg) g.drawImage(drawImg, 0, HDR, chartW, chartH);
          }
          // ── header band ──
          const tf = timeframeRef.current;
          const pad = Math.round(14 * dpr);
          g.textBaseline = "middle";
          g.textAlign = "left";
          // brand logo: draw the M tile (BrandMark) then MASTERMIND TERMINAL wordmark
          // Tile: 32×32 CSS px tile → scaled by dpr
          const tileSize = Math.round(28 * dpr);
          const tileX = pad, tileY = Math.round((HDR - tileSize) / 2);
          const rx = tileSize * 0.2;           // rounded corner radius
          // gradient fill for the tile
          const grd = g.createLinearGradient(tileX, tileY, tileX + tileSize, tileY + tileSize);
          grd.addColorStop(0, "#4d82ff"); grd.addColorStop(1, "#2962ff");
          g.fillStyle = grd;
          // rounded-rect tile
          g.beginPath(); g.roundRect(tileX, tileY, tileSize, tileSize, rx); g.fill();
          // subtle border on tile
          g.strokeStyle = "rgba(255,255,255,0.22)"; g.lineWidth = Math.round(0.8 * dpr);
          g.beginPath(); g.roundRect(tileX + g.lineWidth / 2, tileY + g.lineWidth / 2, tileSize - g.lineWidth, tileSize - g.lineWidth, rx - g.lineWidth / 2); g.stroke();
          // M path inside tile (matches BrandMark SVG: 40×40 viewBox, path d="M13 28 L13 14.5 L20 22 L27 12.5 L27 28")
          const scl = tileSize / 40;
          const pts: [number, number][] = [[13, 28], [13, 14.5], [20, 22], [27, 12.5], [27, 28]];
          g.beginPath();
          g.moveTo(tileX + pts[0][0] * scl, tileY + pts[0][1] * scl);
          for (let i = 1; i < pts.length; i++) g.lineTo(tileX + pts[i][0] * scl, tileY + pts[i][1] * scl);
          g.strokeStyle = "#fff"; g.lineWidth = Math.round(3.2 * scl); g.lineCap = "round"; g.lineJoin = "round"; g.stroke();
          // wordmark: MASTERMIND (bold) + TERMINAL (small, muted)
          const logoRight = tileX + tileSize + Math.round(10 * dpr);
          g.textAlign = "left"; g.textBaseline = "middle";
          g.fillStyle = text;
          g.font = `700 ${Math.round(11 * dpr)}px ${fam}`;
          g.fillText("MASTERMIND", logoRight, Math.round(HDR / 2 - 5 * dpr));
          g.fillStyle = mut;
          g.font = `500 ${Math.round(9 * dpr)}px ${fam}`;
          g.fillText("TERMINAL", logoRight, Math.round(HDR / 2 + 6 * dpr));
          // symbol + tf (right of logo) — full timestamp right-aligned
          const symX = logoRight + g.measureText("MASTERMIND").width + Math.round(18 * dpr);
          g.fillStyle = text;
          g.font = `700 ${Math.round(13 * dpr)}px ${fam}`;
          g.textBaseline = "middle";
          g.fillText(symbol, symX, Math.round(HDR / 2 - 4 * dpr));
          const symW2 = g.measureText(symbol).width;
          g.fillStyle = mut;
          g.font = `500 ${Math.round(10 * dpr)}px ${fam}`;
          g.fillText(`  ${tf}`, symX + symW2, Math.round(HDR / 2 - 4 * dpr));
          // full timestamp in viewer's local timezone
          const now = new Date();
          const tzOffset = -now.getTimezoneOffset() / 60;
          const tzSign = tzOffset >= 0 ? "+" : "-";
          const tzStr = `UTC${tzSign}${Math.abs(tzOffset)}`;
          const pad2 = (n: number) => String(n).padStart(2, "0");
          const tsStr = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())} ${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())} ${tzStr}`;
          g.textAlign = "right";
          g.fillStyle = mut;
          g.font = `400 ${Math.round(9 * dpr)}px ${fam}`;
          g.fillText(tsStr, out.width - pad, Math.round(HDR / 2 + 4 * dpr));
          // ── per-pane indicator labels (top-left of each pane, matching live view) ──
          // paneLayoutRef holds CSS-pixel positions; we convert to output-px using dpr (TARGET_SCALE),
          // not realScale — so label positions align with the upscaled chart raster.
          const pLayout = paneLayoutRef.current;
          if (pLayout.length) {
            g.textAlign = "left"; g.textBaseline = "top";
            for (const pane of pLayout) {
              const visEntries = pane.entries.filter((e) => !e.hidden);
              if (!visEntries.length) continue;
              // pane.top is CSS-px; multiply by dpr (output scale) and offset by HDR
              const paneTopDev = Math.round(pane.top * dpr) + HDR;
              const lPad = Math.round(8 * dpr);
              const lTop = paneTopDev + Math.round(8 * dpr);
              let lY = lTop;
              const lineH = Math.round(14 * dpr);
              for (const entry of visEntries) {
                let lbl = entry.label.trim();
                if (!lbl) continue;
                // color swatch dot
                const dot = (entry as any).color as string | undefined;
                if (dot) {
                  g.fillStyle = dot;
                  g.beginPath(); g.arc(lPad + Math.round(4 * dpr), lY + Math.round(5 * dpr), Math.round(3.5 * dpr), 0, 2 * Math.PI); g.fill();
                  g.font = `600 ${Math.round(9.5 * dpr)}px ${fam}`;
                  g.fillStyle = text;
                  g.fillText(lbl, lPad + Math.round(11 * dpr), lY);
                } else {
                  g.font = `600 ${Math.round(9.5 * dpr)}px ${fam}`;
                  const lw = g.measureText(lbl).width;
                  g.fillStyle = "rgba(10,11,14,0.55)";
                  g.fillRect(lPad - Math.round(2 * dpr), lY - Math.round(1 * dpr), lw + Math.round(6 * dpr), lineH - Math.round(2 * dpr));
                  g.fillStyle = brand2;
                  g.fillText(lbl, lPad, lY);
                }
                lY += lineH;
              }
            }
          }
          const date = `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}`;
          const fname = `${symbol}_${tf}_${date}.png`;
          const statusFeedback = (msg: string) => {
            const sEl = statusRef.current;
            if (sEl) { const prev = sEl.innerHTML; sEl.innerHTML = `<b class="up">${msg}</b>`; setTimeout(() => { if (statusRef.current === sEl) paintStatus(barsRef.current, sliceRef.current); else sEl.innerHTML = prev; }, 2500); }
          };
          const blob: Blob | null = await new Promise((res) => out.toBlob(res, "image/png"));
          if (!blob) return;
          if (action === "download") {
            const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = fname; a.click();
            try { URL.revokeObjectURL(a.href); } catch {}
            statusFeedback("Snapshot downloaded");
          } else if (action === "copy") {
            try { await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]); statusFeedback("Snapshot copied to clipboard"); }
            catch { statusFeedback("Clipboard copy failed (needs HTTPS/focus)"); }
          } else if (action === "share") {
            // Upload to R2 via /api/snapshot, copy the share URL
            try {
              const form = new FormData(); form.append("file", blob, fname);
              const r = await fetch("/api/snapshot", { method: "POST", body: form });
              if (!r.ok) { const e = await r.json().catch(() => ({})); statusFeedback(e.error || "Upload failed"); return; }
              const { url } = await r.json();
              const abs = `${window.location.origin}${url}`;
              try { await navigator.clipboard.writeText(abs); statusFeedback("Link copied to clipboard"); }
              catch { statusFeedback(`Share link: ${abs}`); }
            } catch { statusFeedback("Upload failed"); }
          } else if (action === "tab") {
            const url = URL.createObjectURL(blob);
            window.open(url, "_blank");
            setTimeout(() => { try { URL.revokeObjectURL(url); } catch {} }, 60_000);
          }
        } catch {}
      })();
    };
    window.addEventListener("mm:snapshot", snapshot);

    // ── create the ONE chart (the hard invariant: exactly one createChart in this file) ──
    cpMark(`chart-create[${symbol}]`);
    tokensRef.current = readTokens();
    const t = tokensRef.current;
    const chart = createChart(el, {
      width: el.clientWidth || 900, height: el.clientHeight || 600,
      layout: { background: { color: "transparent" }, textColor: t.mut, fontSize: 11, attributionLogo: false, panes: { separatorColor: css("--pane-sep"), separatorHoverColor: css("--pane-sep-h") } },
      grid: { vertLines: { color: t.grid }, horzLines: { color: t.grid } },
      crosshair: { mode: CrosshairMode.Normal, vertLine: { color: "rgba(214,218,227,.32)", width: 1, labelBackgroundColor: t.p3 }, horzLine: { color: "rgba(214,218,227,.32)", width: 1, labelBackgroundColor: t.p3 } },
      rightPriceScale: { borderColor: t.line, scaleMargins: { top: 0.1, bottom: 0.08 } },
      timeScale: { borderColor: t.line, rightOffset: 6, barSpacing: 8 },
    });
    chartRef.current = chart;

    // ── v5 text watermark (createTextWatermark plugin — chart.applyOptions({ watermark }) removed in v5) ──
    // Created once on mount; Effect 7 toggles visibility via applyOptions on the plugin instance.
    try {
      const pane = chart.panes()[0];
      if (pane) {
        const wm = createTextWatermark(pane, {
          visible: true,
          horzAlign: "center",
          vertAlign: "center",
          lines: [{ text: "Mastermind Terminal", color: "rgba(214,218,227,0.04)", fontSize: 48, fontStyle: "bold", fontFamily: "var(--font-ui, system-ui, sans-serif)" }],
        });
        watermarkPluginRef.current = wm;
      }
    } catch {}

    const wrap = el.parentElement as HTMLElement;
    wrapElRef.current = wrap;
    // indicator SVG overlay layer (z-index 2, below signals and drawings)
    const indSvg = mk("svg", { style: "position:absolute;inset:0;width:100%;height:100%;z-index:2;pointer-events:none" }) as SVGSVGElement;
    wrap.appendChild(indSvg); indSvgRef.current = indSvg;
    // signal-marker layer (below the user-drawing layer); custom TradingView-style badges
    const sigSvg = mk("svg", { style: "position:absolute;inset:0;width:100%;height:100%;z-index:3;pointer-events:none" }) as SVGSVGElement;
    wrap.appendChild(sigSvg); sigRef.current = sigSvg;
    const svg = mk("svg", { style: "position:absolute;inset:0;width:100%;height:100%;z-index:4;pointer-events:none" }) as SVGSVGElement;
    wrap.appendChild(svg); svgRef.current = svg;

    // ── last-price tag (symbol · price · bar-close countdown) on the right axis ──
    // Replaces lightweight-charts' built-in last-value label (disabled on the price series). The
    // countdown differs per timeframe: exact for intraday, calendar-boundary for daily+ (see periodCloseTs).
    const priceTag = document.createElement("div");
    priceTag.style.cssText = "position:absolute;z-index:5;right:1px;display:none;flex-direction:row;align-items:center;gap:2px;pointer-events:none;transform:translateY(-50%);white-space:nowrap";
    const tagSym = document.createElement("div");
    tagSym.style.cssText = "padding:2px 5px;border-radius:3px;color:#fff;font:700 10px/1 var(--font-num);letter-spacing:.02em";
    const tagVal = document.createElement("div");
    tagVal.style.cssText = "display:flex;flex-direction:column;align-items:flex-end;padding:2px 6px;border-radius:3px;color:#fff;text-align:right";
    const tagPrice = document.createElement("div");
    tagPrice.style.cssText = "font:700 11px/1.15 var(--font-num)";
    const tagCd = document.createElement("div");
    tagCd.style.cssText = "font:600 9px/1.15 var(--font-num);opacity:.85";
    tagVal.appendChild(tagPrice); tagVal.appendChild(tagCd);
    priceTag.appendChild(tagSym); priceTag.appendChild(tagVal);
    wrap.appendChild(priceTag); priceTagRef.current = priceTag;

    const renderPriceTag = () => {
      const tag = priceTagRef.current, s = priceSeriesRef.current;
      if (!tag || !s || dead) return;
      const bars = barsRef.current; const last = bars[bars.length - 1];
      if (!last) { tag.style.display = "none"; return; }
      const price = last.c;
      const y = s.priceToCoordinate(price) as number | null;
      if (y == null) { tag.style.display = "none"; return; }
      const prev = bars[bars.length - 2];
      const up = prev ? price >= prev.c : price >= last.o;
      const col = up ? tokensRef.current.up : tokensRef.current.down;
      const prec = precRef.current;
      tagSym.textContent = symbolRef.current;
      tagPrice.textContent = price.toLocaleString("en-US", { minimumFractionDigits: prec, maximumFractionDigits: prec });
      let cd = "";
      if (replayIdxRef.current == null) {                     // no meaningful "time to close" while replaying history
        const nowSec = Date.now() / 1000; let rem: number | null = null;
        if (isIntradayRef.current) {
          const mins = tfMinutes(timeframeRef.current); const openTs = Number(last.time);
          if (mins > 0 && isFinite(openTs)) rem = openTs + mins * 60 - nowSec;
        } else {
          rem = periodCloseTs(timeframeRef.current, nowSec, classify(symbolRef.current)) - nowSec;
        }
        if (rem != null && isFinite(rem)) cd = fmtCountdown(rem, isIntradayRef.current);
      }
      tagCd.textContent = cd; tagCd.style.display = cd ? "block" : "none";
      tagSym.style.background = col; tagVal.style.background = col;
      tag.style.top = Math.round(y) + "px"; tag.style.display = lastValueVisibleRef.current ? "flex" : "none";
    };
    renderTagRef.current = renderPriceTag;
    tagTimerRef.current = window.setInterval(() => { if (!dead) renderPriceTag(); }, 1000);

    // ── coordinate helpers (read *Ref.current so they stay valid across reloads) ──
    const dcol = (d: Drawing) => d.color?.startsWith("var(") ? css(d.color.slice(4, -1)) : (d.color || tokensRef.current.brand2);
    const snapT = (tm: string) => { const b = barsRef.current; if (!b.length) return tm; for (let k = 0; k < b.length; k++) if (b[k].time === tm) return tm; const x = +new Date(tm + "T00:00:00Z"); let best = b[0].time, bd = Infinity; for (const r of b) { const dd = Math.abs(+new Date(r.time + "T00:00:00Z") - x); if (dd < bd) { bd = dd; best = r.time; } } return best; };
    const xOf = (tm: string) => chart.timeScale().timeToCoordinate(snapT(tm) as any) as number | null;
    const yOf = (p: number) => { const s = priceSeriesRef.current; return s ? (s.priceToCoordinate(p) as number | null) : null; };
    const barIndex = (tm: string) => { const tt = snapT(tm); const b = barsRef.current; for (let k = 0; k < b.length; k++) if (b[k].time === tt) return k; return -1; };

    // ── signal badges: BUY/SELL (★) + RE-BUY pill; GC v2 keeper quality/tier styling + CUT caution ──
    const renderSignals = () => {
      const layer = sigRef.current; if (!layer) return; const t2 = tokensRef.current;
      const SIGCFG: Record<string, { dir: "up" | "down"; fill: string; tc: string; txt: string; star?: boolean }> = {
        BUY:   { dir: "up",   fill: t2.buy,    tc: "#fff",     txt: "★",      star: true },
        SELL:  { dir: "down", fill: t2.sell,   tc: "#fff",     txt: "★",      star: true },
        REBUY: { dir: "up",   fill: "#b6e94a", tc: "#16310a",  txt: "RE-BUY" },
        CUT:   { dir: "down", fill: "#ff8a3d", tc: "#2a1400",  txt: "CUT" },
      };
      // GC v2 tier → marker badge glyph (aplus="A+", quality="Q", base/none → no badge).
      const tierBadge = (tier?: string | null) => (tier === "aplus" ? "A+" : tier === "quality" ? "Q" : "");
      const SLATE = "#7c8aa0";   // regime_blocked dim slate (no matching CSS token — inline hex)
      while (layer.firstChild) layer.removeChild(layer.firstChild);

      // ── Gaps & Demand premade indicator ──────────────────────────────────────────
      // Independent of the oracle (drawn BEFORE the oracle gate below). A TRUE 1-bar gap — an
      // unfilled break where today's whole range clears yesterday's — is what shows on the chart as a
      // visible gap, so we mark those (not every up/down open): gap up (low > prevHigh) → yellow ▲ in
      // the empty space below the bar; gap down (high < prevLow) → red ▼ above. `minGapPct` filters by
      // gap size (0 = every gap). A centered pivot-low "demand" spot → green ○ below. Pure from barsRef
      // (respects replay + visible range); on the Daily timeframe this is literal 1-day gapping.
      if (indicatorsRef.current.has("gaps") && !hiddenRef.current.has("gaps") && tfVisible("gaps")) {
        const gp = P("gaps"); const gbars = barsRef.current;
        const thr = Math.max(0, gp.minGapPct ?? 0) / 100;
        const k = Math.max(1, Math.round(gp.demandStrength ?? 5));
        for (let i = 0; i < gbars.length; i++) {
          const b = gbars[i]; const x = xOf(b.time); if (x == null) continue;
          if (gp.showGaps !== false && i > 0) {
            const pb = gbars[i - 1];
            if (pb.h > 0 && b.l > pb.h && (b.l - pb.h) / pb.h >= thr) {
              const y = yOf(b.l);   // gap up: unfilled space sits below the bar's low
              if (y != null) { const g = mk("g", { opacity: 0.95 }); g.appendChild(mk("path", { d: `M${x - 4.5} ${y + 13} L${x + 4.5} ${y + 13} L${x} ${y + 5} Z`, fill: gp.gapUpCol })); layer.appendChild(g); }
            } else if (pb.l > 0 && b.h < pb.l && (pb.l - b.h) / pb.l >= thr) {
              const y = yOf(b.h);   // gap down: unfilled space sits above the bar's high
              if (y != null) { const g = mk("g", { opacity: 0.95 }); g.appendChild(mk("path", { d: `M${x - 4.5} ${y - 13} L${x + 4.5} ${y - 13} L${x} ${y - 5} Z`, fill: gp.gapDownCol })); layer.appendChild(g); }
            }
          }
          // demand = centered pivot low: b.l strictly below every neighbor within ±k bars
          if (gp.showDemand !== false && i >= k && i < gbars.length - k) {
            let piv = true;
            for (let j = i - k; j <= i + k; j++) { if (j !== i && gbars[j].l <= b.l) { piv = false; break; } }
            if (piv) { const y = yOf(b.l); if (y != null) { const g = mk("g", { opacity: 0.95 }); g.appendChild(mk("circle", { cx: x, cy: y + 20, r: 3.4, fill: "none", stroke: gp.demandCol, "stroke-width": 1.6 })); layer.appendChild(g); } }
          }
        }
      }

      // Golden Oracle Confluence is a toggleable/removable study: skip ALL signal draws (marks + side
      // channels) when it's removed from the indicator set or hidden via the legend eye.
      if (!indicatorsRef.current.has("_oracle") || hiddenRef.current.has("_oracle")) return;

      // GC v2: fast-reversal CUT is a caution, NOT an exit — render a small orange "•caution" dot below
      // the bar instead of the old down-pointing CUT pill (the ✕/exit look). Everything else keeps the pill.
      for (const m of sigMarksRef.current) {
        if (m.type === "CUT") {
          const x = xOf(m.t), y = yOf(m.price); if (x == null || y == null) continue;
          const cy = y + 16;
          const g = mk("g", { opacity: 0.9 });
          g.appendChild(mk("circle", { cx: x, cy, r: 3.4, fill: "#ff8a3d" }));
          const tEl = mk("text", { x: x + 6, y: cy + 3, fill: "#ff8a3d", "font-size": 8.5, "font-weight": 700, "text-anchor": "start", "font-family": "var(--font-ui)", "letter-spacing": ".02em" });
          tEl.textContent = "caution";
          g.appendChild(tEl);
          layer.appendChild(g);
          continue;
        }
        const cfg = SIGCFG[m.type]; if (!cfg) continue;
        const x = xOf(m.t), y = yOf(m.price); if (x == null || y == null) continue;
        const star = !!cfg.star;
        // GC v2 quality on BUY|REBUY: take=solid, block=hollow outline, pending=dim gray, regime_blocked=dim slate.
        // (This SVG overlay has full shape control — the prompt's "○ glyph" fallback for shape-limited
        //  lightweight-charts markers is unnecessary here; we draw a true hollow badge for `block`.)
        const q = (m.type === "BUY" || m.type === "REBUY") ? m.quality : undefined;
        const hollow = q === "block";
        const dim = q === "pending" || q === "regime_blocked";
        const fill = q === "regime_blocked" ? SLATE : (q === "pending" ? t2.mut : cfg.fill);
        const groupOp = dim ? 0.5 : 0.97;
        // tier badge is appended to the marker text for taken entries (take/undefined); suppressed on blocked/pending.
        // tier badge ("A+"/"Q") shown only for TAKEN entries (take / ungraded v1); suppressed on block/pending/regime_blocked.
        const badge = (m.type === "BUY" || m.type === "REBUY") && (q === "take" || q == null) ? tierBadge(m.tier) : "";
        const w = star ? 19 : Math.max(20, 9 + cfg.txt.length * 7), h = 15, r = 4, ptr = 5, gap = 9;
        const up = cfg.dir === "up";
        const top = up ? y + gap + ptr : y - gap - ptr - h;
        const g = mk("g", { opacity: groupOp });
        // R14 jump pulse: an expanding ring behind the marker (transient highlight flag, ~2.5s)
        if ((m as any).highlight) {
          const ring = mk("circle", { cx: x, cy: top + h / 2, r: w, fill: "none", stroke: fill, "stroke-width": 2, opacity: 0.9 });
          ring.appendChild(mk("animate", { attributeName: "r", values: `${w};${w * 2.4}`, dur: "0.9s", repeatCount: "indefinite" }));
          ring.appendChild(mk("animate", { attributeName: "opacity", values: "0.9;0", dur: "0.9s", repeatCount: "indefinite" }));
          g.appendChild(ring);
        }
        // block → hollow (fill:none + colored stroke); take/pending/regime_blocked → solid (possibly dimmed) fill.
        g.appendChild(mk("rect", { x: x - w / 2, y: top, width: w, height: h, rx: r, ry: r, fill: hollow ? "none" : fill, stroke: hollow ? fill : "none", "stroke-width": hollow ? 1.4 : 0 }));
        g.appendChild(mk("path", { d: up ? `M${x - ptr} ${top} L${x + ptr} ${top} L${x} ${top - ptr} Z` : `M${x - ptr} ${top + h} L${x + ptr} ${top + h} L${x} ${top + h + ptr} Z`, fill: hollow ? "none" : fill, stroke: hollow ? fill : "none", "stroke-width": hollow ? 1.4 : 0 }));
        const tEl = mk("text", { x, y: top + h / 2 + (star ? 4.3 : 3.4), fill: hollow ? fill : cfg.tc, "font-size": star ? 11.5 : 9, "font-weight": 800, "text-anchor": "middle", "font-family": star ? "Georgia,serif" : "var(--font-ui)", "letter-spacing": star ? "0" : ".02em" });
        tEl.textContent = cfg.txt;
        g.appendChild(tEl);
        // tier badge ("A+"/"Q") as a small superscript pill to the top-right of the marker (taken entries only).
        if (badge) {
          const bx = x + w / 2 + 1, by = top - 1;
          g.appendChild(mk("rect", { x: bx, y: by, width: badge.length * 6 + 4, height: 10, rx: 2, ry: 2, fill: fill, opacity: 0.92 }));
          const bEl = mk("text", { x: bx + (badge.length * 6 + 4) / 2, y: by + 8, fill: "#0b1220", "font-size": 7.5, "font-weight": 800, "text-anchor": "middle", "font-family": "var(--font-ui)" });
          bEl.textContent = badge;
          g.appendChild(bEl);
        }
        layer.appendChild(g);
      }

      // ── GC v2 side channels (toggleable via the "Signals detail" chip) ──
      if (showDetailRef.current) {
        // early_dots: faint small dot BELOW the bar (anticipation pre-cross) — distinct from the BUY ▲.
        for (const d of earlyDotsRef.current) {
          const x = xOf(d.t); if (x == null) continue;
          const b = barsRef.current[barIndex(d.t)];
          const y = b ? yOf(b.l) : null; if (y == null) continue;
          const g = mk("g", { opacity: 0.55 });
          g.appendChild(mk("circle", { cx: x, cy: y + 9, r: 2.2, fill: t2.mut }));
          layer.appendChild(g);
        }
        // warnings: ⚠ (arm) / ⛔ (confirm) small glyphs ABOVE the bar (structure-break anticipation).
        for (const w of warnMarksRef.current) {
          const x = xOf(w.t); if (x == null) continue;
          const b = barsRef.current[barIndex(w.t)];
          const y = b ? yOf(b.h) : null; if (y == null) continue;
          const g = mk("g", { opacity: 0.85 });
          const tEl = mk("text", { x, y: y - 8, "font-size": 11, "text-anchor": "middle", "font-family": "var(--font-ui)" });
          tEl.textContent = w.kind === "confirm" ? "⛔" : "⚠";
          g.appendChild(tEl);
          layer.appendChild(g);
        }
      }
    };
    renderSignalsRef.current = renderSignals;

    const snap = (px: number, py: number) => {
      const prec = precRef.current; const bars = barsRef.current; let bt = bars[bars.length - 1]?.time, bd = 1e18;
      for (const b of bars) { const xc = xOf(b.time); if (xc == null) continue; const dd = Math.abs(xc - px); if (dd < bd) { bd = dd; bt = b.time; } }
      const ps = priceSeriesRef.current; let p = ps ? (ps.coordinateToPrice(py) as number | null) : null; if (p == null) p = bars[bars.length - 1]?.c ?? 0;
      if (magnetRef.current) { const bar = bars[barIndex(bt!)]; if (bar) { const cand = [bar.o, bar.h, bar.l, bar.c]; p = cand.reduce((a, v) => Math.abs(v - (p as number)) < Math.abs(a - (p as number)) ? v : a, cand[0]); } }
      return { t: bt, p: +(p as number).toFixed(prec) } as { t: string; p: number };
    };
    let pending: { kind: string; a: { t: string; p: number } } | null = null;
    let sel: string | null = null;

    function shape(d: Drawing, preview = false) {
      const prec = precRef.current;
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
    const bar = document.createElement("div"); bar.className = "draw-bar"; bar.style.display = "none"; wrap.appendChild(bar); barRef.current = bar;
    const COLORS = ["#4d82ff", "#26c281", "#f0566b", "#e8b339", "#d6dae3"];
    const styled = new Set(["trendline", "ray", "vline", "hline", "arrow", "rect"]);
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
    // inline, editable text box — type directly on the chart
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
    // right-click context menu (D1 — TV-style, rebuilt on every open to reflect current state)
    const ctxm = document.createElement("div"); ctxm.className = "ctx-menu"; ctxm.style.display = "none"; wrap.appendChild(ctxm); ctxRef.current = ctxm;
    let ctxPt: { t: string; p: number } = { t: "", p: 0 };
    const hideCtx = () => { if (ctxRef.current) ctxRef.current.style.display = "none"; };
    // submenu state for Chart template
    let tmSubOpen = false;
    const buildCtxMenu = () => {
      const sym = symbolRef.current;
      const prec = precRef.current;
      const px = ctxPt.p;
      const pxLabel = px ? px.toFixed(prec) : "—";
      const locked = !!lockedVLineRef.current;
      // count visible (non-hidden) indicators from panesMeta
      const indCount = panesMeta.current.reduce((n, m) => n + m.entries.filter((e) => !hiddenRef.current.has(e.key)).length, 0);
      const hasInds = indCount > 0;
      ctxm.innerHTML = `
        <div data-a="reset" class="ctx-row ctx-icon-row"><span class="ctx-ico">↺</span>${escH("Reset chart view")}<span class="ctx-kbd">⌥R</span></div>
        <div class="sep"></div>
        <div data-a="copypx" class="ctx-row">${escH("Copy price")} <b>${pxLabel}</b></div>
        <div data-a="paste" class="ctx-row ctx-dis" title="Paste">${escH("Paste")}<span class="ctx-kbd">⌘V</span></div>
        <div class="sep"></div>
        <div data-a="alert" class="ctx-row">${escH("Add alert on ")} <b>${escH(sym)}</b> ${escH("at ")} ${pxLabel}…<span class="ctx-kbd">⌥A</span></div>
        <div class="sep"></div>
        <div data-a="lockv" class="ctx-row${locked ? " ctx-checked" : ""}">${locked ? "✓ " : ""}${escH("Lock vertical cursor line by time")}</div>
        <div class="sep"></div>
        <div data-a="tableview" class="ctx-row">${escH("Table view")}</div>
        <div data-a="objtree" class="ctx-row">${escH("Object tree")}</div>
        <div data-a="tplmenu" class="ctx-row ctx-has-sub">${escH("Chart template")} <span style="margin-left:auto;opacity:.6">▸</span></div>
        <div class="sep"></div>
        ${hasInds ? `<div data-a="removeinds" class="ctx-row ctx-danger">${escH("Remove ")} ${indCount} ${escH("indicator")}${indCount !== 1 ? "s" : ""}</div>` : ""}
        <div data-a="settings" class="ctx-row ctx-icon-row"><span class="ctx-ico">⚙</span>${escH("Settings…")}</div>
      `.trim();
    };
    onCtx = (e: MouseEvent) => {
      e.preventDefault();
      const r = wrap.getBoundingClientRect(); const x = e.clientX - r.left, y = e.clientY - r.top;
      ctxPt = snap(x, y);
      buildCtxMenu();
      const mw = 220, mh = 340;
      ctxm.style.left = Math.min(x, el!.clientWidth - mw) + "px";
      ctxm.style.top = Math.min(y, el!.clientHeight - mh) + "px";
      ctxm.style.display = "block";
      tmSubOpen = false;
    };
    ctxm.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      const tgt = e.target as HTMLElement;
      const row = tgt.closest("[data-a]") as HTMLElement | null;
      const a = row?.getAttribute("data-a") ?? null;
      if (a === "tplmenu") {
        // open template submenu inline (append rows)
        if (tmSubOpen) return;
        tmSubOpen = true;
        try {
          const tmpl = listTemplates();
          let subHtml = `<div class="sep"></div><div class="ctx-grp">${escH("Chart templates")}</div>`;
          for (const tpl of tmpl) {
            subHtml += `<div data-a="tpl:${escH(tpl.id)}" class="ctx-row ctx-sub">${escH(tpl.name)}</div>`;
          }
          subHtml += `<div data-a="savetemplate" class="ctx-row ctx-sub">${escH("Save as template…")}</div>`;
          ctxm.insertAdjacentHTML("beforeend", subHtml);
        } catch {}
        return;
      }
      hideCtx();
      if (!a) return;
      if (a === "reset") { try { chart.timeScale().fitContent(); } catch {} }
      else if (a === "copypx") { try { navigator.clipboard.writeText(String(ctxPt.p)); } catch {} }
      else if (a === "alert") { onAddAlertRef.current?.(ctxPt.p); }
      else if (a === "lockv") {
        const newTime = lockedVLineRef.current === ctxPt.t ? null : ctxPt.t;
        onSetLockedVLineRef.current?.(newTime);
      }
      else if (a === "tableview") { onTableViewRef.current?.(); }
      else if (a === "objtree") { onObjectTreeRef.current?.(); }
      else if (a === "settings") { onOpenSettingsModalRef.current?.(); }
      else if (a === "removeinds") {
        // remove all active indicators via custom event (TerminalShell handles)
        const cnt = panesMeta.current.reduce((n, m) => n + m.entries.filter((en) => !hiddenRef.current.has(en.key)).length, 0);
        window.dispatchEvent(new CustomEvent("mm:remove-all-inds", { detail: { count: cnt } }));
      }
      else if (a && a.startsWith("tpl:")) {
        const id = a.slice(4);
        window.dispatchEvent(new CustomEvent("mm:apply-template", { detail: { id } }));
      }
      else if (a === "savetemplate") {
        window.dispatchEvent(new CustomEvent("mm:save-template", {}));
      }
    });
    wrap.addEventListener("contextmenu", onCtx);

    // ── intraday dead-end empty-state: a centered card with a "Back to Daily" button. Shown when the
    //    intraday branch has no bars (feed unavailable OR genuinely empty); a click dispatches
    //    `mm:set-tf` (TerminalShell owns the listener → setTf on the active pane). Kept out of the CSS
    //    files (styling is inline) so it lives entirely in this component. ──
    const empty = document.createElement("div"); empty.className = "chart-empty"; empty.style.cssText = "position:absolute;inset:0;z-index:6;display:none;flex-direction:column;align-items:center;justify-content:center;gap:12px;text-align:center;padding:24px;pointer-events:auto";
    empty.innerHTML = `<div class="ce-msg" style="color:var(--text-2);font-size:13px;max-width:320px;line-height:1.5"></div><button class="ce-btn" style="cursor:pointer;font:600 12px var(--font-ui),system-ui;color:var(--text);background:var(--panel-2);border:1px solid var(--line-3);border-radius:6px;padding:7px 14px">Back to Daily</button>`;
    wrap.appendChild(empty); emptyRef.current = empty;
    empty.querySelector(".ce-btn")!.addEventListener("pointerdown", (e) => { e.stopPropagation(); window.dispatchEvent(new CustomEvent("mm:set-tf", { detail: { tf: "D" } })); });
    showEmptyRef.current = (msg: string) => { const e2 = emptyRef.current; if (!e2) return; const m = e2.querySelector(".ce-msg"); if (m) m.textContent = msg; e2.style.display = "flex"; };
    hideEmptyRef.current = () => { const e2 = emptyRef.current; if (e2) e2.style.display = "none"; };

    winDown = (e: PointerEvent) => { hideCtx(); if (!toolRef.current && sel) { const tg = e.target as Element; if (tg && !tg.closest?.("g[data-id]") && !tg.closest?.(".draw-bar") && !tg.closest?.(".text-edit")) { sel = null; renderDraw(); } } };
    window.addEventListener("pointerdown", winDown);
    // ── Indicator SVG overlay renderer (ichimoku cloud, ribbon fill, vprofile, volbox) ──
    const renderIndOverlays = () => {
      const svgEl = indSvgRef.current; if (!svgEl) return;
      while (svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);
      const inds = indicatorsRef.current;
      const W = el!.clientWidth, H = el!.clientHeight;
      const priceS = priceSeriesRef.current;
      if (!priceS) return;
      const p2y = (p: number): number | null => { try { const v = priceS.priceToCoordinate(p); return (v == null || !isFinite(v as number)) ? null : v as number; } catch { return null; } };
      const t2x = (tm: string | number): number | null => { try { const v = chart.timeScale().timeToCoordinate(tm as any); return (v == null || !isFinite(v as number)) ? null : v as number; } catch { return null; } };

      // ── Ichimoku cloud fill ──
      if (inds.has("ichimoku") && !hiddenRef.current.has("ichimoku")) {
        const data = indOverlayRef.current["ichimoku"];
        if (data) {
          const { ich } = data as { ich: ReturnType<typeof ichimoku> };
          const times = ich.futureTimes;
          const aVals = ich.spanA, bVals = ich.spanB;
          // Build pairs of points where both span A and B are valid
          const pts: { x: number; yA: number; yB: number }[] = [];
          for (let i = 0; i < times.length; i++) {
            const a = aVals[i], b = bVals[i]; if (a == null || b == null) continue;
            const x = t2x(times[i]); if (x == null || x < -100 || x > W + 100) continue;
            const yA = p2y(a), yB = p2y(b); if (yA == null || yB == null) continue;
            pts.push({ x, yA, yB });
          }
          if (pts.length >= 2) {
            // Draw two polygons: one for where spanA > spanB (green), one for spanA < spanB (red)
            // Approach: walk forward along spanA top, then backward along spanB — split at crossovers
            const greenPts: string[] = [], redPts: string[] = [];
            // Simple approach: draw rectangle per segment
            for (let i = 0; i < pts.length - 1; i++) {
              const p0 = pts[i], p1 = pts[i + 1];
              const avgA = (p0.yA + p1.yA) / 2, avgB = (p0.yB + p1.yB) / 2;
              const isGreen = avgA <= avgB; // yA < yB means spanA price > spanB price (higher price = lower y)
              const poly = mk("polygon", {
                points: `${p0.x},${p0.yA} ${p1.x},${p1.yA} ${p1.x},${p1.yB} ${p0.x},${p0.yB}`,
                fill: isGreen ? "rgba(38,194,129,0.18)" : "rgba(240,86,107,0.18)",
                stroke: "none",
              });
              svgEl.appendChild(poly);
            }
          }
        }
      }

      // ── Trend Ribbon fill between fast and slow EMA ──
      if (inds.has("ribbon") && !hiddenRef.current.has("ribbon")) {
        const data = indOverlayRef.current["ribbon"];
        if (data) {
          const { rb, rows: rbRows } = data as { rb: ReturnType<typeof trendRibbon>; rows: Bar[] };
          const pts: { x: number; yF: number; yS: number; state: string }[] = [];
          for (let i = 0; i < rbRows.length; i++) {
            const f = rb.emaFast[i], s = rb.emaSlow[i]; if (f == null || s == null) continue;
            const x = t2x(rbRows[i].time); if (x == null || x < -50 || x > W + 50) continue;
            const yF = p2y(f), yS = p2y(s); if (yF == null || yS == null) continue;
            pts.push({ x, yF, yS, state: rb.state[i] });
          }
          for (let i = 0; i < pts.length - 1; i++) {
            const p0 = pts[i], p1 = pts[i + 1];
            const fill = p0.state === "ribbonUp" ? "rgba(38,194,129,0.12)" : p0.state === "ribbonDown" ? "rgba(240,86,107,0.12)" : "rgba(139,147,163,0.07)";
            svgEl.appendChild(mk("polygon", {
              points: `${p0.x},${p0.yF} ${p1.x},${p1.yF} ${p1.x},${p1.yS} ${p0.x},${p0.yS}`,
              fill, stroke: "none",
            }));
          }
        }
      }

      // ── Volume Profile right-anchored bars ──
      if (inds.has("vprofile") && !hiddenRef.current.has("vprofile")) {
        const data = indOverlayRef.current["vprofile"];
        if (data) {
          const { vp } = data as { vp: ReturnType<typeof vprofile> };
          if (vp.bins.length) {
            const p = indParamsRef.current["vprofile"] ? { ...IND_DEFS.vprofile.defaults, ...indParamsRef.current["vprofile"] } : IND_DEFS.vprofile.defaults;
            const maxVol = Math.max(...vp.bins.map((b) => b.volume));
            if (maxVol > 0) {
              const maxBarW = W * (p.widthFrac ?? 0.18);
              const pocY = p2y(vp.poc);
              const vahY = p2y(vp.vah);
              const valY = p2y(vp.val);
              for (const bin of vp.bins) {
                const yHi = p2y(bin.priceHi), yLo = p2y(bin.priceLo);
                if (yHi == null || yLo == null) continue;
                const barW = (bin.volume / maxVol) * maxBarW;
                const isPoc = Math.abs(bin.priceMid - vp.poc) < (vp.bins[0]?.priceHi - vp.bins[0]?.priceLo) * 0.6;
                const barH = Math.max(1, Math.abs(yLo - yHi));
                const barY = Math.min(yHi, yLo);
                svgEl.appendChild(mk("rect", {
                  x: W - barW, y: barY, width: barW, height: barH,
                  fill: isPoc ? "rgba(232,179,57,0.55)" : "rgba(77,130,255,0.25)",
                  stroke: "none",
                }));
              }
              // POC gold price line
              if (pocY != null) svgEl.appendChild(mk("line", { x1: W - maxBarW, y1: pocY, x2: W, y2: pocY, stroke: "#e8b339", "stroke-width": 1.5, "stroke-dasharray": "" }));
              // VAH/VAL dashed
              if (vahY != null) svgEl.appendChild(mk("line", { x1: W - maxBarW, y1: vahY, x2: W, y2: vahY, stroke: "rgba(214,218,227,0.5)", "stroke-width": 1, "stroke-dasharray": "4 3" }));
              if (valY != null) svgEl.appendChild(mk("line", { x1: W - maxBarW, y1: valY, x2: W, y2: valY, stroke: "rgba(214,218,227,0.5)", "stroke-width": 1, "stroke-dasharray": "4 3" }));
            }
          }
        }
      }

      // ── Volatility Box ──
      if (inds.has("volbox") && !hiddenRef.current.has("volbox")) {
        const data = indOverlayRef.current["volbox"];
        if (data) {
          const { vb, rows: vbRows } = data as { vb: ReturnType<typeof volbox>; rows: Bar[] };
          if (vb.squeezeStart != null && vb.boxHi > 0) {
            const startIdx = vb.squeezeStart;
            const endIdx = vb.resolutionIdx ?? (vbRows.length - 1);
            const startTime = vbRows[startIdx]?.time, endTime = vbRows[endIdx]?.time;
            if (startTime && endTime) {
              const x1 = t2x(startTime), x2 = t2x(endTime);
              const yHi = p2y(vb.boxHi), yLo = p2y(vb.boxLo);
              if (x1 != null && x2 != null && yHi != null && yLo != null) {
                const rx1 = Math.min(x1, x2), rx2 = Math.max(x1, x2);
                // Shaded rect
                svgEl.appendChild(mk("rect", { x: rx1, y: yHi, width: rx2 - rx1, height: yLo - yHi, fill: "rgba(232,179,57,0.09)", stroke: "#e8a33d", "stroke-width": 1, "stroke-dasharray": "" }));
                // Top/bottom rails
                svgEl.appendChild(mk("line", { x1: rx1, y1: yHi, x2: rx2, y2: yHi, stroke: "#e8a33d", "stroke-width": 1.5 }));
                svgEl.appendChild(mk("line", { x1: rx1, y1: yLo, x2: rx2, y2: yLo, stroke: "#e8a33d", "stroke-width": 1.5 }));
                // Resolution marker
                if (vb.resolution != null && vb.resolutionIdx != null) {
                  const rx = t2x(vbRows[vb.resolutionIdx].time);
                  if (rx != null) {
                    const ry = vb.resolution === "up" ? yHi - 12 : yLo + 12;
                    const txt = mk("text", { x: rx, y: ry, fill: "#e8a33d", "font-size": 10, "text-anchor": "middle", "font-family": "var(--font-ui)" });
                    txt.textContent = vb.resolution === "up" ? "▲" : "▼";
                    svgEl.appendChild(txt);
                  }
                }
              }
            }
          }
        }
      }
    };

    const renderDraw = () => {
      const svgEl = svgRef.current; if (!svgEl) return;
      renderIndOverlays();
      while (svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);
      for (const d of drawRef.current) svgEl.appendChild(shape(d));
      // ── D2 locked vertical line overlay ──
      const lvt = lockedVLineRef.current;
      if (lvt) {
        const lx = xOf(lvt);
        if (lx != null) {
          const H = el!.clientHeight;
          const g = mk("g", { "pointer-events": "none" });
          g.appendChild(mk("line", { x1: lx, y1: 0, x2: lx, y2: H, stroke: "var(--brand)", "stroke-width": 1.5, "stroke-dasharray": "6 4" }));
          // lock glyph at bottom near time axis
          const gy = H - 18, gx = lx - 8;
          const gb = mk("rect", { x: gx, y: gy, width: 16, height: 14, rx: 2, fill: "var(--brand)", opacity: 0.85 });
          g.appendChild(gb);
          // simple lock path (SVG only — no emoji)
          const lkG = mk("g", { transform: `translate(${lx - 4},${gy + 1})` });
          lkG.appendChild(mk("rect", { x: 1, y: 5, width: 6, height: 5, rx: 1, fill: "white" }));
          lkG.appendChild(mk("path", { d: "M2 5V3.5a2 2 0 0 1 4 0V5", stroke: "white", "stroke-width": 1.2, fill: "none" }));
          g.appendChild(lkG);
          svgEl.appendChild(g);
        }
      }
      positionBar();
      renderPriceTag();   // keep the last-price + countdown tag in step with every data/pan/style render
    };
    renderRef.current = renderDraw;
    // coalesce the overlay rebuild to one paint per frame on the hot pan/zoom path
    const scheduleRender = () => { if (rafId != null) return; rafId = requestAnimationFrame(() => { rafId = null; if (!dead) { renderSignals(); renderDraw(); } }); };
    chart.timeScale().subscribeVisibleLogicalRangeChange(scheduleRender);
    // Re-project SVG overlays on vertical price-scale drags (LWC repaints candles but not SVG;
    // crosshairMove fires on any mouse interaction including Y-axis drag — chart.remove() cleans up).
    chart.subscribeCrosshairMove(scheduleRender);
    renderSignals(); renderDraw();

    // ── pane geometry measurement → drives the legend/pane-menu overlay layer (ChartOverlays) ──
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

    // observe each pane element so separator drags / collapses reposition the overlay + rebaseline sizes.
    // scheduleRender() re-lays the signal-marker + drawing SVG overlays: a pane collapse/maximize/drag
    // changes the price pane's height (→ priceToCoordinate) WITHOUT resizing the chart container, so the
    // container `ro` below never fires — without this the BUY/SELL/CUT/REBUY badges lag at stale Y coords
    // until an unrelated pan/hover triggers a render.
    paneRO = new ResizeObserver(() => { if (dead) return; captureNormal(); scheduleMeasure(); scheduleRender(); });
    paneRORef.current = paneRO;

    const rectXY = (ev: PointerEvent) => { const r = svg.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; };
    const idAt = (ev: Event) => (ev.target as Element)?.closest?.("g[data-id]")?.getAttribute("data-id") || null;
    const TWO = new Set(["trendline", "ray", "rect", "fib", "measure", "arrow"]);
    // pre-draw style (color/width/dash) applied to each new styleable drawing; arrow keeps solid
    const STYLE_KINDS = new Set(["trendline", "ray", "arrow", "rect", "hline", "vline"]);
    const applyStyle = (kind: string): Partial<Drawing> => {
      const s = styleRef.current; if (!s || !STYLE_KINDS.has(kind)) return {};
      return { color: s.color, width: s.width, dash: kind === "arrow" ? "solid" : s.dash };
    };

    // select + drag existing drawings in cursor mode (capture phase; runs before creation)
    svg.addEventListener("pointerdown", (ev) => {
      if (toolRef.current || !activeRef.current) return; const id = idAt(ev); if (!id) { if (sel) { sel = null; renderDraw(); } return; }
      ev.stopPropagation(); sel = id; renderDraw();
      const d0 = drawRef.current.find((x) => x.id === id); if (!d0) return;
      const prec = precRef.current;
      const s0 = rectXY(ev); const start = snap(s0.x, s0.y); const orig = d0.points.map((p) => ({ ...p }));
      const move = (e: PointerEvent) => {
        const m0 = rectXY(e); const cur = snap(m0.x, m0.y); const dp = cur.p - start.p, di = barIndex(cur.t!) - barIndex(start.t!), bars = barsRef.current;
        drawRef.current = drawRef.current.map((x) => x.id !== id ? x : { ...x, points: orig.map((pt) => { const ni = Math.max(0, Math.min(bars.length - 1, barIndex(pt.t) + di)); return { t: bars[ni]?.time || pt.t, p: +(pt.p + dp).toFixed(prec) }; }) });
        renderDraw();
      };
      const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); dragCleanup = null; onChangeRef.current?.([...drawRef.current]); };
      dragCleanup = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
      window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
    }, true);

    // creation / erase (bubble; svg is pointer-events:auto only when a tool is active)
    svg.addEventListener("pointerdown", (ev) => {
      const tl = toolRef.current; if (!tl) return; const { x, y } = rectXY(ev); const a = snap(x, y);
      if (tl === "erase") { const id = idAt(ev); if (id) onChangeRef.current?.(drawRef.current.filter((d) => d.id !== id)); return; }
      if (tl === "hline") { onChangeRef.current?.([...drawRef.current, { id: uid(), kind: "hline", points: [a], ...applyStyle("hline") }]); return; }
      if (tl === "vline") { onChangeRef.current?.([...drawRef.current, { id: uid(), kind: "vline", points: [a], ...applyStyle("vline") }]); return; }
      if (tl === "text") { openTextEditor(a); return; }
      if (TWO.has(tl)) { pending = { kind: tl, a }; try { svg.setPointerCapture(ev.pointerId); } catch {} }
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
      if (Math.abs((xOf(a.t) ?? 0) - (xOf(b.t!) ?? 0)) < 3 && Math.abs((yOf(a.p) ?? 0) - (yOf(b.p) ?? 0)) < 3) { renderDraw(); return; }
      onChangeRef.current?.([...drawRef.current, { id: uid(), kind: kind as any, points: [a, b], ...applyStyle(kind) }]);
    });

    onKey = (e: KeyboardEvent) => {
      if (!activeRef.current) return;
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase(); if (tag === "input" || tag === "textarea") return;
      if (e.key === "Escape") { if (sel) { sel = null; renderDraw(); } }
      else if ((e.key === "Delete" || e.key === "Backspace") && sel) { e.preventDefault(); const s = sel; sel = null; onChangeRef.current?.(drawRef.current.filter((d) => d.id !== s)); }
      // D1 shortcuts: ⌥R = reset chart view, ⌥A = add alert at last bar close
      else if (e.altKey && e.code === "KeyR") { e.preventDefault(); try { chart.timeScale().fitContent(); } catch {} }
      else if (e.altKey && e.code === "KeyA") { e.preventDefault(); const b = barsRef.current; if (b.length) onAddAlertRef.current?.(b[b.length - 1].c); }
    };
    window.addEventListener("keydown", onKey);

    ro = new ResizeObserver(() => { const ch2 = chartRef.current; if (!ch2) return; const r = ch2.timeScale().getVisibleLogicalRange(); ch2.resize(el.clientWidth, el.clientHeight); if (r) ch2.timeScale().setVisibleLogicalRange(r); scheduleRender(); scheduleMeasure(); });
    ro.observe(el);

    // ── mount teardown (base line-416 logic + the new refs) ──
    return () => {
      dead = true; if (rafId != null) cancelAnimationFrame(rafId); if (measRaf != null) cancelAnimationFrame(measRaf);
      if (syncCleanupRef.current) { try { syncCleanupRef.current(); } catch {} syncCleanupRef.current = null; }
      if (dragCleanup) dragCleanup();
      window.removeEventListener("mm:snapshot", snapshot);
      if (onKey) window.removeEventListener("keydown", onKey);
      if (winDown) window.removeEventListener("pointerdown", winDown);
      const wEl = wrapElRef.current;
      if (onCtx && ref.current?.parentElement) ref.current.parentElement.removeEventListener("contextmenu", onCtx);
      if (wEl) { if (onPaneMove) wEl.removeEventListener("mousemove", onPaneMove); if (onPaneLeave) wEl.removeEventListener("mouseleave", onPaneLeave); if (onPaneDbl) wEl.removeEventListener("dblclick", onPaneDbl); }
      paneRO?.disconnect(); paneRORef.current = null; wrapElRef.current = null;
      ro?.disconnect();
      if (textEditRef.current) { try { textEditRef.current.remove(); } catch {} textEditRef.current = null; }
      if (ctxRef.current) { try { ctxRef.current.remove(); } catch {} ctxRef.current = null; }
      if (emptyRef.current) { try { emptyRef.current.remove(); } catch {} emptyRef.current = null; }
      if (barRef.current) { try { barRef.current.remove(); } catch {} barRef.current = null; }
      if (sigRef.current) { try { sigRef.current.remove(); } catch {} sigRef.current = null; }
      if (svgRef.current) { try { svgRef.current.remove(); } catch {} svgRef.current = null; }
      if (tagTimerRef.current != null) { clearInterval(tagTimerRef.current); tagTimerRef.current = null; }
      if (priceTagRef.current) { try { priceTagRef.current.remove(); } catch {} priceTagRef.current = null; }
      renderTagRef.current = null;
      indSeriesRef.current.clear(); cmpSeriesRef.current.clear(); paneMapRef.current.clear();
      pineSeriesRef.current.clear(); pineMarkersRef.current.clear(); pinePaneMapRef.current.clear(); pineErrRef.current.clear(); pineCacheRef.current.clear();
      priceSeriesRef.current = null; priceFamilyRef.current = null;
      watermarkPluginRef.current = null;   // plugin is attached to a pane; chart.remove() tears it down
      if (chartRef.current) { try { chartRef.current.remove(); } catch {} chartRef.current = null; }   // ONLY chart.remove() in the file
    };
  }, []); // eslint-disable-line

  // ────────────────────────────────────────────────────────────────────────────
  // EFFECT 2 — data [symbol, timeframe, chartType]. Fetch + full series + indicators + sync.
  // ────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const chart = chartRef.current; if (!chart) return;
    cpMark(`chart-effect2-start[${symbol}]`);
    const epoch = ++epochRef.current;
    let cancelled = false;
    const intraday = isIntradayTf(timeframe);
    isIntradayRef.current = intraday;
    // any in-flight pulse belongs to the prior symbol/TF — cancel it (R14 timer cleanup guard)
    if (highlightTimerRef.current) { clearTimeout(highlightTimerRef.current); highlightTimerRef.current = null; }
    (async () => {
      // ── R12 intraday branch: fetch /api/intraday DIRECTLY (no dataCache — it's no-store; a stale
      //    client cache would lag a fast session). Epoch-second axis. Skip resampleTf + date-keyed
      //    signal/compare overlays (those are "YYYY-MM-DD" keyed). Indicators are bar-agnostic → kept. ──
      if (intraday) {
        let bars: any[] = [];
        let feedErr: string | null = null;       // the route's j.error (route returns {bars:[],error} on an upstream/config failure)
        try {
          const r = await fetch(`/api/intraday?sym=${encodeURIComponent(symbol)}&tf=${encodeURIComponent(timeframe)}${extHours ? "&ext=1" : ""}`, { cache: "no-store" });
          const j = await r.json().catch(() => null);
          bars = Array.isArray(j?.bars) ? j.bars : [];
          if (!r.ok || j?.error) feedErr = String(j?.error || `HTTP ${r.status}`);
        } catch (e: any) { feedErr = e?.message || "network error"; }
        if (cancelled || epochRef.current !== epoch) return;
        sliceRef.current = null;                 // no daily slice on intraday → no sig marks
        sigMarksRef.current = [];
        earlyDotsRef.current = []; warnMarksRef.current = [];   // GC v2 side channels: daily-only too
        dailyBarsRef.current = [];               // splice is daily-only; disable it here
        if (!bars.length) {
          // Differentiate a feed/entitlement/config failure ("POLYGON_API_KEY not set", "polygon 403",
          // "unauthenticated", …) from a genuinely-empty symbol. Both dead-end the intraday chart, so
          // surface a "Back to Daily" affordance instead of a blank chart.
          const unavailable = feedErr != null;
          if (statusRef.current) statusRef.current.textContent = unavailable ? "Intraday feed unavailable." : "No intraday data for this symbol.";
          showEmptyRef.current(unavailable
            ? `Intraday feed unavailable for ${symbol} on ${timeframe}. Switch back to the daily timeframe to keep charting.`
            : `No intraday data for ${symbol} on ${timeframe}. Switch back to the daily timeframe to keep charting.`);
          return;
        }
        hideEmptyRef.current();                   // data arrived → clear any prior dead-end overlay
        chart.applyOptions({ timeScale: { timeVisible: true, secondsVisible: false } });   // HH:MM on the intraday axis (no repeated dates)
        // epoch-second Bar6 [t,o,h,l,c,v] → Bar with a NUMERIC time (lightweight-charts accepts UTCTimestamp)
        const rows: Bar[] = bars.map((b: any[]) => ({ time: b[0] as any, o: b[1], h: b[2], l: b[3], c: b[4], v: b[5] }));
        if (onMeta) onMeta({ total: rows.length });
        fullBarsRef.current = rows;
        const ri = replayIdxRef.current;
        const onChart = ri != null ? rows.slice(0, Math.max(20, ri + 1)) : rows;
        barsRef.current = onChart;
        const closes = onChart.map((r) => r.c);
        closesRef.current = closes;
        precRef.current = closes.length && closes[closes.length - 1] < 10 ? 4 : 2;
        tokensRef.current = readTokens();
        const familyOf = (ct: string) => (ct === "line" ? "line" : ct === "area" ? "area" : ct === "bars" ? "bars" : "candle");
        const wantFamily = familyOf(chartType);
        let priceS = priceSeriesRef.current;
        if (!priceS || priceFamilyRef.current !== wantFamily) {
          if (priceS) { try { chart.removeSeries(priceS); } catch {} }
          priceS = addPriceSeries(chart, tokensRef.current);
          priceFamilyRef.current = wantFamily;
          priceSeriesRef.current = priceS;
        } else { priceS.applyOptions({ priceFormat: priceFmt() }); }
        priceS!.setData(priceData(onChart) as any);
        clearAllIndicators();
        buildAllIndicators(onChart, closes);
        buildIndDataMap(onChart, closes);
        // compare overlays are cross-market date-string joins → skip on intraday; drop any stale ones
        for (const s of cmpSeriesRef.current.values()) { try { chart.removeSeries(s); } catch {} }
        cmpSeriesRef.current.clear();
        paintStatus(onChart, null);
        applyView(onChart, ri);
        renderSignalsRef.current(); renderRef.current();
        reRegisterSync();
        return;
      }

      // daily branch: clear any intraday dead-end overlay + reset the axis to date-only labels (the
      // intraday branch flips timeVisible on; a persistent chart carries that across a TF switch).
      hideEmptyRef.current();
      chart.applyOptions({ timeScale: { timeVisible: false, secondsVisible: false } });

      // ── PERF-FIX (b): clear the resample cache on symbol change so stale entries don't survive ──
      const symbolChanged = symbol !== prevSymbolRef.current;
      if (symbolChanged) { clearResampleCache(prevSymbolRef.current); prevSymbolRef.current = symbol; }
      cpMark(`ohlc-fetch-start[${symbol}]`);

      // ── F2 composite branch: fetch each leg and sum; no slice (no Oracle signal for baskets) ──
      const compositeLegs = parseComposite(symbol);
      let daily: Bar[];
      if (compositeLegs) {
        const legOhlcs = await getCompositeOhlc(compositeLegs);
        if (cancelled || epochRef.current !== epoch) return;
        const legBars = legOhlcs.map((o: any) =>
          o?.bars?.length ? (o.bars as any[][]).map((b) => ({ time: b[0] as string, o: b[1] as number, h: b[2] as number, l: b[3] as number, c: b[4] as number, v: b[5] as number })) : []
        );
        const summed = alignAndSum(legBars);
        if (!summed.length) { if (statusRef.current) statusRef.current.textContent = "No shared data for composite."; return; }
        daily = summed;
        sliceRef.current = null;
      } else {
        const { ohlc, slice } = await getSliceAndOhlc(symbol);
        cpMark(`ohlc-fetch-done[${symbol}]`);
        if (cancelled || epochRef.current !== epoch) return;
        sliceRef.current = slice;   // authoritative slice for replay sig-mark re-resolution (Effect 4)
        if (!ohlc?.bars?.length) { if (statusRef.current) statusRef.current.textContent = "No data for this symbol."; return; }
        daily = ohlc.bars.map((b: any[]) => ({ time: b[0], o: b[1], h: b[2], l: b[3], c: b[4], v: b[5] }));
      }
      dailyBarsRef.current = daily;         // raw daily source — the R11 splice operates on THIS
      // ── PERF-FIX (b): use cached resample; same-symbol TF switches skip the O(N) bucketing pass ──
      let rows: Bar[] = resampleTfCached(daily, timeframe, symbol);
      if (onMeta) onMeta({ total: rows.length });
      fullBarsRef.current = rows;
      // Read the LIVE replayIdx (not the effect's closure): if the user started replay while this
      // fetch was in flight, Effect 4 bailed (fullBarsRef was empty) and would NOT re-slice — so we
      // must honor the current replayIdx here or the chart stays stuck on the full series.
      const ri = replayIdxRef.current;
      const onChart = ri != null ? rows.slice(0, Math.max(20, ri + 1)) : rows;
      barsRef.current = onChart;
      const closes = onChart.map((r) => r.c);
      closesRef.current = closes;
      precRef.current = closes.length && closes[closes.length - 1] < 10 ? 4 : 2;
      tokensRef.current = readTokens();

      // ── price series: incremental setData if the type matches, else remove + re-add ──
      const familyOf = (ct: string) => (ct === "line" ? "line" : ct === "area" ? "area" : ct === "bars" ? "bars" : "candle"); // heikin uses candle series
      const wantFamily = familyOf(chartType);
      let priceS = priceSeriesRef.current;
      if (!priceS || priceFamilyRef.current !== wantFamily) {
        if (priceS) { try { chart.removeSeries(priceS); } catch {} }
        priceS = addPriceSeries(chart, tokensRef.current);
        priceFamilyRef.current = wantFamily;
        priceSeriesRef.current = priceS;
      } else {
        priceS.applyOptions({ priceFormat: priceFmt() });
      }
      priceS!.setData(priceData(onChart) as any);
      cpMark(`chart-painted[${symbol}]`);   // first candle on canvas

      // ── PERF-FIX (a): indicators — on same-symbol TF/chartType switch, update series data in-place
      //    (setData only, no removeSeries/addSeries lifecycle). On symbol change, do a full rebuild. ──
      const canUpdateInPlace = !symbolChanged && indSeriesRef.current.size > 0;
      if (canUpdateInPlace) {
        updateAllIndicators(onChart, closes);
        // updateAllIndicators only touches the built-in series registry (indSeriesRef); Pine scripts are
        // tracked separately and are date-keyed, so a same-symbol TF switch must still rebuild them onto
        // the new bars — mirror the full-rebuild path (buildAllIndicators) so an active Pine overlay
        // doesn't strand at the previous timeframe's data.
        clearAllPine();
        if (!isIntradayRef.current) buildAllPine(onChart);
      } else {
        clearAllIndicators();
        buildAllIndicators(onChart, closes);
      }
      buildIndDataMap(onChart, closes);

      // ── compare overlays ──
      await rebuildCompare(onChart, epoch);
      if (cancelled || epochRef.current !== epoch) return;

      // ── signal marks, status, verdict, view ──
      // sliceRef.current is null for composites (no Oracle signal) — functions guard on null slice.
      sigMarksRef.current = resolveSigMarks(sliceRef.current, onChart);
      { const sc = resolveSideChannels(sliceRef.current, onChart); earlyDotsRef.current = sc.dots; warnMarksRef.current = sc.warns; }
      paintStatus(onChart, sliceRef.current);
      applyView(onChart, ri);

      renderSignalsRef.current(); renderRef.current();

      // ── cross-pane sync: register in the TAIL of Effect 2 (after series + bars exist, §Effect 6) ──
      reRegisterSync();

      // ── R11: re-apply the live splice AFTER setData (which erased any prior splice). No-op under
      //    replay / EOD basis / intraday (guarded inside). Runs last so status + sig marks agree. ──
      applyLiveSplice();
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line
  }, [symbol, timeframe, chartType, extHours]);

  // Register (or re-register) this pane with paneSync. Cleans up any prior registration first.
  const reRegisterSync = () => {
    if (syncCleanupRef.current) { try { syncCleanupRef.current(); } catch {} syncCleanupRef.current = null; }
    const chart = chartRef.current, priceS = priceSeriesRef.current, syncId = syncIdRef.current;
    if (syncId == null || !chart || !priceS) return;
    const closeByTime = new Map(barsRef.current.map((r) => [r.time, r.c]));
    const cleanup = registerPane(syncId, { chart, series: priceS, valueAt: (tm: any) => closeByTime.get(tm as any) ?? null, tf: timeframeRef.current });
    // v5 subscribe* return void; unsubscribe by passing the SAME handler reference back.
    const onCross = (p: any) => { broadcastCrosshair(syncId, (p.time ?? null) as any); };
    const onRange = (r: any) => { broadcastRange(syncId, r as any); };
    chart.subscribeCrosshairMove(onCross);
    chart.timeScale().subscribeVisibleLogicalRangeChange(onRange);
    syncCleanupRef.current = () => {
      try { cleanup && cleanup(); } catch {}
      try { chart.unsubscribeCrosshairMove(onCross); } catch {}
      try { chart.timeScale().unsubscribeVisibleLogicalRangeChange(onRange); } catch {}
    };
  };

  // ────────────────────────────────────────────────────────────────────────────
  // EFFECT 3 — indicators [indKey]. Incremental add/remove or bounded sub-pane rebuild.
  // ────────────────────────────────────────────────────────────────────────────
  const indKey = Array.from(indicators).sort().join(",");
  useEffect(() => {
    const chart = chartRef.current; if (!chart) return;
    if (!barsRef.current.length) return;   // no data yet — Effect 2 will build the initial set
    const rows = barsRef.current, closes = closesRef.current;
    // snapshot the visible range so a view-preserving toggle can restore it after series churn (§0.4)
    viewSavedRef.current = PRESERVE_VIEW_ON_INDICATOR_TOGGLE ? (() => { try { const r = chart.timeScale().getVisibleLogicalRange(); return r ? { from: r.from as number, to: r.to as number } : null; } catch { return null; } })() : null;

    const OVERLAY_KEYS = ["ema", "bb", "vwap", "vol", "ichimoku", "ribbon", "supertrend", "avwap", "vprofile", "volbox"] as const;
    const wantOverlays = new Set<string>(OVERLAY_KEYS.filter((k) => indicators.has(k)));
    const haveOverlays = new Set<string>(OVERLAY_KEYS.filter((k) => indSeriesRef.current.has(k) || indOverlayRef.current[k]));
    const wantSub = activeSubpanes();                                   // canonical-order sub-pane keys
    const haveSub: string[] = SUBPANE_ORDER.filter((k) => indSeriesRef.current.has(k)); // current sub-panes in canonical order

    // ── overlays: always incremental (all live in pane 0, no reindex risk) ──
    for (const k of haveOverlays) if (!wantOverlays.has(k)) {
      const arr = indSeriesRef.current.get(k) || []; for (const s of arr) { try { chart.removeSeries(s); } catch {} } indSeriesRef.current.delete(k);
      delete indOverlayRef.current[k];
      // Restore candle colors when ribbon is removed
      if (k === "ribbon") restoreNormalCandleColors(rows);
    }
    for (const k of wantOverlays) if (!haveOverlays.has(k)) {
      if (k === "ema") indSeriesRef.current.set("ema", buildEma(chart, rows, closes));
      else if (k === "bb") indSeriesRef.current.set("bb", buildBb(chart, rows, closes));
      else if (k === "vwap") indSeriesRef.current.set("vwap", buildVwap(chart, rows));
      else if (k === "vol") indSeriesRef.current.set("vol", buildVol(chart, rows));
      else if (k === "ichimoku") indSeriesRef.current.set("ichimoku", buildIchimoku(chart, rows));
      else if (k === "ribbon") indSeriesRef.current.set("ribbon", buildRibbon(chart, rows, closes));
      else if (k === "supertrend") indSeriesRef.current.set("supertrend", buildSupertrend(chart, rows));
      else if (k === "avwap") indSeriesRef.current.set("avwap", buildAvwap(chart, rows));
      else if (k === "vprofile") indSeriesRef.current.set("vprofile", buildVprofile(rows));
      else if (k === "volbox") indSeriesRef.current.set("volbox", buildVolbox(rows));
    }

    // ── the osc pane is a special case: rsi/stochrsi share it. If the pane persists but its
    //    membership changed (added rsi to a stochrsi-only pane, etc.), rebuild JUST the osc pane
    //    in place (its pane index is unchanged, so no higher-pane reindex). ──
    const oscWanted = wantSub.includes("osc"), oscHave = haveSub.includes("osc");

    // ── sub-pane topology decision (§pane-topology decision table) ──
    // Compute whether the sub-pane change is a pure tail-append / highest-removal (incremental)
    // or forces reindexing a higher pane / inserting between (→ bounded rebuild).
    const removed = haveSub.filter((k) => !wantSub.includes(k));
    const added = wantSub.filter((k) => !haveSub.includes(k));

    let needBoundedRebuild = false;
    // an ADD that is not strictly at the tail (its canonical position lands before an existing sub-pane) → insert-between
    for (const a of added) {
      const wIdx = wantSub.indexOf(a);
      // if any sub-pane that already exists sits AFTER this new one in canonical order → we'd insert between
      if (wantSub.slice(wIdx + 1).some((k) => haveSub.includes(k))) { needBoundedRebuild = true; break; }
    }
    // a REMOVE that is not the highest existing sub-pane → reindex a higher pane
    if (!needBoundedRebuild) for (const r of removed) {
      const hIdx = haveSub.indexOf(r);
      if (haveSub.slice(hIdx + 1).length > 0) { needBoundedRebuild = true; break; }   // something exists above it
    }

    if (needBoundedRebuild) {
      // FULL SUB-PANE REBUILD: remove every indicator series (price/compare/drawings/sync survive),
      // re-add all requested indicators in canonical order → paneMapRef rebuilt cleanly.
      rebuildIndicators();
    } else {
      // ── incremental sub-pane edits ──
      // osc membership change without add/remove of the pane itself → rebuild the osc pane in place
      if (oscWanted && oscHave && !added.includes("osc") && !removed.includes("osc")) {
        const arr = indSeriesRef.current.get("osc") || []; for (const s of arr) { try { chart.removeSeries(s); } catch {} }
        const pane = paneMapRef.current.get("osc") ?? nextFreePane();
        indSeriesRef.current.set("osc", buildOsc(chart, rows, closes, pane)); paneMapRef.current.set("osc", pane);
      }
      // removals (highest sub-pane only, by the guard above)
      for (const r of removed) { const arr = indSeriesRef.current.get(r) || []; for (const s of arr) { try { chart.removeSeries(s); } catch {} } indSeriesRef.current.delete(r); paneMapRef.current.delete(r); }
      // additions (tail append, by the guard above) — assign the next free pane index
      for (const a of added) {
        const pane = nextFreePane();
        if (a === "osc") indSeriesRef.current.set("osc", buildOsc(chart, rows, closes, pane));
        else if (a === "macd") indSeriesRef.current.set("macd", buildMacd(chart, rows, closes, pane));
        else if (a === "rsistack") indSeriesRef.current.set("rsistack", buildRsiStack(chart, rows, pane));
        else if (a === "accum") indSeriesRef.current.set("accum", buildAccum(chart, rows, pane));
        paneMapRef.current.set(a, pane);
      }
      // ONLY when a built-in SUB-PANE was added/removed → re-seat pine sub-panes ABOVE the new built-in
      // panes so a pine pane index can't collide with a freshly-added built-in one. A pure overlay toggle
      // (ema/bb/vwap/vol on pane 0) leaves sub-pane indices untouched, so pine is left alone. (The
      // bounded-rebuild branch already rebuilt pine via buildAllIndicators.)
      if ((added.length || removed.length) && pineScriptsRef.current.length && !isIntradayRef.current) { clearAllPine(); buildAllPine(rows); }
    }

    normalizeStretch();
    renderSignalsRef.current(); renderRef.current();
    if (PRESERVE_VIEW_ON_INDICATOR_TOGGLE && viewSavedRef.current) { try { chart.timeScale().setVisibleLogicalRange(viewSavedRef.current); } catch {} }
    // eslint-disable-next-line
  }, [indKey]);

  // The next pane index for a tail-appended sub-pane = 1 + max assigned sub-pane index across BOTH the
  // built-in and pine sub-pane maps (or 1 when none exist), so a new built-in pane can't land on a pane
  // a script already occupies. (Effect 3 re-runs buildAllPine afterward to re-seat pine above the new pane.)
  const nextFreePane = () => {
    let mx = 0;
    for (const idx of paneMapRef.current.values()) mx = Math.max(mx, idx);
    for (const idx of pinePaneMapRef.current.values()) mx = Math.max(mx, idx);
    return mx ? mx + 1 : 1;
  };

  // Bounded rebuild: drop every indicator series and re-add the full requested set in canonical order.
  const rebuildIndicators = () => {
    const chart = chartRef.current; if (!chart) return;
    const rows = barsRef.current, closes = closesRef.current;
    clearAllIndicators();
    buildAllIndicators(rows, closes);
  };

  // ── EFFECT 3b — indicator params [indParamsKey]. A Settings edit changes the math/style of an active
  //   indicator, so drop + re-add every indicator series in place (bounded rebuild; no chart rebuild).
  //   Skips the mount pass (Effect 2 already builds against the initial params). ──
  const paramsMounted = useRef(false);
  useEffect(() => {
    if (!paramsMounted.current) { paramsMounted.current = true; return; }
    const chart = chartRef.current; if (!chart || !barsRef.current.length) return;
    const saved = PRESERVE_VIEW_ON_INDICATOR_TOGGLE ? (() => { try { const r = chart.timeScale().getVisibleLogicalRange(); return r ? { from: r.from as number, to: r.to as number } : null; } catch { return null; } })() : null;
    rebuildIndicators();
    normalizeStretch();
    renderSignalsRef.current(); renderRef.current();
    if (saved) { try { chart.timeScale().setVisibleLogicalRange(saved); } catch {} }
    // eslint-disable-next-line
  }, [indParamsKey]);

  // ── EFFECT 3c — custom scripts [pineKey]. Add / remove / param-edit a script WITHOUT touching the
  //   built-in indicators (do NOT clearAllIndicators — that would flash + reset every built-in). Only
  //   pine series are dropped + rebuilt; runPineMemo caches per script so a single param change re-runs
  //   ONLY that script. Skips the mount pass (Effect 2 already built the initial set). Runs on the SAME
  //   on-chart bar set the built-ins use. ──
  const pineKey = pineScripts.map((s) => `${s.id}:${s.source.length}:${JSON.stringify(s.params)}`).join("|");
  const pineMounted = useRef(false);
  useEffect(() => {
    if (!pineMounted.current) { pineMounted.current = true; return; }
    const chart = chartRef.current; if (!chart || !barsRef.current.length) return;
    const saved = PRESERVE_VIEW_ON_INDICATOR_TOGGLE ? (() => { try { const r = chart.timeScale().getVisibleLogicalRange(); return r ? { from: r.from as number, to: r.to as number } : null; } catch { return null; } })() : null;
    // drop cache entries for scripts that are no longer enabled (frees memory; a re-add re-runs fresh)
    const live = new Set(pineScriptsRef.current.map((s) => s.id));
    for (const id of Array.from(pineCacheRef.current.keys())) if (!live.has(id)) pineCacheRef.current.delete(id);
    for (const id of Array.from(pineErrRef.current.keys())) if (!live.has(id)) pineErrRef.current.delete(id);
    clearAllPine();
    if (!isIntradayRef.current) buildAllPine(barsRef.current);
    normalizeStretch();
    applyHidden();
    renderSignalsRef.current(); renderRef.current();
    if (saved) { try { chart.timeScale().setVisibleLogicalRange(saved); } catch {} }
    // eslint-disable-next-line
  }, [pineKey]);

  // ── eye toggle / tf-visibility [hidden] → flip series visibility in place (no chart rebuild) ──
  useEffect(() => { hiddenRef.current = hidden; applyHidden(); renderSignalsRef.current(); measureRef.current(); }, [hidden]); // eslint-disable-line

  // ────────────────────────────────────────────────────────────────────────────
  // EFFECT 4 — replay [replayIdx]. Slice from fullBarsRef; recompute indicators+sigMarks on the slice.
  // ────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const chart = chartRef.current, priceS = priceSeriesRef.current; if (!chart || !priceS) return;
    if (!fullBarsRef.current.length) return;   // no data yet — Effect 2 already honors replayIdx on first load
    if (replayIdx == null) {
      // exit replay → restore the FULL series (price + indicators + compare) + default view
      const full = fullBarsRef.current; barsRef.current = full; const closes = full.map((r) => r.c); closesRef.current = closes;
      precRef.current = closes.length && closes[closes.length - 1] < 10 ? 4 : 2;   // parity: prec from the visible last close
      priceS.setData(priceData(full) as any);
      clearAllIndicators(); buildAllIndicators(full, closes);
      // recompute compare on the full set (fire-and-forget; guarded by epoch)
      void rebuildCompare(full, epochRef.current);
      sigMarksRef.current = resolveSigMarks(sliceRef.current, full);
      { const sc = resolveSideChannels(sliceRef.current, full); earlyDotsRef.current = sc.dots; warnMarksRef.current = sc.warns; }
      paintStatus(full, sliceRef.current);
      applyView(full, null);
    } else {
      const rows = fullBarsRef.current.slice(0, Math.max(20, replayIdx + 1));
      barsRef.current = rows;                          // replicate the base's snap-sees-visible-bars behavior
      const closes = rows.map((r) => r.c); closesRef.current = closes;
      precRef.current = closes.length && closes[closes.length - 1] < 10 ? 4 : 2;   // parity: prec from the visible last close
      priceS.setData(priceData(rows) as any);
      clearAllIndicators(); buildAllIndicators(rows, closes);
      void rebuildCompare(rows, epochRef.current);
      sigMarksRef.current = resolveSigMarks(sliceRef.current, rows);
      { const sc = resolveSideChannels(sliceRef.current, rows); earlyDotsRef.current = sc.dots; warnMarksRef.current = sc.warns; }
      paintStatus(rows, sliceRef.current);
      try { chart.timeScale().fitContent(); } catch {}
    }
    normalizeStretch();
    renderSignalsRef.current(); renderRef.current();
    // re-register sync so its close-by-time map matches the visible bar set
    reRegisterSync();
    // exiting replay returns to the live series → re-apply the splice (self-guards under replay/EOD/intraday)
    applyLiveSplice();
    // eslint-disable-next-line
  }, [replayIdx]);

  // ────────────────────────────────────────────────────────────────────────────
  // EFFECT 7 — live-bar splice [liveQuote]. R11: patch/append the live quote onto the last bar.
  //   Keyed on a stable signature so it fires on each new snapshot from the 6s poll. All guards
  //   (intraday / replay / EOD basis / no-quote) live inside applyLiveSplice.
  // ────────────────────────────────────────────────────────────────────────────
  const liveSig = liveQuote ? `${liveQuote.last ?? ""}|${liveQuote.ts ?? ""}|${liveQuote.basis ?? ""}` : "";
  useEffect(() => {
    if (!chartRef.current || !priceSeriesRef.current) return;
    if (!barsRef.current.length) return;   // no data yet — Effect 2's tail will apply it
    applyLiveSplice();
    // eslint-disable-next-line
  }, [liveSig]);

  // ────────────────────────────────────────────────────────────────────────────
  // EFFECT 8 — jump-to-signal [mount]. R14: window `mm:chart-jump` {sym, ts}. If this pane's active
  //   symbol matches and the TF is daily-derived, snap ts to the nearest bar (SAME near() the marker
  //   renderer uses), center ±40 bars, and pulse the target sigMark ~2.5s (transient highlight flag),
  //   cleared on symbol/TF change (Effect 2 clears the timer) or when the next jump arrives.
  // ────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const onJump = (e: Event) => {
      const d = (e as CustomEvent).detail as { sym?: string; ts?: string } | undefined;
      if (!d || d.sym !== symbol || !d.ts) return;
      if (isIntradayRef.current) return;                 // ts is a date string; intraday axis is epoch-sec
      const chart = chartRef.current; if (!chart) return;
      const bars = barsRef.current; if (!bars.length) return;
      // nearest-bar snapping identical to resolveSigMarks' near()
      const x = new Date(d.ts + "T00:00:00Z").getTime();
      let bi = -1, bd = 1e18;
      for (let k = 0; k < bars.length; k++) { const dd = Math.abs(new Date(bars[k].time + "T00:00:00Z").getTime() - x); if (dd < bd) { bd = dd; bi = k; } }
      if (bi < 0 || bd >= 9e8) return;
      try { chart.timeScale().setVisibleLogicalRange({ from: bi - 40, to: bi + 40 }); } catch {}
      // pulse the matching sigMark (if one sits on that bar); transient highlight flag → renderSignals
      const tBar = bars[bi].time;
      if (highlightTimerRef.current) { clearTimeout(highlightTimerRef.current); highlightTimerRef.current = null; }
      let hit = false;
      for (const m of sigMarksRef.current) { const on = m.t === tBar; m.highlight = on; if (on) hit = true; }
      renderSignalsRef.current();
      if (hit) highlightTimerRef.current = setTimeout(() => {
        for (const m of sigMarksRef.current) m.highlight = false;
        highlightTimerRef.current = null;
        renderSignalsRef.current();
      }, 2500);
    };
    window.addEventListener("mm:chart-jump", onJump as EventListener);
    return () => { window.removeEventListener("mm:chart-jump", onJump as EventListener); if (highlightTimerRef.current) { clearTimeout(highlightTimerRef.current); highlightTimerRef.current = null; } };
    // eslint-disable-next-line
  }, [symbol]);

  // ────────────────────────────────────────────────────────────────────────────
  // EFFECT 5 — style [csNonce]. Re-read tokens; recolor chart + price + volume. NO createChart/removeSeries.
  // ────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const chart = chartRef.current, priceS = priceSeriesRef.current; if (!chart) return;
    const t = readTokens(); tokensRef.current = t;
    try {
      chart.applyOptions({
        layout: { textColor: t.mut, panes: { separatorColor: css("--pane-sep"), separatorHoverColor: css("--pane-sep-h") } },
        grid: { vertLines: { color: t.grid }, horzLines: { color: t.grid } },
        crosshair: { vertLine: { labelBackgroundColor: t.p3 }, horzLine: { labelBackgroundColor: t.p3 } },
        rightPriceScale: { borderColor: t.line },
        timeScale: { borderColor: t.line },
      });
    } catch {}
    if (priceS) {
      try {
        if (chartType === "bars") priceS.applyOptions({ upColor: t.up, downColor: t.down });
        else if (chartType === "line" || chartType === "area") priceS.applyOptions(chartType === "area" ? { lineColor: t.brand2 } : { color: t.brand2 });
        else priceS.applyOptions({ upColor: t.up, downColor: t.down, wickUpColor: t.up, wickDownColor: t.down });
      } catch {}
    }
    // recolor the volume histogram by re-setData with token-derived up/down fills (no series churn)
    const vol = indSeriesRef.current.get("vol"); if (vol && vol[0]) { try { vol[0].setData(volData(barsRef.current)); } catch {} }
    renderSignalsRef.current(); renderRef.current();
    // eslint-disable-next-line
  }, [csNonce]);

  // ────────────────────────────────────────────────────────────────────────────
  // EFFECT 6 — sync is registered in the tail of Effect 2 (+ on replay) via reRegisterSync(),
  //   and torn down in the mount cleanup. No standalone sync effect. When syncId changes,
  //   re-register against the live series.
  // ────────────────────────────────────────────────────────────────────────────
  useEffect(() => { if (chartRef.current && priceSeriesRef.current && barsRef.current.length) reRegisterSync(); return () => { }; /* eslint-disable-line */ }, [syncId]);

  // ── EFFECT 7 ─ chart settings (price scale mode, invert, position, labels, price line, grid, colors).
  // Applies whenever the chartSettings prop changes.
  useEffect(() => {
    const chart = chartRef.current; const priceS = priceSeriesRef.current; if (!chart) return;
    if (chartSettings == null) return;
    const { mode, invertScale, scaleLeft, autoScale, priceLineVisible, lastValueVisible,
      gridHVisible, gridVVisible, candleUpColor, candleDownColor,
      candleUpBorder, candleDownBorder, candleUpWick, candleDownWick,
      showWatermark, showOHLC, showBarChange } = chartSettings;
    try {
      if (scaleLeft != null) {
        chart.applyOptions({ leftPriceScale: { visible: !!scaleLeft }, rightPriceScale: { visible: !scaleLeft } });
        if (priceS) try { priceS.applyOptions({ priceScaleId: scaleLeft ? "left" : "right" } as any); } catch {}
      }
      const scaleId = (chartSettings.scaleLeft) ? "left" : "right";
      if (mode != null || invertScale != null || autoScale != null) {
        const opts: Record<string, any> = {};
        if (mode != null) opts.mode = mode;
        if (invertScale != null) opts.invertScale = invertScale;
        if (autoScale != null) opts.autoScale = autoScale;
        chart.priceScale(scaleId).applyOptions(opts);
      }
      // Grid visibility
      if (gridHVisible != null || gridVVisible != null) {
        const t = tokensRef.current;
        chart.applyOptions({
          grid: {
            horzLines: { color: t?.grid ?? "rgba(255,255,255,.04)", visible: gridHVisible !== false },
            vertLines: { color: t?.grid ?? "rgba(255,255,255,.04)", visible: gridVVisible !== false },
          },
        });
      }
      // Watermark visibility — v5 uses the createTextWatermark plugin (chart-level watermark removed in v5).
      if (showWatermark != null) {
        try { watermarkPluginRef.current?.applyOptions({ visible: showWatermark }); } catch {}
      }
      if (priceS) {
        const sOpts: Record<string, any> = {};
        if (priceLineVisible != null) sOpts.priceLineVisible = priceLineVisible;
        // The built-in lastValueVisible on the series is always false (we use a custom DOM tag);
        // keep the series option in sync for library correctness but also re-render the custom tag
        // immediately so the toggle has instant visible effect.
        if (lastValueVisible != null) sOpts.lastValueVisible = lastValueVisible;
        // Candle colors — only apply when the user has set an explicit hex (non-empty).
        // Empty-string means "follow CSS --up/--down tokens" (set by Effect 5 on theme/flip change).
        // This prevents the settings-load on mount from clobbering Effect 5's token-derived colors.
        if (candleUpColor) sOpts.upColor = candleUpColor;
        if (candleDownColor) sOpts.downColor = candleDownColor;
        if (candleUpBorder) sOpts.borderUpColor = candleUpBorder;
        if (candleDownBorder) sOpts.borderDownColor = candleDownBorder;
        if (candleUpWick) sOpts.wickUpColor = candleUpWick;
        if (candleDownWick) sOpts.wickDownColor = candleDownWick;
        if (Object.keys(sOpts).length) priceS.applyOptions(sOpts as any);
      }
      // Re-render the custom priceTag immediately when lastValueVisible changes so the toggle
      // is visible without waiting for the 1s interval tick.
      if (lastValueVisible != null) renderTagRef.current?.();
      // Re-paint status line immediately when the status-line toggles change.
      if (showOHLC != null || showBarChange != null) {
        if (barsRef.current.length) paintStatus(barsRef.current, sliceRef.current);
      }
    } catch {}
    // eslint-disable-next-line
  }, [JSON.stringify(chartSettings)]);

  // ── EFFECT 8 ─ expose the chart API to the parent (for range navigation from the frame bar).
  const onChartApiRef = useRef(onChartApi); onChartApiRef.current = onChartApi;
  useEffect(() => {
    onChartApiRef.current?.(chartRef.current);
    return () => { onChartApiRef.current?.(null); };
    // eslint-disable-next-line
  }, []);

  // ── D2 locked vline: re-render SVG when the locked time changes ──
  useEffect(() => { renderRef.current?.(); }, [lockedVLine]);

  // ── unchanged: re-render overlay + toggle interactivity on tool/drawings change (no chart rebuild) ──
  useEffect(() => { renderRef.current?.(); const svg = svgRef.current; if (svg) { svg.style.pointerEvents = tool ? "auto" : "none"; svg.style.cursor = tool === "erase" ? "pointer" : tool ? "crosshair" : "default"; } }, [tool, drawings]);

  // ── unchanged: detection commands → append auto-drawings (or clear) ──
  useEffect(() => {
    if (!detectCmd) return; let tries = 0; let timer: any;
    const run = () => {
      if (detectCmd.kind === "clearAll") { onChangeRef.current?.([]); return; }   // trash-can: wipe ALL drawings
      const bars = barsRef.current as DBar[];
      if (!bars.length) { if (tries++ < 25) timer = setTimeout(run, 150); return; }
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

  // ── compare change → rebuild only the compare overlays on the current bar set (no chart rebuild) ──
  const cmpDep = JSON.stringify({ c: compare || [], g: compareCfg });
  useEffect(() => {
    const chart = chartRef.current; if (!chart || !barsRef.current.length) return;
    void rebuildCompare(barsRef.current, epochRef.current).then(() => { rebuildPaneMeta(); renderSignalsRef.current(); renderRef.current(); });
    // eslint-disable-next-line
  }, [cmpDep]);

  // Golden Oracle Confluence is a toggleable/removable study now: its verdict badge + detail chip only
  // show while it's active AND not hidden via the legend eye. (Kept mounted with display:none so the
  // imperative verdict painter can keep verdictRef current in the background — no remount staleness.)
  const oracleVisible = indicators.has("_oracle") && !hidden.has("_oracle");
  return (
    <div className="chart-wrap">
      <div className="statusline">
        <span ref={statusRef} />
        <span className="mm" style={{ display: oracleVisible ? undefined : "none" }}><i style={{ background: "currentColor" }} /><span ref={verdictRef}>GOLDEN ORACLE</span></span>
        {replayIdx != null && <span className="mm" style={{ background: "rgba(232,179,57,.14)", borderColor: "rgba(232,179,57,.35)", color: "var(--signal)" }}><i style={{ background: "var(--signal)" }} />REPLAY</span>}
        {/* GC v2: toggle the early-dots + arm/confirm warning overlay (side channels) */}
        {oracleVisible && <span className="mm" role="button" tabIndex={0} onClick={() => setShowDetail((v) => !v)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setShowDetail((v) => !v); } }}
          title="Toggle early dots & structure-break warnings"
          style={{ cursor: "pointer", opacity: showDetail ? 1 : 0.5 }}>
          <i style={{ background: "var(--muted)" }} />{showDetail ? "⚠ detail" : "⚠ off"}
        </span>}
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
