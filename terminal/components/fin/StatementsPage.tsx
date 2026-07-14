"use client";
/**
 * StatementsPage — the TradingView "Financials · Statements" tab (BUILD-SPEC
 * §3.4 FE2a, spec/statements-transcript.md). Content stack:
 *   1. Mini bar-chart strip (series swap with the statement type — §1.2)
 *   2. Statement-type pills (Income / Balance / Cash flow) + Annual/Quarterly
 *   3. Full <MiniTable> with the TV row taxonomy (§4–6), PoP%/YoY% sub-values,
 *      and a documents row: a doc-icon per period that HAS a transcript (tx id),
 *      opening the TranscriptDrawer.
 *
 * Transcript ids live on fund.earnings.q[].tx — we map each statement period to
 * its fiscal end-date → the matching earnings quarter → its tx id. Annual
 * columns map to the fiscal-year-end quarter. Icon renders only when a tx exists
 * (absence IS the empty state — §7.5).
 */
import { useMemo, useState } from "react";
import { useLang } from "../../lib/i18n";
import { pick, fmtNum } from "../../lib/finFormat";
import type { Fund, StatementPeriodSet } from "../../lib/fund";
import { Bars, MiniTable, type Series, type MiniRow } from "./FinCharts";

export interface StatementsPageProps {
  sym: string;
  fund: Fund | null;
  name?: string | null;
  /** Open the transcript drawer for a defeatbeta fiscal id. */
  onOpenTx: (txId: string) => void;
}

type Stmt = "income" | "balance" | "cashflow";
type AQ = "annual" | "quarterly";

export default function StatementsPage({ sym, fund, onOpenTx }: StatementsPageProps) {
  const { lang } = useLang();
  const zh = lang === "zh";
  const [stmt, setStmt] = useState<Stmt>("income");
  const [aq, setAQ] = useState<AQ>("annual");

  // period-end → tx id. Quarterly columns match a quarter's end-date exactly.
  // Annual columns carry the fiscal-YEAR end (e.g. "2026-07-31") which need not
  // string-equal any quarter's end; we map the FY to the LAST quarter that ends
  // in that fiscal year (its Q4 transcript) rather than requiring exact equality.
  // NOTE: these hooks MUST run before any early return — `fund` flips null↔loaded
  // while this pane stays mounted across symbol switches (MegaPane has no key),
  // and a conditional-hook order change would crash the whole route.
  const txQuarters = useMemo(() => {
    // quarters carrying a tx, sorted oldest→newest by end-date
    return (fund?.earnings?.q ?? [])
      .filter((q): q is typeof q & { end: string; tx: string } => !!q.end && !!q.tx)
      .sort((a, b) => a.end.localeCompare(b.end));
  }, [fund?.earnings]);
  const txByEnd = useMemo(() => {
    const m = new Map<string, string>();
    for (const q of txQuarters) m.set(q.end, q.tx);
    return m;
  }, [txQuarters]);

  if (!fund) {
    return (
      <div className="fin-empty fin-empty-lg" role="status">
        <div className="fin-empty-title">{pick(zh, "No statements yet", "暂无财务报表")}</div>
        <div>{pick(zh, `Financial statements for ${sym} haven't been collected yet.`, `${sym} 的财务报表尚未采集。`)}</div>
      </div>
    );
  }

  const set: StatementPeriodSet | undefined = aq === "annual" ? fund.statements?.annual : fund.statements?.quarterly;
  const periods = set?.periods ?? [];
  const txForPeriod = (i: number): string | null => {
    const end = set?.period_end?.[i];
    if (!end) return null;
    // exact end-date hit (quarterly, or an annual whose FY-end coincides)
    const exact = txByEnd.get(end);
    if (exact) return exact;
    if (aq !== "annual") return null;
    // annual: last quarter ending in the same fiscal year as this FY-end
    const fyYear = end.slice(0, 4);
    let best: string | null = null;
    for (const q of txQuarters) if (q.end.slice(0, 4) === fyYear && q.end <= end) best = q.tx;
    return best;
  };

  // ── mini bar-chart strip: series swap with statement type ──
  // Cap the chart to the last 12 periods so quarterly sets (which can carry 20+
  // columns) don't crush the x-axis; the full-history MiniTable below stays paged.
  const CHART_CAP = 12;
  const chartPeriods = periods.slice(-CHART_CAP);
  const chartSeries: Series[] = buildChartSeries(stmt, set, zh).map((s) => ({
    ...s,
    values: s.values.slice(-CHART_CAP),
  }));

  // ── table rows: TV taxonomy per statement ──
  const rows: MiniRow[] = buildRows(stmt, set, aq, zh);

  // Detect cumulative quarterly income for disclosure note
  const showCumNote = aq === "quarterly" && stmt === "income" && set != null && isCumulative(set.income.revenue);

  const curLabel = `${pick(zh, "Currency:", "货币:")} ${fund.stmt_currency || "USD"}`;
  const isEps = (label: string) => label.toLowerCase().includes("eps") || label.includes("每股");

  return (
    <div className="fin-stmts">
      {/* ── 1. MINI CHART STRIP ── */}
      <section className="fin-sec">
        <div className="fin-card">
          <Bars labels={chartPeriods} series={chartSeries} fmtY={fmtNum} zh={zh} height={170} />
        </div>
      </section>

      {/* ── 2. CONTROLS: statement pills + A/Q ── */}
      <div className="fin-stmt-ctrl">
        <div className="fin-toggle fin-stmt-pills">
          <button className={stmt === "income" ? "on" : ""} onClick={() => setStmt("income")}>
            {pick(zh, "Income statement", "利润表")}
          </button>
          <button className={stmt === "balance" ? "on" : ""} onClick={() => setStmt("balance")}>
            {pick(zh, "Balance sheet", "资产负债表")}
          </button>
          <button className={stmt === "cashflow" ? "on" : ""} onClick={() => setStmt("cashflow")}>
            {pick(zh, "Cash flow", "现金流量表")}
          </button>
        </div>
        <div className="fin-toggle fin-aq">
          <button className={aq === "annual" ? "on" : ""} onClick={() => setAQ("annual")}>
            {pick(zh, "Annual", "年度")}
          </button>
          <button className={aq === "quarterly" ? "on" : ""} onClick={() => setAQ("quarterly")}>
            {pick(zh, "Quarterly", "季度")}
          </button>
        </div>
      </div>

      {/* ── documents row: doc-icon per period that has a transcript ── */}
      {periods.length > 0 && (
        <div className="fin-doc-strip" role="group" aria-label={pick(zh, "Earnings call transcripts", "财报电话会记录")}>
          <span className="fin-doc-strip-lbl">{pick(zh, "Transcripts", "记录")}</span>
          <div className="fin-doc-strip-cells">
            {periods.map((p, i) => {
              const tx = txForPeriod(i);
              return (
                <span className="fin-doc-cell" key={i}>
                  <span className="fin-doc-per">{p}</span>
                  {tx ? (
                    <button
                      className="fin-doc-icon"
                      onClick={() => onOpenTx(tx)}
                      aria-label={pick(zh, `Open ${p} transcript`, `打开 ${p} 记录`)}
                      title={pick(zh, "Earnings call transcript", "财报电话会记录")}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden>
                        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
                        <path d="M14 3v5h5M9 13h6M9 17h6" />
                      </svg>
                    </button>
                  ) : (
                    <span className="fin-doc-none" aria-hidden>
                      ·
                    </span>
                  )}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* ── 3. DATA TABLE ── */}
      <section className="fin-sec">
        {showCumNote && (
          <div className="fin-chart-note" style={{ marginBottom: 8, marginTop: 0 }}>
            {pick(zh,
              "Quarterly figures derived by differencing cumulative year-to-date values (CN/HK reporting style).",
              "季度数据由累计年初至今数据差分得出（中国/香港报表惯例）。"
            )}
          </div>
        )}
        <MiniTable
          periods={periods}
          rows={rows}
          fmt={fmtNum}
          showChange
          pageSize={aq === "annual" ? 6 : 6}
          zh={zh}
          cornerLabel={curLabel}
        />
      </section>

      <div className="fin-ov-cur">{curLabel}</div>
    </div>
  );
}

/* ── mini-chart series per statement type (§1.2) ── */
function buildChartSeries(stmt: Stmt, set: StatementPeriodSet | undefined, zh: boolean): Series[] {
  if (!set) return [];
  const inc = set.income,
    bal = set.balance,
    cf = set.cashflow;
  if (stmt === "income")
    return [
      { name: pick(zh, "Total revenue", "总营收"), values: inc.revenue, color: "var(--brand)" },
      { name: pick(zh, "Gross profit", "毛利"), values: inc.gross_profit, color: "var(--up)" },
      { name: pick(zh, "Operating income", "营业利润"), values: inc.op_income, color: "var(--warn)" },
      { name: pick(zh, "Pretax income", "税前利润"), values: inc.pretax_income, color: "var(--brand-2)" },
      { name: pick(zh, "Net income", "净利润"), values: inc.net_income, color: "var(--code-fn)" },
    ];
  if (stmt === "balance")
    return [
      { name: pick(zh, "Total assets", "总资产"), values: bal.assets, color: "var(--brand)" },
      { name: pick(zh, "Total liabilities", "总负债"), values: bal.liabilities, color: "var(--up)" },
    ];
  return [
    { name: pick(zh, "Operating", "经营活动"), values: cf.cfo, color: "var(--brand)" },
    { name: pick(zh, "Investing", "投资活动"), values: cf.cfi, color: "var(--up)" },
    { name: pick(zh, "Financing", "筹资活动"), values: cf.cff, color: "var(--warn)" },
  ];
}

/* ── period-over-period % (annual) / YoY % (quarterly, lag 4) ── */
function changeSeries(vals: (number | null)[], aq: AQ): (number | null)[] {
  const lag = aq === "quarterly" ? 4 : 1;
  return vals.map((v, i) => {
    const prev = vals[i - lag];
    if (v == null || prev == null || prev === 0) return null;
    return ((v - prev) / Math.abs(prev)) * 100;
  });
}

/**
 * Detect whether a quarterly income array is cumulative year-to-date (CN/HK style).
 * Heuristic: within each fiscal year (4-quarter groups from the end), check if
 * consecutive same-year values are non-decreasing (monotonic). If at least 2 of
 * 3 possible Q1→Q2, Q2→Q3, Q3→Q4 transitions are non-decreasing for 2+ years,
 * we treat it as cumulative. This avoids incorrectly flagging US data where
 * revenues happen to be seasonal-monotonic.
 *
 * Only applied to income statement rows (revenue, gross profit, etc.) — balance
 * sheet rows are period-end snapshots and should never be differenced.
 */
function isCumulative(vals: (number | null)[]): boolean {
  if (!vals || vals.length < 8) return false;
  let cumulativeYears = 0;
  // Walk backward in groups of 4 (Q4→Q1 newest-first in the slice window)
  // We work oldest-first since the array is usually oldest→newest
  const n = vals.length;
  // Try up to 3 years worth of data from the end
  for (let yr = 0; yr < 3; yr++) {
    const base = n - (yr + 1) * 4;
    if (base < 0) break;
    // Q1=base, Q2=base+1, Q3=base+2, Q4=base+3
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
 * Convert a cumulative YTD quarterly array to discrete quarters.
 * Resets the cumulative base at each period whose label starts with 'Q1'
 * (the true fiscal-year boundary), not at array-index % 4.
 *
 * Algorithm: for each position i —
 *   - if periods[i] starts with 'Q1': discrete = raw (new fiscal year starts fresh)
 *   - otherwise: discrete = raw[i] − raw[i−1]  (difference from prior cumulative)
 *   - if no 'Q1' has been seen yet (leading partial-year): keep raw as-is
 *
 * Guard: a difference that would produce a clearly erroneous result (e.g. the
 * raw current value is less than the raw prior value by more than 50% — which
 * should not happen within a fiscal year for revenue/income) falls back to the
 * raw value rather than emitting a large negative.
 */
function discreteQuarters(vals: (number | null)[], periods: string[]): (number | null)[] {
  const out: (number | null)[] = [...vals];
  let sawQ1 = false;
  for (let i = 0; i < vals.length; i++) {
    const label = periods[i] ?? "";
    if (label.startsWith("Q1")) {
      // Q1 is always as-is (it IS the first quarter of the fiscal year)
      sawQ1 = true;
      out[i] = vals[i];
    } else if (sawQ1) {
      // Q2/Q3/Q4: difference from prior cumulative period
      const cur = vals[i];
      const prev = vals[i - 1];
      if (cur != null && prev != null) {
        const d = cur - prev;
        // If the difference is negative (data quality issue or fiscal anomaly),
        // keep the raw value rather than emitting a broken negative.
        out[i] = d >= 0 ? d : cur;
      }
    }
    // else: leading periods before first Q1 — keep raw as-is (can't difference)
  }
  return out;
}

/* ── TV row taxonomy per statement (§4–6) ── */
function buildRows(stmt: Stmt, set: StatementPeriodSet | undefined, aq: AQ, zh: boolean): MiniRow[] {
  if (!set) return [];
  const inc = set.income,
    bal = set.balance,
    cf = set.cashflow;
  const epsFmt = (v: number) => fmtNum(v, { decimals: 2 });
  const periods = set.periods ?? [];

  // Detect and fix cumulative YTD quarterly income data (CN/HK reporting style).
  // Only applied in quarterly mode to income-statement series.
  // EPS rows must also be differenced when cumulative to stay internally consistent
  // with the revenue/net_income rows (Defect 2 fix).
  const cumDetected = aq === "quarterly" && stmt === "income" && isCumulative(inc.revenue);
  const d = cumDetected
    ? (v: (number | null)[]) => discreteQuarters(v, periods)
    : (v: (number | null)[]) => v;

  const mk = (label: string, values: (number | null)[], opts?: Partial<MiniRow>): MiniRow => ({
    label,
    values,
    change: changeSeries(values, aq),
    ...opts,
  });

  if (stmt === "income") {
    const rows: MiniRow[] = [
      mk(pick(zh, "Total revenue", "总营收"), d(inc.revenue), { bold: true }),
      mk(pick(zh, "Cost of goods sold", "营业成本"), d(inc.cogs)),
      mk(pick(zh, "Gross profit", "毛利"), d(inc.gross_profit), { bold: true }),
      mk(pick(zh, "Operating expenses (excl. COGS)", "营业费用（不含成本）"), diff(d(inc.opex), d(inc.cogs))),
      mk(pick(zh, "Operating income", "营业利润"), d(inc.op_income), { bold: true }),
      mk(pick(zh, "Non-operating income (total)", "营业外收入（合计）"), d(inc.nonop_income)),
      mk(pick(zh, "Pretax income", "税前利润"), d(inc.pretax_income), { bold: true }),
      mk(pick(zh, "Taxes", "税项"), d(inc.taxes)),
      mk(pick(zh, "Net income", "净利润"), d(inc.net_income), { bold: true }),
      mk(pick(zh, "EBITDA", "EBITDA"), d(inc.ebitda)),
      // EPS rows must also be differenced (same d() wrapper) so they are internally
      // consistent with revenue / net income in cumulative CN/HK quarterly statements.
      { label: pick(zh, "Basic EPS", "基本每股收益"), values: d(inc.eps_basic), fmt: epsFmt },
      { label: pick(zh, "Diluted EPS", "稀释每股收益"), values: d(inc.eps_diluted), fmt: epsFmt },
    ];
    return rows;
  }

  if (stmt === "balance")
    return [
      mk(pick(zh, "Total assets", "总资产"), bal.assets, {
        bold: true,
        children: [
          mk(pick(zh, "Current assets", "流动资产"), bal.assets_st, { depth: 1 }),
          mk(pick(zh, "Non-current assets", "非流动资产"), bal.assets_lt, { depth: 1 }),
        ],
      }),
      mk(pick(zh, "Total liabilities", "总负债"), bal.liabilities, {
        bold: true,
        children: [
          mk(pick(zh, "Current liabilities", "流动负债"), bal.liab_st, { depth: 1 }),
          mk(pick(zh, "Non-current liabilities", "非流动负债"), bal.liab_lt, { depth: 1 }),
        ],
      }),
      mk(pick(zh, "Total equity", "股东权益"), bal.equity, { bold: true }),
      { label: pick(zh, "Total debt", "总债务"), values: bal.debt },
      { label: pick(zh, "Net debt", "净债务"), values: bal.net_debt },
      { label: pick(zh, "Cash & equivalents", "现金及等价物"), values: bal.cash },
    ];

  return [
    mk(pick(zh, "Cash flow from operating activities", "经营活动现金流"), cf.cfo, { bold: true }),
    mk(pick(zh, "Cash flow from investing activities", "投资活动现金流"), cf.cfi, { bold: true }),
    mk(pick(zh, "Cash flow from financing activities", "筹资活动现金流"), cf.cff, { bold: true }),
    { label: pick(zh, "Capital expenditure", "资本支出"), values: cf.capex },
    { label: pick(zh, "Free cash flow", "自由现金流"), values: cf.fcf },
  ];
}

/** element-wise a-b, null-preserving. */
function diff(a: (number | null)[], b: (number | null)[]): (number | null)[] {
  return (a || []).map((v, i) => {
    const w = b?.[i];
    return v != null && w != null ? v - w : v ?? null;
  });
}
