/**
 * finStatementMath — the statement arithmetic every financials surface shares.
 *
 * WHY THIS MODULE EXISTS (two reasons, both defects):
 *
 *  1. NORMALIZATION MUST BE MARKET-AWARE, NOT PATTERN-MATCHED. Quarterly income used to be
 *     routed through a cumulative-YTD detector that looked only at the VALUES: if revenue
 *     rose in 2 of 3 quarters across 2 of the trailing 3 fiscal years, the whole income
 *     statement was differenced. That heuristic was dormant only because it also required
 *     ≥8 quarterly periods and every US name carried exactly 5. The Massive backfill takes
 *     US names to ~69 quarters, at which point ordinary secular growth (NVDA, MSFT — live
 *     revenue is strictly rising) satisfies the pattern and the tab prints as-reported
 *     69.6B as 4.0B on every income row.
 *
 *     US filings on this path are discrete-quarter BY CONSTRUCTION: the 10-Q income
 *     statement reports the quarter, and the vendor's XBRL rows carry the same. So the gate
 *     is now the issuer's MARKET, not the shape of its numbers — differencing is
 *     structurally unreachable outside the markets that genuinely file cumulative
 *     year-to-date interims. No amount of growth can turn it on for a US filer.
 *
 *  2. ONE SERIES, EVERY SURFACE. The mini bar chart read `set.income.*` raw while the table
 *     read a differenced copy, so the same quarter could plot at 82.9B and print at 1.6B.
 *     `incomeView()` is now the single normalization point: the chart, the table, and the
 *     Revenue tab's history all read the SAME arrays out of it (reference-identical — see
 *     `incomeChartValues`), so they cannot drift apart again.
 *
 * Pure, dependency-light, and in `lib/` on purpose: vitest only collects
 * `lib/__tests__/**` (terminal/vitest.config.ts), so component-private math is untestable
 * by construction. Anything here can be pinned; anything left in the page cannot.
 */
import type { IncomeBlock, NumArr, StatementPeriodSet } from "./fund";
import { marketOf, type MarketId } from "./markets";

export type StatementMarket = MarketId;

/**
 * Markets whose INTERIM statements are filed cumulative year-to-date, so a "quarter" column
 * holds the year so far and only differencing recovers the discrete quarter.
 *
 * Mainland-China (tushare, `gen_fund_cn.py`) and Hong Kong (akshare, `gen_fund_hk.py`)
 * report this way. US filings (yfinance + the Massive/XBRL backfill), Canada, and the
 * international tail report the period itself. Adding a market here is a deliberate act:
 * it turns differencing ON for every income row of every name in that market.
 */
export const CUMULATIVE_YTD_MARKETS: readonly MarketId[] = ["cn", "hk"] as const;
const CUMULATIVE_SET = new Set<string>(CUMULATIVE_YTD_MARKETS);

/**
 * The market whose filing conventions govern a symbol's statements.
 *
 * Delegates to `markets.marketOf` — the same classification search and the data-fetch router
 * use — rather than growing a third copy of the suffix table. An unknown or empty symbol
 * resolves to "us", which is the SAFE default here: "us" never differences.
 */
export function statementMarket(sym: string | null | undefined): MarketId {
  return marketOf((sym ?? "").trim());
}

/** True when this symbol's market files cumulative year-to-date interim statements. */
export function filesCumulativeQuarters(sym: string | null | undefined): boolean {
  return CUMULATIVE_SET.has(statementMarket(sym));
}

/**
 * Shape check for a cumulative year-to-date quarterly array — the SECOND gate, never the
 * first. Reached only for markets in `CUMULATIVE_YTD_MARKETS`, where it exists to catch a
 * feed that has already been differenced upstream (differencing twice is as wrong as not
 * differencing at all) rather than to discover cumulative reporting on its own.
 *
 * Within each of the trailing 3 fiscal years (4-period blocks from the newest end), count
 * the non-decreasing Q→Q transitions; 2 of 3 in at least 2 years reads as cumulative.
 */
export function isCumulativeShape(vals: NumArr | undefined): boolean {
  if (!vals || vals.length < 8) return false;
  let cumulativeYears = 0;
  const n = vals.length;
  for (let yr = 0; yr < 3; yr++) {
    const base = n - (yr + 1) * 4;
    if (base < 0) break;
    const q = [vals[base], vals[base + 1], vals[base + 2], vals[base + 3]];
    if (q.some((v) => v == null)) continue;
    let risingCount = 0;
    for (let i = 1; i < 4; i++) {
      if ((q[i] as number) >= (q[i - 1] as number)) risingCount++;
    }
    if (risingCount >= 2) cumulativeYears++;
  }
  return cumulativeYears >= 2;
}

/**
 * Fiscal-year token from a period label, for detecting a year boundary the labels cross
 * without a "Q1" column. Both label shapes in the contract end in the year:
 * "Q1 2023" (CN/HK generators) → "2023", "Q3 '26" (US backfill) → "26". Compared for
 * equality only — never parsed into a date — so the two shapes never have to agree.
 */
function fiscalYearToken(label: string | undefined): string | null {
  const m = /(\d{2,4})\s*$/.exec(label ?? "");
  return m ? m[1] : null;
}

/**
 * Cumulative year-to-date quarters → discrete quarters, oldest→newest.
 *
 * A cell is emitted ONLY when its cumulative base is known:
 *   • label starts with "Q1"            → as-is (Q1 IS the first quarter of the fiscal year)
 *   • same fiscal year as the prior cell → raw[i] − raw[i−1]
 *   • otherwise (array starts mid-year, or a year boundary with no Q1 column) → null
 *
 * WHAT CHANGED AND WHY: this used to fall back to the RAW cumulative value both when the
 * difference came out negative (`d >= 0 ? d : cur`) and whenever a base was missing. That
 * put a year-to-date total in the same row as discrete quarters, under one label, with no
 * tell — the reader cannot see which cells are which. Two consequences, both wrong:
 * a genuine loss quarter (cumulative net income legitimately FALLS) was overwritten by the
 * year-to-date figure, and every undifferenceable leading period printed a total as a
 * quarter. A negative difference is now emitted as the negative quarter it is, and an
 * unknown base shows a dash — the house stance is a dash over a number we cannot stand
 * behind.
 */
export function discreteQuarters(vals: NumArr, periods: readonly string[]): NumArr {
  const out: NumArr = [];
  for (let i = 0; i < vals.length; i++) {
    const label = periods[i] ?? "";
    if (label.startsWith("Q1")) {
      out.push(vals[i] ?? null);
      continue;
    }
    const yr = fiscalYearToken(label);
    const prevYr = i > 0 ? fiscalYearToken(periods[i - 1]) : null;
    // i === 0, or a fiscal year we entered without seeing its Q1 → no base to difference.
    if (i === 0 || yr == null || prevYr == null || yr !== prevYr) {
      out.push(null);
      continue;
    }
    const cur = vals[i];
    const prev = vals[i - 1];
    out.push(cur != null && prev != null ? cur - prev : null);
  }
  return out;
}

/** Every field of the income contract, so normalization can never skip one. */
const INCOME_FIELDS: readonly (keyof IncomeBlock)[] = [
  "revenue",
  "cogs",
  "gross_profit",
  "opex",
  "op_income",
  "nonop_income",
  "pretax_income",
  "taxes",
  "net_income",
  "eps_basic",
  "eps_diluted",
  "ebitda",
] as const;

const EMPTY_INCOME: IncomeBlock = INCOME_FIELDS.reduce((acc, k) => {
  acc[k] = [];
  return acc;
}, {} as IncomeBlock);

/**
 * Operating expenses EXCLUDING cost of revenue, derived rather than trusted.
 *
 * The contract's `opex` field is not one thing: `gen_fund_us.py` maps it from yfinance's
 * "Operating Expense" (already excludes cost of revenue) with "Total Expenses" as the
 * SECONDARY label (COGS-inclusive), and the Massive backfill maps it from the vendor's
 * `operating_expenses`. Rendering the raw field under an "excl. COGS" label therefore ships
 * a COGS-inclusive total under a label that says it is not, on exactly the rows where we
 * cannot tell which variant we got. Subtracting COGS from it unconditionally is the mirror
 * mistake — that is what printed AAPL FY2025 at −158.8B before this row was derived.
 *
 * Two source-agnostic identities, in order, then a dash:
 *   1. gross_profit − op_income          (AAPL FY2025: 195.2B − 133.1B = 62.1B, as reported)
 *   2. revenue − cogs − op_income        (same identity where gross_profit itself is null)
 *   3. null                              (nothing derivable — a dash, never a guess)
 *
 * Inputs come from ONE already-normalized block, so a differenced statement can never mix a
 * discrete gross profit with a cumulative operating income.
 */
export function opexExclCogs(inc: IncomeBlock | undefined): NumArr {
  const gp = inc?.gross_profit ?? [];
  const oi = inc?.op_income ?? [];
  const rev = inc?.revenue ?? [];
  const cogs = inc?.cogs ?? [];
  const n = Math.max(gp.length, oi.length, rev.length, cogs.length);
  const out: NumArr = [];
  for (let i = 0; i < n; i++) {
    const o = oi[i];
    if (o == null) {
      out.push(null);
      continue;
    }
    const g = gp[i];
    if (g != null) {
      out.push(g - o);
      continue;
    }
    const r = rev[i];
    const c = cogs[i];
    out.push(r != null && c != null ? r - c - o : null);
  }
  return out;
}

/**
 * The income statement every income surface renders, normalized once.
 *
 * `income` is the block to display: the raw contract arrays for a discrete-quarter market
 * (same array references — nothing is copied), or the differenced arrays for a cumulative
 * one. `opexExclCogs` is the derived row, built from that same block.
 */
export interface IncomeView {
  /** Market whose filing conventions were applied. */
  market: MarketId;
  /** True when the columns on screen were derived by differencing cumulative YTD totals. */
  cumulative: boolean;
  income: IncomeBlock;
  opexExclCogs: NumArr;
}

/**
 * Normalize a period set's income statement for display.
 *
 * `cumulative` requires BOTH gates: the symbol's market files cumulative year-to-date
 * interims, AND the timeframe is quarterly, AND the revenue series still looks cumulative.
 * A US symbol can never satisfy the first, whatever its numbers do.
 */
export function incomeView(
  sym: string | null | undefined,
  set: StatementPeriodSet | undefined,
  timeframe: "annual" | "quarterly",
): IncomeView {
  const market = statementMarket(sym);
  const src = set?.income;
  const periods = set?.periods ?? [];
  const cumulative =
    timeframe === "quarterly" &&
    CUMULATIVE_SET.has(market) &&
    isCumulativeShape(src?.revenue);

  if (!src) return { market, cumulative: false, income: EMPTY_INCOME, opexExclCogs: [] };

  const income = {} as IncomeBlock;
  for (const k of INCOME_FIELDS) {
    const arr = (src[k] as NumArr | undefined) ?? [];
    income[k] = cumulative ? discreteQuarters(arr, periods) : arr;
  }
  return { market, cumulative, income, opexExclCogs: opexExclCogs(income) };
}

/**
 * The five series the mini bar chart plots, taken straight off the normalized block.
 *
 * Returns REFERENCES, not copies: the array the chart plots is the same object the table
 * prints, so "chart says 82.9B, table says 1.6B" cannot recur. Pinned by reference equality
 * in lib/__tests__/finStatementMath.test.ts.
 */
export function incomeChartValues(view: IncomeView): {
  revenue: NumArr;
  gross_profit: NumArr;
  op_income: NumArr;
  pretax_income: NumArr;
  net_income: NumArr;
} {
  return {
    revenue: view.income.revenue,
    gross_profit: view.income.gross_profit,
    op_income: view.income.op_income,
    pretax_income: view.income.pretax_income,
    net_income: view.income.net_income,
  };
}

/**
 * The disclosure line for a differenced quarterly income statement, or null when nothing was
 * differenced. Names the market whose convention is being described — the old copy asserted
 * "(CN/HK reporting style)" and would have shown that sentence on a US filer's tab.
 */
export function cumulativeQuarterNote(view: IncomeView, zh: boolean): string | null {
  if (!view.cumulative) return null;
  if (view.market === "cn") {
    return zh
      ? "中国内地财报按年初至今累计口径披露，季度数据由相邻期差分得出；缺少累计基数的季度显示为短横线。"
      : "Quarterly figures are differenced from the cumulative year-to-date totals mainland-China filings report; a quarter with no cumulative base shows a dash.";
  }
  if (view.market === "hk") {
    return zh
      ? "香港财报按年初至今累计口径披露，季度数据由相邻期差分得出；缺少累计基数的季度显示为短横线。"
      : "Quarterly figures are differenced from the cumulative year-to-date totals Hong Kong filings report; a quarter with no cumulative base shows a dash.";
  }
  // Unreachable while CUMULATIVE_YTD_MARKETS is {cn, hk}; a market added there without copy
  // shows no note rather than a sentence about somebody else's filing convention.
  return null;
}
