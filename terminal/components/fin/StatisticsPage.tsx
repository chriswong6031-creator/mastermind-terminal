"use client"
/**
 * StatisticsPage — TradingView-parity Statistics tab (BUILD-SPEC §3.4 FE2b,
 * spec/stats-earn-rev-div.md §1). P/E + P/S bar chart at top; Key stats rows;
 * Valuation-ratios table with live 'Current' column; Profitability-ratios group.
 *
 * Props: {fund, quote, zh}
 * - fund: Fund | null — null renders a graceful empty state
 * - quote: { last: number | null } | null — provides the 'Current' column price
 * - zh: boolean — language selector
 */
import type { Fund, RatiosCurrent } from "../../lib/fund"
import { fmtNum, fmtPct, pick } from "../../lib/finFormat"
import { Bars, type Series } from "./FinCharts"

// ── prop types ──────────────────────────────────────────────────────────────

export interface StatisticsPageProps {
  fund: Fund | null
  quote?: { last: number | null } | null
  zh?: boolean
}

// ── helpers ─────────────────────────────────────────────────────────────────

function n2(v: number | null | undefined): string {
  return v != null && isFinite(v) ? v.toFixed(2) : "—"
}

// ── ValuationRow definition ──────────────────────────────────────────────────

interface StatRow {
  label: string
  values: (number | null)[]
  current?: number | null
  /** Optional custom formatter */
  fmt?: (v: number) => string
}

// ── main component ──────────────────────────────────────────────────────────

export default function StatisticsPage({ fund, quote, zh }: StatisticsPageProps) {
  if (!fund) {
    return (
      <div className="fin-body">
        <div className="fin-empty fin-empty-lg" role="status">
          <span className="fin-empty-title">{pick(!!zh, "No statistics data", "暂无统计数据")}</span>
        </div>
      </div>
    )
  }

  const cur = fund.ratios?.current ?? ({} as RatiosCurrent)

  // ── top bar chart: P/E + P/S per period ──
  // fund.json v1 carries ANNUAL ratio series only — there is no per-quarter ratio
  // data — so this page is annual-only (the Annual/Quarterly toggle was removed).
  const rPeriods = fund.ratios?.periods ?? []
  const chartPeriods = rPeriods
  const chartSeries: Series[] = [
    {
      name: pick(!!zh, "Price to earnings ratio", "市盈率"),
      values: fund.ratios?.pe ?? [],
      color: "var(--brand)",
    },
    {
      name: pick(!!zh, "Price to sales ratio", "市销率"),
      values: fund.ratios?.ps ?? [],
      color: "var(--up)",
    },
  ]

  // ── Key stats rows ──
  // These come from fund.stats (not period-indexed by annual/quarterly in v1)
  // We show them as single current-value rows (no period array per §1.1 — stats.shares_out is a scalar)
  const sharesFmtM = (v: number | null | undefined) =>
    v != null && isFinite(v) ? (Math.abs(v) / 1e6).toFixed(2) + "M" : "—"
  const empFmt = (v: number | null | undefined) =>
    v != null && isFinite(v) ? v.toLocaleString("en-US") : "—"

  // ── Valuation rows aligned to annual ratios.periods (v1 has annual ratios only) ──
  const annualPeriods = rPeriods

  // Build a "Current" column value from live ratios
  const valRows: StatRow[] = [
    { label: pick(!!zh, "Price to earnings ratio", "市盈率"), values: fund.ratios?.pe ?? [], current: cur.pe_ttm },
    { label: pick(!!zh, "Price to sales ratio", "市销率"), values: fund.ratios?.ps ?? [], current: cur.ps },
    { label: pick(!!zh, "Price to book ratio", "市净率"), values: fund.ratios?.pb ?? [], current: cur.pb },
    { label: pick(!!zh, "Price to cash flow ratio", "市现率"), values: fund.ratios?.pcf ?? [], current: null },
    { label: pick(!!zh, "Enterprise value to EBITDA", "EV/EBITDA"), values: fund.ratios?.ev_ebitda ?? [], current: cur.ev_ebitda },
    { label: pick(!!zh, "Price to earnings forward", "预期市盈率"), values: [], current: cur.pe_fwd },
    { label: pick(!!zh, "EV to sales", "EV/销售额"), values: [], current: cur.ev_sales },
    { label: pick(!!zh, "EV to EBIT", "EV/息税前利润"), values: [], current: cur.ev_ebit },
    { label: pick(!!zh, "Price to FCF", "价格/自由现金流"), values: [], current: cur.p_fcf },
  ]

  // ── Profitability rows from ratios.current (no period series in v1) ──
  const profRows: { label: string; value: string }[] = [
    { label: pick(!!zh, "Gross margin", "毛利率"), value: cur.gross_margin != null ? fmtPct(cur.gross_margin) : "—" },
    { label: pick(!!zh, "Net margin", "净利率"), value: cur.net_margin != null ? fmtPct(cur.net_margin) : "—" },
    { label: pick(!!zh, "Return on equity", "净资产收益率"), value: cur.roe != null ? fmtPct(cur.roe) : "—" },
    { label: pick(!!zh, "Return on assets", "总资产收益率"), value: cur.roa != null ? fmtPct(cur.roa) : "—" },
    { label: pick(!!zh, "Dividend yield", "股息率"), value: cur.div_yield != null ? fmtPct(cur.div_yield) : "—" },
    { label: pick(!!zh, "Payout ratio", "派息比率"), value: cur.payout != null ? fmtPct(cur.payout) : "—" },
    { label: pick(!!zh, "Debt to equity", "债股比"), value: cur.debt_to_equity != null ? n2(cur.debt_to_equity) : "—" },
    { label: pick(!!zh, "Current ratio", "流动比率"), value: cur.current_ratio != null ? n2(cur.current_ratio) : "—" },
  ]

  // Currency label
  const ccy = fund.stmt_currency ?? "USD"

  return (
    <div className="fin-body">
      {/* ── Header ── */}
      <div className="fin-stats-hdr">
        <div className="fin-sec-h">{pick(!!zh, "Statistics", "统计数据")}</div>
        <span className="fin-stats-basis">{pick(!!zh, "Annual", "年度")}</span>
      </div>

      {/* ── Top bar chart: P/E + P/S ── */}
      <div className="fin-sec">
        <Bars
          labels={chartPeriods}
          series={chartSeries}
          fmtY={(v) => v.toFixed(2)}
          height={160}
          zh={zh}
        />
      </div>

      {/* ── Key stats ── */}
      <div className="fin-sec">
        <div className="fin-stats-meta">
          <span>{pick(!!zh, "Metrics", "指标")}</span>
          <span className="fin-stats-ccy">{pick(!!zh, "Currency: " + ccy, "货币: " + ccy)}</span>
        </div>

        <div className="fin-table-scroll">
          <table className="fin-table fin-stats-tbl">
            <thead>
              <tr>
                <th className="fin-cell fin-cell-sticky fin-cell-corner" scope="col">
                  {pick(!!zh, "Metrics", "指标")}
                </th>
                <th className="fin-cell fin-cell-num fin-cell-head" scope="col">
                  {pick(!!zh, "Current", "当前")}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="fin-row fin-stats-grp-hdr">
                <th colSpan={2} className="fin-cell fin-cell-grp" scope="rowgroup">
                  {pick(!!zh, "Key stats", "关键指标")}
                </th>
              </tr>
              <tr className="fin-row">
                <th className="fin-cell fin-cell-sticky" scope="row">
                  {pick(!!zh, "Total shares outstanding", "总股本")}
                </th>
                <td className="fin-cell fin-cell-num">{sharesFmtM(fund.stats?.shares_out)}</td>
              </tr>
              <tr className="fin-row">
                <th className="fin-cell fin-cell-sticky" scope="row">
                  {pick(!!zh, "Free float", "自由流通股本")}
                </th>
                <td className="fin-cell fin-cell-num">{sharesFmtM(fund.stats?.float_shares)}</td>
              </tr>
              <tr className="fin-row">
                <th className="fin-cell fin-cell-sticky" scope="row">
                  {pick(!!zh, "Number of employees", "员工人数")}
                </th>
                <td className="fin-cell fin-cell-num">{empFmt(fund.profile?.employees)}</td>
              </tr>
              <tr className="fin-row">
                <th className="fin-cell fin-cell-sticky" scope="row">
                  {pick(!!zh, "Number of shareholders", "股东人数")}
                </th>
                <td className="fin-cell fin-cell-num">{empFmt(fund.stats?.num_holders)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Valuation ratios (annual series + live Current column) ── */}
      <div className="fin-sec">
        <div className="fin-table-scroll">
          <table className="fin-table fin-stats-tbl">
            <thead>
              <tr>
                <th className="fin-cell fin-cell-sticky fin-cell-corner" scope="col">
                  {pick(!!zh, "Metrics", "指标")}
                </th>
                {annualPeriods.slice(-6).map((p, i) => (
                  <th key={i} className="fin-cell fin-cell-num fin-cell-head" scope="col">{p}</th>
                ))}
                <th className="fin-cell fin-cell-num fin-cell-head fin-cell-current" scope="col">
                  {pick(!!zh, "Current", "当前")}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="fin-row fin-stats-grp-hdr">
                <th colSpan={annualPeriods.slice(-6).length + 2} className="fin-cell fin-cell-grp" scope="rowgroup">
                  {pick(!!zh, "Valuation ratios", "估值比率")}
                </th>
              </tr>
              {valRows.map((row, ri) => {
                const periodSlice = row.values.slice(-6) // annual series only
                return (
                  <tr key={ri} className="fin-row">
                    <th className="fin-cell fin-cell-sticky" scope="row">{row.label}</th>
                    {annualPeriods.slice(-6).map((_, ci) => (
                      <td key={ci} className="fin-cell fin-cell-num">
                        {periodSlice[ci] != null && isFinite(periodSlice[ci] as number)
                          ? (periodSlice[ci] as number).toFixed(2)
                          : "—"}
                      </td>
                    ))}
                    <td className="fin-cell fin-cell-num fin-cell-current">
                      {row.current != null && isFinite(row.current) ? row.current.toFixed(2) : "—"}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Profitability ratios ── */}
      <div className="fin-sec">
        <div className="fin-table-scroll">
          <table className="fin-table fin-stats-tbl">
            <thead>
              <tr>
                <th className="fin-cell fin-cell-sticky fin-cell-corner" scope="col">
                  {pick(!!zh, "Metrics", "指标")}
                </th>
                <th className="fin-cell fin-cell-num fin-cell-head fin-cell-current" scope="col">
                  {pick(!!zh, "Current", "当前")}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="fin-row fin-stats-grp-hdr">
                <th colSpan={2} className="fin-cell fin-cell-grp" scope="rowgroup">
                  {pick(!!zh, "Profitability ratios", "盈利比率")}
                </th>
              </tr>
              {profRows.map((row, ri) => (
                <tr key={ri} className="fin-row">
                  <th className="fin-cell fin-cell-sticky" scope="row">{row.label}</th>
                  <td className="fin-cell fin-cell-num fin-cell-current">{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
