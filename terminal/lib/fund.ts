// fund.ts — TS contracts + client getters for the fundamentals / options / transcript files
// (BUILD-SPEC §1 + §3.1). SINGLE AUTHOR: lane FE1a.
//
//   - Types mirror the frozen §1 contracts EXACTLY (quote_currency + stmt_currency, 2-period
//     estimates, gzip transcripts).
//   - getFund/getOpts route through dataCache (dedupes with the chart's inflight fetch) BUT add a
//     local negative-cache (JUDGE FIX: dataCache deletes the key on !r.ok, so long-tail symbols
//     would re-404 on every render — we remember misses for 10 min).
//   - getTx fetches the gzipped per-call file and inflates via DecompressionStream("gzip").
//   - getBars re-exports dataCache's OHLC getter so rail widgets share the chart's fetch.

import { getJSON, getOhlc } from "./dataCache";

// ─────────────────────────────────────────────────────────────────────────────
// §1.1  <SYM>.fund.json — mastermind.fund/v1
// ─────────────────────────────────────────────────────────────────────────────

export type NumArr = (number | null)[];

export interface FundProfile {
  website: string | null;
  employees: number | null;
  sector: string | null;
  industry: string | null;
  description: string | null;
  founded: string | null;
  hq: string | null;
}

export interface FundStats {
  mktcap: number | null;
  shares_out: number | null;
  float_shares: number | null;
  inst_pct: number | null;
  insider_pct: number | null;
  beta: number | null;
  num_holders: number | null;
}

export interface IncomeBlock {
  revenue: NumArr;
  cogs: NumArr;
  gross_profit: NumArr;
  opex: NumArr;
  op_income: NumArr;
  nonop_income: NumArr;
  pretax_income: NumArr;
  taxes: NumArr;
  net_income: NumArr;
  eps_basic: NumArr;
  eps_diluted: NumArr;
  ebitda: NumArr;
}

export interface BalanceBlock {
  assets: NumArr;
  assets_st: NumArr;
  assets_lt: NumArr;
  liabilities: NumArr;
  liab_st: NumArr;
  liab_lt: NumArr;
  equity: NumArr;
  debt: NumArr;
  cash: NumArr;
  net_debt: NumArr;
}

export interface CashflowBlock {
  cfo: NumArr;
  cfi: NumArr;
  cff: NumArr;
  capex: NumArr;
  fcf: NumArr;
}

export interface StatementPeriodSet {
  periods: string[]; // fiscal-year labels or "Q3 '26", oldest→newest
  period_end: string[];
  income: IncomeBlock;
  balance: BalanceBlock;
  cashflow: CashflowBlock;
}

export interface FundStatements {
  annual: StatementPeriodSet;
  quarterly: StatementPeriodSet;
}

export interface RatiosCurrent {
  pe_ttm: number | null;
  pe_fwd: number | null;
  ps: number | null;
  pb: number | null;
  ev_ebitda: number | null;
  ev_sales: number | null;
  ev_ebit: number | null;
  p_fcf: number | null;
  div_yield: number | null;
  payout: number | null;
  gross_margin: number | null;
  net_margin: number | null;
  roe: number | null;
  roa: number | null;
  debt_to_equity: number | null;
  current_ratio: number | null;
}

export interface FundRatios {
  periods: string[];
  pe: NumArr;
  ps: NumArr;
  pb: NumArr;
  pcf: NumArr;
  ev: NumArr;
  ev_ebitda: NumArr;
  current: RatiosCurrent;
}

export interface EarningsQuarter {
  period: string; // "Q3 2026"
  end: string;
  report_date: string;
  eps_a: number | null;
  eps_e: number | null;
  rev_a: number | null; // null for US/HK (yfinance carries no per-quarter revenue)
  rev_e: number | null;
  surp_pct: number | null;
  tx: string | null; // defeatbeta fiscal id "2026Q3" — transcript join key; null when none
}

export interface EarningsFY {
  period: string;
  eps_a: number | null;
  eps_e: number | null;
  rev_a: number | null;
  rev_e: number | null;
  surp_pct: number | null;
}

export interface FundEarnings {
  next_date: string | null;
  next_period: string | null;
  next_eps_est: number | null;
  next_rev_est: number | null;
  q: EarningsQuarter[]; // oldest→newest, ≥8 where available
  fy: EarningsFY[];
}

export interface EstimateSeries {
  periods: string[];
  avg: NumArr;
  high: NumArr;
  low: NumArr;
  n: NumArr;
}

export interface FundEstimates {
  // JUDGE FIX: yfinance provides EXACTLY 4 rows — two forward quarters (eps_q) and two fiscal
  // years (eps_fy / rev_fy). No third year.
  eps_fy: EstimateSeries; // 0y, +1y
  rev_fy: EstimateSeries; // 0y, +1y
  eps_q: EstimateSeries; // 0q, +1q
  growth: { rev_yoy: number | null; eps_yoy: number | null };
}

export interface AnalystDist {
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
}

export interface FundAnalyst {
  dist: AnalystDist;
  rating_label: string | null;
  target: {
    mean: number | null;
    high: number | null;
    low: number | null;
    n: number | null;
  };
}

export interface DividendEvent {
  ex: string;
  amount: number | null;
  pay: string | null;
  type: string; // "regular" | "special" | …
}

export interface SplitEvent {
  date: string;
  ratio: string; // "4:1"
}

export interface FundDividends {
  never_paid: boolean;
  yield_ttm: number | null;
  payout_ratio: number | null;
  events: DividendEvent[]; // full history oldest→newest
  splits: SplitEvent[];
}

export interface InstHolder {
  name: string;
  pct: number | null;
  value: number | null;
}

export interface FundOwnership {
  free_float_pct: number | null;
  closely_held_pct: number | null;
  top_inst: InstHolder[]; // ≤10
}

export interface FundGuidance {
  type: string; // e.g. "预增"
  chg_min: number | null;
  chg_max: number | null;
  period: string;
}

export interface SegmentSeries {
  periods: string[];
  series: { name: string; values: NumArr }[];
}

export interface FundSegments {
  by_source: SegmentSeries | null;
  by_country: SegmentSeries | null;
}

export interface Fund {
  schema: string; // "mastermind.fund/v1"
  ticker: string;
  asof: string;
  quote_currency: string; // trading currency (price/mktcap/dividends)
  stmt_currency: string; // financial-reporting currency (statements/estimates)
  src: {
    statements: string;
    estimates: string | null;
    dividends: string;
  };
  profile: FundProfile;
  stats: FundStats;
  statements: FundStatements;
  ratios: FundRatios;
  earnings: FundEarnings;
  estimates: FundEstimates | null; // null for CN
  analyst: FundAnalyst | null; // null for CN
  dividends: FundDividends;
  ownership: FundOwnership;
  guidance: FundGuidance | null; // CN only
  segments: FundSegments | null; // deferred (R6)
}

// ─────────────────────────────────────────────────────────────────────────────
// §1.2  <SYM>.opts.json — mastermind.opts/v1
// ─────────────────────────────────────────────────────────────────────────────

export interface OptsTenor {
  label: string; // "1W" | "2W" | "1M" | "2M" | "3M" | "6M" | "9M" | "1Y"
  dte: number;
  expiry: string;
  iv: number; // raw decimal (0.412 = 41.2%) — frontend ×100 at render
}

export interface OptsSmile {
  expiry: string;
  dte: number;
  strikes: number[];
  iv: number[]; // raw decimals, aligned to strikes
  delta_call: number[];
}

export interface Opts {
  schema: string; // "mastermind.opts/v1"
  ticker: string;
  asof: string;
  spot: number;
  term: OptsTenor[];
  smile: OptsSmile;
  iv_source: string; // "yfinance" | "cboe"
}

// ─────────────────────────────────────────────────────────────────────────────
// §1.3  transcripts — public/data/tx/<SYM>/<ID>.json.gz
// ─────────────────────────────────────────────────────────────────────────────

export interface TxSegment {
  speaker: string;
  role: string;
  text: string;
}

export interface Transcript {
  schema: string; // "mastermind.tx/v1"
  ticker: string;
  id: string; // "2026Q3"
  period: string; // "Q3 FY2026"
  date: string;
  title: string;
  segments: TxSegment[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Bars (chart OHLC) — shared shape for rail widgets / techRating / realizedVol
// ─────────────────────────────────────────────────────────────────────────────

export interface Bar {
  time: string | number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Getters
// ─────────────────────────────────────────────────────────────────────────────

// Local negative-cache: sym-key → epoch-ms until which a miss is remembered.
const NEG_TTL = 10 * 60 * 1000; // 10 min
const negCache = new Map<string, number>();

function negHit(key: string): boolean {
  const until = negCache.get(key);
  if (until == null) return false;
  if (Date.now() >= until) {
    negCache.delete(key);
    return false;
  }
  return true;
}

function negMark(key: string): void {
  negCache.set(key, Date.now() + NEG_TTL);
}

/** getFund — <SYM>.fund.json, negative-cached against long-tail 404 storms. */
export async function getFund(sym: string): Promise<Fund | null> {
  const key = "fund:" + sym;
  if (negHit(key)) return null;
  const data = (await getJSON("/data/" + sym + ".fund.json")) as Fund | null;
  if (!data) {
    negMark(key);
    return null;
  }
  return data;
}

/** getOpts — <SYM>.opts.json, negative-cached (most symbols are not optionable). */
export async function getOpts(sym: string): Promise<Opts | null> {
  const key = "opts:" + sym;
  if (negHit(key)) return null;
  const data = (await getJSON("/data/" + sym + ".opts.json")) as Opts | null;
  if (!data) {
    negMark(key);
    return null;
  }
  return data;
}

/**
 * getTx — fetch a gzipped transcript and inflate via DecompressionStream("gzip").
 * Graceful null when the file is absent (negative-cached) or the browser lacks gzip streams.
 */
export async function getTx(sym: string, id: string): Promise<Transcript | null> {
  const key = "tx:" + sym + ":" + id;
  if (negHit(key)) return null;
  const url = "/data/tx/" + sym + "/" + id + ".json.gz";
  try {
    const r = await fetch(url);
    if (!r.ok || !r.body) {
      negMark(key);
      return null;
    }
    // DecompressionStream is standard in modern browsers; guard for older ones.
    const DS = (globalThis as any).DecompressionStream;
    if (typeof DS !== "function") {
      negMark(key);
      return null;
    }
    const stream = r.body.pipeThrough(new DS("gzip"));
    const text = await new Response(stream).text();
    return JSON.parse(text) as Transcript;
  } catch {
    negMark(key);
    return null;
  }
}

/**
 * getBars — re-export the chart's OHLC getter, normalized to Bar[].
 * The raw file is `{bars: [[date,o,h,l,c,v], ...]}`; we map to the object shape rail widgets use.
 * Shares dataCache's inflight fetch with ChartPanel (never a third raw fetch).
 */
export async function getBars(sym: string): Promise<Bar[]> {
  const raw = await getOhlc(sym);
  const rows: any[] = raw?.bars ?? [];
  if (!Array.isArray(rows)) return [];
  return rows.map((b) =>
    Array.isArray(b)
      ? { time: b[0], o: b[1], h: b[2], l: b[3], c: b[4], v: b[5] }
      : { time: b.time ?? b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v }
  );
}

/** Test/HMR hook — clear the negative cache. */
export function _clearNegCache(): void {
  negCache.clear();
}
