// Server-side intraday OHLC sources for the Terminal chart.
//   US / crypto      → Polygon aggregates (intraday + full extended hours, on the current plan)
//   China .SS/.SZ    → Tencent mkline (free, no auth)
//   Hong Kong .HK    → Tencent 1-min tick feeds, OHLC synthesized (free, no auth; see fetchTencentHK)
//
// Bars are returned as [epochSec, o, h, l, c, v] to match the daily /data/<SYM>.json contract.
// Intraday uses epoch SECONDS; the daily files use "YYYY-MM-DD" strings — never mix the two on one
// render (see ingest/README). lightweight-charts renders timestamps in UTC, so to keep each market's
// intraday axis in its OWN local trading time we emit a "display epoch" built from the market-local
// wall-clock components (ET for US, UTC+8 for CN/HK), not the true UTC instant. Cross-market compare
// is disabled on intraday in the chart, so this local-time shift has no alignment cost.

// Pure helpers (Bar6, tfMinutes, classify, resample, isIntradayTf) live in intradayShared so they
// can be imported by both this module (client-shared) and intradayStore (server-only, node:fs).
export type { Bar6, Market } from "./intradayShared";
export { INTRADAY_TFS, isIntradayTf, tfMinutes, classify, resample } from "./intradayShared";
import type { Bar6, Market } from "./intradayShared";
import { isIntradayTf, tfMinutes, classify, resample } from "./intradayShared";
import { isMacroSymbol, fetchMacroQuotes } from "./macroSymbols";

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
  if (!r.ok) {
    if (r.status === 429) throw new Error("polygon rate-limited");
    throw new Error("polygon " + r.status);
  }
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
// CN minute OHLC comes from mkline (native scales m1/m5/m15/m30/m60; non-native tfs resample from
// the largest native divisor). HK lost mkline upstream (~2026-07: "param error" for every hk code
// while CN codes still work, and Tencent's own HK web chart no longer requests it) — see
// fetchTencentHK for the tick-feed replacement. tencentCode itself is shared with the quote leg.
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

// ── Hong Kong → Tencent 1-min tick feeds ──
// What Tencent's own HK web chart (gu.qq.com, bundle zxgweb-chart) ships since mkline dropped hk:
//   day/query?code=hk00700&days=5  → up to 5 sessions of 1-min rows (upstream-capped at 5)
//   hkMinute/query?code=hk00700    → the live current session (overlaid when it has fresher rows)
// Rows are "HHMM price cumVol cumAmount" in HK wall-clock (UTC+8) — a last-price series, not OHLC.
// 1m bars are synthesized (open = previous minute's close within the session, h/l = max/min(o, c),
// volume = cumulative-counter diff) and coarser tfs resample from that base. Depth is ~5 sessions
// (≈1,660 1m bars → ~28 clock-hour 1h bars) — thinner than mkline's 640-per-scale, but it is all
// the free feed carries now. Closing-auction prints (16:01–16:08) come through as ordinary rows.
function hkSessionBars(date: string, rows: unknown[]): Bar6[] {
  if (!/^\d{8}$/.test(date)) return [];
  const y = +date.slice(0, 4), mo = +date.slice(4, 6) - 1, d = +date.slice(6, 8);
  const out: Bar6[] = [];
  let prevClose = NaN, prevCum = 0;
  for (const raw of rows) {
    const f = String(raw).trim().split(/\s+/);
    if (f.length < 3 || f[0].length !== 4) continue;
    const c = +f[1], cum = +f[2];
    if (!Number.isFinite(c) || c <= 0) continue;
    const epoch = Date.UTC(y, mo, d, +f[0].slice(0, 2), +f[0].slice(2, 4)) / 1000;
    const o = Number.isFinite(prevClose) ? prevClose : c;
    const v = Number.isFinite(cum) ? Math.max(0, cum - prevCum) : 0;
    out.push([epoch, o, Math.max(o, c), Math.min(o, c), c, v]);
    prevClose = c;
    if (Number.isFinite(cum)) prevCum = cum;
  }
  return out;
}

async function fetchTencentHK(sym: string, tf: string): Promise<Bar6[]> {
  const code = tencentCode(sym, "hk");
  if (!code) return [];
  const get = (path: string) =>
    fetch(`https://web.ifzq.gtimg.cn/appstock/app/${path}`, {
      headers: { "User-Agent": "Mozilla/5.0", Referer: "https://gu.qq.com/" },
      cache: "no-store", signal: AbortSignal.timeout(8000),
    }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const [multi, live] = await Promise.all([
    get(`day/query?code=${code}&days=5`),
    get(`hkMinute/query?code=${code}`),
  ]);
  if (!multi && !live) throw new Error("tencent hk unreachable"); // let the route serve its stale copy
  const byDate = new Map<string, unknown[]>();
  for (const day of (multi?.data?.[code]?.data ?? []) as any[])
    if (day?.date && Array.isArray(day.data)) byDate.set(String(day.date), day.data);
  const ln: any = live?.data?.[code]?.data;
  const liveDate = String(ln?.date ?? "");
  if (/^\d{8}$/.test(liveDate) && Array.isArray(ln?.data) && ln.data.length >= (byDate.get(liveDate)?.length ?? 0))
    byDate.set(liveDate, ln.data);
  const base: Bar6[] = [];
  for (const date of [...byDate.keys()].sort()) base.push(...hkSessionBars(date, byDate.get(date)!));
  const minutes = tfMinutes(tf);
  return minutes <= 1 ? base : resample(base, minutes);
}

export async function fetchIntraday(sym: string, tf: string, ext: boolean): Promise<Bar6[]> {
  if (!isIntradayTf(tf)) return [];
  const market = classify(sym);
  if (market === "ca") return []; // .TO has no Polygon intraday leg on this plan — avoid garbage
  const bars = (market === "us" || market === "crypto")
    ? await fetchPolygon(sym, market, tf, ext)
    : market === "hk"
      ? await fetchTencentHK(sym, tf)
      : await fetchTencent(sym, market, tf);
  bars.sort((a, b) => a[0] - b[0]);
  const out: Bar6[] = [];
  let last = -1;
  for (const b of bars) { if (b[0] !== last) { out.push(b); last = b[0]; } } // ascending + unique
  return out.slice(-1200);
}

// ── Live top-of-book quote (panel header) ──
// China A-share + Hong Kong: Tencent qt.gtimg.cn snapshot — a COMPLETE real-time quote
// (last / prev-close / open / day high-low / cumulative volume / turnover / change%), ~3-6s
// cadence, keyless, same trusted host family as the kline leg. A-share is genuinely live; HK
// is typically ~15-min delayed at source. Both markets share the same field layout.
// US + crypto: served by the localhost Quote Hub (Coinbase live crypto, delayed-15m Polygon US);
// hub down/timeout → null → manifest EOD fallback (see fetchQuote).
export type Quote = {
  sym: string; last: number; prevClose: number | null; chg: number | null;
  open: number | null; high: number | null; low: number | null;
  vol: number | null; amount: number | null; ts: number | null;
  live: boolean; source: string; market: Market;
  basis: "LIVE" | "DELAYED_15M" | "EOD";
  // Extended/overnight fields (item-25/26). Populated by the ext-quote route.
  // extPrice: the most recent ext print; extChg: % vs close; extTs: epoch-sec of that print.
  // Absent (undefined) when no ext data is available (keyless or no print).
  extPrice?: number | null; extChg?: number | null; extTs?: number | null;
};

function _n(s: string | undefined): number | null {
  if (s == null) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

// Like _n, but treats a non-positive value as ABSENT. CN/HK premarket call-auction snapshots report
// open/high/low = 0 before the session resolves; a real equity price is always > 0, so a 0 here is a
// placeholder, not a print. Passing it through would let the live-bar splice anchor a bar at $0.
function _pos(s: string | undefined): number | null {
  const n = _n(s);
  return n != null && n > 0 ? n : null;
}

// Tencent quote time is "YYYYmmddHHMMSS" (A-share) or "YYYY/MM/DD HH:MM:SS" (HK); both UTC+8.
function _tencentTs(s: string | undefined): number | null {
  if (!s) return null;
  const m = /(\d{4})\D?(\d{2})\D?(\d{2})\D?(\d{2}):?(\d{2}):?(\d{2})/.exec(s);
  if (!m) return null;
  const [, y, mo, d, h, mi, se] = m;
  return Math.floor(Date.UTC(+y, +mo - 1, +d, +h - 8, +mi, +se) / 1000);
}

// Parse one Tencent qt.gtimg.cn "~"-delimited field record into a Quote (shared by the single and
// batch fetchers). Field offsets: 3=last 4=prevClose 5=open 6=vol(手, A-share) 30=ts 32=change%
// 33=high 34=low 37=amount. Tencent responds in GBK, but every field we read is ASCII, so the
// caller decodes as latin1 (the Chinese name bytes we ignore decode to garbage, which is fine).
export function parseTencentFields(sym: string, market: Market, f: string[]): Quote | null {
  if (f.length < 35) return null;
  const last = _n(f[3]);
  if (last == null || last === 0) return null;
  const volRaw = _n(f[6]); // A-share volume is in 手 (lots, ×100 shares); HK is already in shares
  return {
    sym, last, prevClose: _n(f[4]), chg: _n(f[32]),
    open: _pos(f[5]), high: _pos(f[33]), low: _pos(f[34]),
    vol: volRaw == null ? null : (market === "cn" ? volRaw * 100 : volRaw),
    amount: _n(f[37]), ts: _tencentTs(f[30]),
    live: true, source: "tencent", market,
    // A-share is genuinely real-time (LIVE); HK is ~15-min delayed at source (DELAYED_15M).
    basis: market === "cn" ? "LIVE" : "DELAYED_15M",
  };
}

// Batch China/HK quotes in ONE request. qt.gtimg.cn/q= accepts many comma-joined codes and echoes
// each back as `v_<code>="..."`; we reverse-map <code>→sym. Throws on a non-200 (caller catches).
async function fetchTencentQuotes(syms: string[]): Promise<Record<string, Quote>> {
  const codeToSym = new Map<string, string>();
  const marketOf = new Map<string, Market>();
  const codes: string[] = [];
  for (const s of syms) {
    const mk = classify(s);
    const code = tencentCode(s, mk);
    if (code) { codeToSym.set(code, s); marketOf.set(s, mk); codes.push(code); }
  }
  if (!codes.length) return {};
  // One quick retry on network failure/abort: typical latency is ~1-1.3s against the 2.5s cap, so
  // a single slow response aborts and would otherwise blank the whole chunk for this poll. The
  // timeout signal also governs body streaming, so the body read lives INSIDE the attempt (a
  // mid-body stall must retry too); each try needs a fresh signal. A non-200 is thrown as-is and
  // NOT retried — no point hammering an upstream that answered with an error.
  const attempt = async (): Promise<ArrayBuffer> => {
    const r = await fetch(`https://qt.gtimg.cn/q=${codes.join(",")}`, {
      headers: { "User-Agent": "Mozilla/5.0", Referer: "https://gu.qq.com/" },
      cache: "no-store", signal: AbortSignal.timeout(2500),
    });
    if (!r.ok) throw new Error("tencent-quote " + r.status);
    return r.arrayBuffer();
  };
  let buf: ArrayBuffer;
  try { buf = await attempt(); }
  catch (e) {
    if (e instanceof Error && e.message.startsWith("tencent-quote")) throw e;
    buf = await attempt();
  }
  const text = new TextDecoder("latin1").decode(buf);
  const out: Record<string, Quote> = {};
  const re = /v_(\w+)="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const sym = codeToSym.get(m[1]);
    if (!sym) continue;
    const q = parseTencentFields(sym, marketOf.get(sym)!, m[2].split("~"));
    if (q) out[sym] = q;
  }
  return out;
}

// Batch US/crypto quotes from the localhost Quote Hub — /quotes?syms=CSV is already contract-shaped
// ({SYM:{...}}). Hub down / non-200 / timeout → {} (→ those symbols fall back to manifest EOD).
async function fetchHubQuotes(syms: string[]): Promise<Record<string, Quote>> {
  if (!syms.length) return {};
  try {
    const port = process.env.HUB_PORT ?? "3100";
    const r = await fetch(
      "http://127.0.0.1:" + port + "/quotes?syms=" + encodeURIComponent(syms.join(",")),
      { cache: "no-store", signal: AbortSignal.timeout(1500) }
    );
    if (!r.ok) return {};
    const j: any = await r.json();
    const out: Record<string, Quote> = {};
    for (const s of syms) if (j && j[s]) out[s] = j[s];
    return out;
  } catch {
    return {};
  }
}

function chunk<T>(a: T[], n: number): T[][] {
  const o: T[][] = [];
  for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n));
  return o;
}

// Batch live quotes for many symbols with the fewest upstream calls: one Quote-Hub call for all
// US+crypto, chunked Tencent calls for all CN+HK. Symbol-keyed map (failed/missing symbols simply
// absent → the caller falls back to manifest EOD). This is the single source of truth behind BOTH
// the live header and the live watchlist, so a symbol can never show two prices (see TerminalShell).
export async function fetchQuotes(syms: string[]): Promise<Record<string, Quote>> {
  const uniq = Array.from(new Set(syms.map((s) => s.trim()).filter(Boolean)));
  const hub: string[] = [];
  const tencent: string[] = [];
  const macro: string[] = [];
  for (const s of uniq) {
    // Macro instruments (^GSPC, GC=F, EURUSD=X, DX-Y.NYB) are checked FIRST: their shapes would
    // otherwise fall through classify()'s default and be sent to the Quote Hub, which knows only
    // US equities and crypto and would silently return nothing for every one of them.
    if (isMacroSymbol(s)) { macro.push(s); continue; }
    const mk = classify(s);
    // CN/HK index codes (000001.SS, 000300.SS, 399001.SZ, 399006.SZ) need no special case: they
    // match the A-share pattern and Tencent serves indices under the same sh######/sz###### codes.
    if (mk === "cn" || mk === "hk") tencent.push(s);
    else if (mk === "us" || mk === "crypto") hub.push(s); // ca → no live leg → manifest EOD
  }
  const out: Record<string, Quote> = {};
  await Promise.all([
    ...chunk(hub, 100).map((c) => fetchHubQuotes(c).then((mp) => { Object.assign(out, mp); }).catch(() => {})),
    // 30/chunk (not 60): one slow/aborted Tencent response blanks its whole chunk, so smaller
    // chunks halve the blast radius of a single bad request (chunks run in parallel anyway).
    ...chunk(tencent, 30).map((c) => fetchTencentQuotes(c).then((mp) => { Object.assign(out, mp); }).catch(() => {})),
    macro.length
      ? fetchMacroQuotes(macro).then((mp) => {
          for (const [sym, q] of Object.entries(mp)) {
            out[sym] = {
              sym, last: q.last, prevClose: q.prevClose, chg: q.chg,
              open: null, high: null, low: null, vol: null, amount: null, ts: q.ts,
              // DELAYED, not live: this source runs behind the exchange, and real-time
              // index/CME/ICE data requires a licensed feed we do not hold. Marking these LIVE
              // would print a claim we cannot back.
              live: false, source: "yahoo-spark", market: "us", basis: "DELAYED_15M",
            };
          }
        }).catch(() => {})
      : Promise.resolve(),
  ]);
  return out;
}

// Single-symbol live quote (China/HK via Tencent, US/crypto via the Quote Hub; null for .TO and any
// miss → manifest EOD backs the header). Delegates to the batch path so both share one code path.
export async function fetchQuote(sym: string): Promise<Quote | null> {
  return (await fetchQuotes([sym]))[sym] ?? null;
}
