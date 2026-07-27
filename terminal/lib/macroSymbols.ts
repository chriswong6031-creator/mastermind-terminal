// Macro instruments — indices, rates, FX, and futures — as first-class Terminal symbols.
//
// The universe was equities + 61 US ETFs + 4 crypto. The search dialog has ALWAYS shipped
// Forex / Futures / Indices / Bonds / Economy category tabs; they simply had nothing to show,
// because no symbol in the manifest carried those `sec` values. This module adds the routing
// half (quotes), and ingest/build_macro_symbols.py adds the catalog half (manifest rows).
//
// Routing is by symbol SHAPE, not by a table lookup, so the runtime never has to stay in sync
// with the collector's catalog — adding a new future to the catalog makes it live here for free:
//
//     ^GSPC ^VIX ^TNX ^HSI   indices, vol, benchmark yields   (leading caret)
//     GC=F CL=F ES=F         futures                          (=F suffix)
//     EURUSD=X USDCNH=X      FX pairs                         (=X suffix)
//     DX-Y.NYB               the dollar index                 (ICE's own ticker; special-cased)
//
// Mainland-China indices (000001.SS Shanghai Composite, 000300.SS CSI 300, 399001.SZ, 399006.SZ)
// deliberately do NOT appear here: they already match the existing `.SS`/`.SZ` classifier and
// Tencent serves them under the same sh######/sz###### codes as A-shares, so they route through
// the live Tencent path with no new code. Same for HK — but ^HSI has no numeric Tencent code, so
// it comes through here instead.

export type MacroKind = "index" | "rate" | "fx" | "future";

const RE_CARET = /^\^[A-Z0-9]{1,12}$/i;
const RE_FUT = /=F$/i;
const RE_FX = /=X$/i;
const DXY = "DX-Y.NYB";

// Caret tickers that are benchmark YIELDS, not price indices — they quote in percent and belong
// under Bonds rather than Indices. ^IRX 13-week, ^FVX 5-year, ^TNX 10-year, ^TYX 30-year.
const RATE_TICKERS = new Set(["^IRX", "^FVX", "^TNX", "^TYX"]);

/**
 * FRED series that print ONCE A DAY and have no live or intraday leg anywhere.
 *
 * These are bare series ids — no `^`, no `=F`/`=X` — so they match no shape above and used to
 * fall through to the `us` default, which is a fabrication in three places at once: the hub
 * polygon-subscribed `AM.DFII10` (a Polygon LRU slot on a ticker that market has never heard
 * of), burned one of the 30 SHARED ext slots, and served a manifest placeholder stamped
 * `source: "polygon-delayed"` / `basis: "DELAYED_15M"` / `ts: now` — a 15-minute-freshness
 * claim on a number FRED publishes once a day, which then spliced a synthetic flat bar dated
 * today onto the chart.
 *
 * Routed NOWHERE instead. Absent from every live response, the caller falls back to the
 * manifest's EOD row: the real daily close, no splice, no invented freshness.
 *
 * KEEP IN SYNC with hub/lib/quotes.js DAILY_ONLY — adding a FRED series means adding it to
 * BOTH routers (see the pointer beside _FRED_RATES in ingest/macro_catalog.py).
 */
export const DAILY_ONLY = new Set(["DFII10", "DFII5", "T10YIE", "T5YIE"]);

/** True when this symbol is a daily-print-only series with no live/intraday leg at all. */
export function isDailyOnlySymbol(sym: string): boolean {
  return DAILY_ONLY.has(String(sym ?? "").trim().toUpperCase());
}

/** True when this symbol is a macro instrument routed to the Yahoo leg. */
export function isMacroSymbol(sym: string): boolean {
  return sym === DXY || RE_CARET.test(sym) || RE_FUT.test(sym) || RE_FX.test(sym);
}

export function macroKind(sym: string): MacroKind | null {
  if (sym === DXY || RE_FX.test(sym)) return "fx";
  if (RE_FUT.test(sym)) return "future";
  if (RE_CARET.test(sym)) return RATE_TICKERS.has(sym.toUpperCase()) ? "rate" : "index";
  return null;
}

// ── Intraday display timezone ──────────────────────────────────────────────────────────────
// The intraday chart's convention is a "display epoch": the market-local wall clock read AS IF
// it were UTC (see sessionEpoch in intradayShared / etDisplay in intradaySources). For US
// instruments that local clock is US Eastern — but an international index's session runs on
// ITS market's clock, and stamping a Nikkei bar with the ET reading plots the Tokyo session
// as 20:00–02:00 and lets Day Trade Mode paint US RTH bands over it. This map carries the
// HOME timezone of every macro symbol whose market does not run on US Eastern wall clock.
// Everything else — US indices, benchmark yields, FX, futures, DX-Y.NYB, and ^GSPTSE
// (Toronto trades on the same Eastern wall clock, 09:30–16:00) — defaults to ET.
//
// KEEP IN SYNC with _INDICES in ingest/macro_catalog.py: adding an international index there
// means adding its home timezone here, or its intraday axis silently comes out in ET.
const ET_TZ = "America/New_York";
const MACRO_TZ: Record<string, string> = {
  "^N225": "Asia/Tokyo",
  "^KS11": "Asia/Seoul",
  "^TWII": "Asia/Taipei",
  "^HSI": "Asia/Hong_Kong",
  "^HSCE": "Asia/Hong_Kong",
  "^FTSE": "Europe/London",
  "^GDAXI": "Europe/Berlin",
  "^FCHI": "Europe/Paris",
  "^STOXX50E": "Europe/Amsterdam",
  "^BSESN": "Asia/Kolkata",
  "^AXJO": "Australia/Sydney",
};

/** IANA timezone whose wall clock is this macro symbol's intraday display axis. */
export function macroDisplayTz(sym: string): string {
  return MACRO_TZ[String(sym ?? "").trim().toUpperCase()] ?? ET_TZ;
}

/**
 * True when this symbol's intraday axis runs on US Eastern wall clock — the precondition for
 * painting US RTH session bands (premarket/after-hours) over its bars in Day Trade Mode.
 */
export function macroOnEtAxis(sym: string): boolean {
  return macroDisplayTz(sym) === ET_TZ;
}

// Yahoo's spark endpoint HTTP-400s a symbol list longer than ~20 (20 OK, 21 fails) — the same
// cliff the macro repo's quotes worker documents, and confirmed again here: a 23-symbol request
// returns zero results rather than a partial answer. Chunk under it; the chunks run in parallel.
const SPARK_BATCH = 18;
const SPARK_URL = "https://query1.finance.yahoo.com/v7/finance/spark";

export type MacroQuote = {
  last: number;
  prevClose: number | null;
  chg: number | null;   // percent
  ts: number | null;
};

type SparkMeta = {
  symbol?: string;
  regularMarketPrice?: number;
  previousClose?: number;
  chartPreviousClose?: number;
  regularMarketTime?: number;
};

function chunk<T>(a: T[], n: number): T[][] {
  const o: T[][] = [];
  for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n));
  return o;
}

async function fetchSparkChunk(syms: string[]): Promise<Record<string, MacroQuote>> {
  const url = `${SPARK_URL}?symbols=${encodeURIComponent(syms.join(","))}&range=1d&interval=5m`;
  const r = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    cache: "no-store",
    signal: AbortSignal.timeout(3000),
  });
  if (!r.ok) throw new Error("spark " + r.status);
  const j = (await r.json()) as { spark?: { result?: { symbol?: string; response?: { meta?: SparkMeta }[] }[] } };
  const out: Record<string, MacroQuote> = {};
  for (const row of j?.spark?.result ?? []) {
    const meta = row?.response?.[0]?.meta;
    const last = meta?.regularMarketPrice;
    const sym = row?.symbol ?? meta?.symbol;
    if (!sym || typeof last !== "number") continue;   // no price → absent → caller falls back to EOD
    const prev = meta?.previousClose ?? meta?.chartPreviousClose ?? null;
    out[sym] = {
      last,
      prevClose: prev,
      // Guard prev === 0: a zero previous close would yield Infinity, which renders as a
      // nonsense change on the tape rather than an honest blank.
      chg: prev != null && prev !== 0 ? ((last - prev) / prev) * 100 : null,
      ts: typeof meta?.regularMarketTime === "number" ? meta.regularMarketTime : null,
    };
  }
  return out;
}

/**
 * Batch macro quotes. Never throws: a failed chunk contributes nothing and those symbols fall
 * back to the manifest's EOD row, exactly like the Tencent and Quote-Hub legs.
 *
 * These are delayed, not real-time: index and futures prints from this source run behind the
 * exchange, and real-time CME/ICE/index data needs a licensed feed. Quotes are therefore marked
 * DELAYED_15M by the caller rather than LIVE — claiming "live" for a licensed feed we do not
 * have would be a lie printed on a price.
 */
export async function fetchMacroQuotes(syms: string[]): Promise<Record<string, MacroQuote>> {
  const want = syms.filter(isMacroSymbol);
  if (!want.length) return {};
  const out: Record<string, MacroQuote> = {};
  await Promise.all(
    chunk(want, SPARK_BATCH).map((c) =>
      fetchSparkChunk(c).then((mp) => { Object.assign(out, mp); }).catch(() => {}),
    ),
  );
  return out;
}
