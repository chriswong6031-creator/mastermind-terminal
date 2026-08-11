/**
 * finSeries — the series financial surfaces DERIVE from an income statement.
 *
 * `finStatementMath.incomeView` decides WHICH numbers a surface may show (raw for a
 * discrete-quarter market, differenced for a cumulative year-to-date one). This module holds
 * the arithmetic performed ON those numbers — the ratios a chart plots next to the bars.
 *
 * WHY IT IS NOT INSIDE THE COMPONENTS: a ratio computed in a page is a second copy of the
 * defect. `FinancialsMini` (StockAnalysis) and the Overview "Performance" combo both plotted a
 * net-margin line, each with its own inline `ni / rev * 100`; a surface that normalized only
 * the bars would have kept dividing a differenced net income by a year-to-date revenue and
 * printed a margin that belongs to neither. Both callers now pass ONE already-normalized block
 * to ONE function, so a mixed-basis ratio has nowhere to form.
 *
 * Pure, dependency-light, and in `lib/` on purpose: vitest only collects `lib/__tests__/**`
 * (terminal/vitest.config.ts), so a derivation left in a page cannot be pinned by a test.
 */
import type { IncomeBlock, NumArr } from "./fund";

/**
 * Net margin, in PERCENT, per period: `net_income / revenue × 100`.
 *
 * Both arrays must come from the SAME `incomeView` block — that is the whole point. A period is
 * null wherever revenue is missing or zero (no margin exists) or net income is missing.
 */
export function netMarginPct(revenue: NumArr, netIncome: NumArr): NumArr {
  return revenue.map((rev, i) => {
    const ni = netIncome[i];
    return rev && ni != null ? (ni / rev) * 100 : null;
  });
}

/**
 * "P/S (at current mkt cap)" per period: CURRENT mktcap / revenue[i].
 *
 * This is NOT a historical valuation — past market caps aren't in the contract, so mktcap is
 * held constant and the caller's series name + chart note make that basis explicit. `periods`
 * only sets the length of the all-null series shown when no market cap is known.
 *
 * `revenue` must be the normalized array (`incomeView(...).income.revenue`): dividing a market
 * cap by a cumulative year-to-date total produces a P/S that no quarter ever had.
 */
export function priceToSalesSeries(
  revenue: NumArr,
  mktcap: number | null,
  periods: readonly string[] = [],
): NumArr {
  if (mktcap == null) return periods.map(() => null);
  return revenue.map((rev) => (rev && rev > 0 ? mktcap / rev : null));
}

/**
 * The signed waterfall delta carrying GROSS PROFIT to OPERATING INCOME, for period `i`.
 *
 * Named and exported for one reason: this is the seam that was wrong. The Overview waterfall
 * derived it inline as `-Math.abs(opex - cogs)`, the "mirror mistake" finStatementMath's header
 * describes — the contract's `opex` already excludes cost of revenue, so subtracting COGS again
 * printed AAPL FY2025 at −158.8B against a true 62.2B, and the bridge did not close. A component
 * -private one-liner cannot be pinned by a test (vitest only collects `lib/__tests__/**`), so the
 * arithmetic lives here where it can be, and the page has nowhere left to reinvent it.
 *
 * Takes `incomeView(...).opexExclCogs` — the derived row, never the raw `opex` field.
 *
 * Deliberately NOT `Math.abs`: a waterfall step is a signed contribution (positive = rise), and
 * the honest delta is `-opexExclCogs`. Operating expenses that net negative (operating income
 * above gross profit — large other operating income) are drawn as the rise they are, and the
 * bridge still closes: `gross_profit + step === op_income`.
 */
export function opExpenseStep(opexExclCogs: NumArr, i: number): number | null {
  const v = opexExclCogs[i];
  return v != null && isFinite(v) ? -v : null;
}

export type IncomeBridgeKey =
  | "revenue"
  | "to_gross_profit"
  | "gross_profit"
  | "to_operating_income"
  | "operating_income"
  | "to_pretax_income"
  | "pretax_income"
  | "to_net_income"
  | "net_income";

export interface IncomeBridgeStep {
  key: IncomeBridgeKey;
  value: number;
  total?: boolean;
}

function finiteAt(values: NumArr | undefined, index: number): number | null {
  const value = values?.[index];
  return value != null && Number.isFinite(value) ? value : null;
}

/**
 * A closing revenue-to-net-income bridge built exclusively from reported subtotals.
 *
 * Each contribution is the signed delta between adjacent subtotals. That makes tax benefits and
 * unusual non-operating gains rises instead of forcing them negative with `Math.abs`, and it makes
 * closure an identity rather than a visual hope. If any load-bearing subtotal is unavailable the
 * bridge fails closed; financial-family callers suppress this industrial presentation entirely.
 */
export function incomeBridgeSteps(inc: IncomeBlock, index: number): IncomeBridgeStep[] {
  const revenue = finiteAt(inc.revenue, index);
  const gross = finiteAt(inc.gross_profit, index);
  const operating = finiteAt(inc.op_income, index);
  const pretax = finiteAt(inc.pretax_income, index);
  const net = finiteAt(inc.net_income, index);
  if (revenue == null || gross == null || operating == null || pretax == null || net == null) {
    return [];
  }
  return [
    { key: "revenue", value: revenue, total: true },
    { key: "to_gross_profit", value: gross - revenue },
    { key: "gross_profit", value: gross, total: true },
    { key: "to_operating_income", value: operating - gross },
    { key: "operating_income", value: operating, total: true },
    { key: "to_pretax_income", value: pretax - operating },
    { key: "pretax_income", value: pretax, total: true },
    { key: "to_net_income", value: net - pretax },
    { key: "net_income", value: net, total: true },
  ];
}
