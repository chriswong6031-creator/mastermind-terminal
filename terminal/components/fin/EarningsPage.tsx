"use client"
/**
 * EarningsPage — TradingView-parity Earnings tab (BUILD-SPEC §3.4 FE2b,
 * spec/stats-earn-rev-div.md §2). Two stacked modules: EPS + Revenue.
 *
 * JUDGE-FIXED constraints:
 *   - Revenue Reported/Estimate/Surprise table renders a designed EMPTY STATE when
 *     all rev_a are null (US/HK case). CN: shows actuals-only variant.
 *   - Estimates are max 2 FY periods (yfinance 0y/+1y only).
 *   - Summary strip includes next report date, report period, EPS estimate,
 *     revenue estimate.
 *   - A/Q toggles are PER MODULE (independent).
 *
 * Props: {fund, zh}
 */
import { useState } from "react"
import type { Fund, EarningsQuarter, EarningsFY } from "../../lib/fund"
import { fmtNum, fmtDate, daysUntil, periodLabel, pick } from "../../lib/finFormat"
import { Dumbbell, type DumbbellPoint } from "./FinCharts"

export interface EarningsPageProps {
  fund: Fund | null
  zh?: boolean
}

// ── helpers ──────────────────────────────────────────────────────────────────

type Mode = "annual" | "quarterly"

/** Build DumbbellPoint[] from quarterly or annual data. */
function buildEpsDumbbell(
  qs: EarningsQuarter[],
  fys: EarningsFY[],
  mode: Mode,
  estimates: Fund["estimates"]
): DumbbellPoint[] {
  if (mode === "quarterly") {
    const pts: DumbbellPoint[] = qs.map((q) => ({
      label: periodLabel(q.period),
      actual: q.eps_a,
      estimate: q.eps_e,
    }))
    // Append forward quarter estimates (from estimates.eps_q)
    const eq = estimates?.eps_q
    if (eq) {
      eq.periods.forEach((p, i) => {
        // Avoid duplicating a quarter already in qs
        const label = periodLabel(p)
        if (!pts.some((pt) => pt.label === label)) {
          pts.push({ label, actual: null, estimate: eq.avg[i] ?? null })
        }
      })
    }
    return pts.slice(-10) // show last 10
  } else {
    const pts: DumbbellPoint[] = fys.map((fy) => ({
      label: fy.period,
      actual: fy.eps_a,
      estimate: fy.eps_e,
    }))
    // Append FY forward estimates (max 2)
    const ef = estimates?.eps_fy
    if (ef) {
      ef.periods.slice(0, 2).forEach((p, i) => {
        if (!pts.some((pt) => pt.label === p)) {
          pts.push({ label: p, actual: null, estimate: ef.avg[i] ?? null })
        }
      })
    }
    return pts
  }
}

function buildRevDumbbell(
  qs: EarningsQuarter[],
  fys: EarningsFY[],
  mode: Mode,
  estimates: Fund["estimates"]
): DumbbellPoint[] {
  if (mode === "quarterly") {
    const pts: DumbbellPoint[] = qs.map((q) => ({
      label: periodLabel(q.period),
      actual: q.rev_a,
      estimate: q.rev_e,
    }))
    const rq = estimates?.rev_fy // no per-quarter rev estimates in spec; skip
    return pts.slice(-10)
  } else {
    const pts: DumbbellPoint[] = fys.map((fy) => ({
      label: fy.period,
      actual: fy.rev_a,
      estimate: fy.rev_e,
    }))
    const rf = estimates?.rev_fy
    if (rf) {
      rf.periods.slice(0, 2).forEach((p, i) => {
        if (!pts.some((pt) => pt.label === p)) {
          pts.push({ label: p, actual: null, estimate: rf.avg[i] ?? null })
        }
      })
    }
    return pts
  }
}

// ── Revenue section — designed empty state when all rev_a null ────────────────

function RevenueModule({
  fund,
  zh,
}: {
  fund: Fund
  zh?: boolean
}) {
  const [mode, setMode] = useState<Mode>("quarterly")
  const qs = fund.earnings?.q ?? []
  const fys = fund.earnings?.fy ?? []
  const estimates = fund.estimates

  const pts = buildRevDumbbell(qs, fys, mode, estimates)
  const ccy = fund.stmt_currency ?? "USD"

  // Check if ALL rev_a are null (US/HK case)
  const allRevNull = qs.every((q) => q.rev_a == null) && fys.every((fy) => fy.rev_a == null)

  // CN actuals-only: has rev_a but no estimates
  const hasCnActuals = !allRevNull && !estimates
  const periodSrc = mode === "quarterly" ? qs : fys

  // Determine empty-state variant
  if (allRevNull && !estimates?.rev_fy) {
    return (
      <div className="fin-sec fin-earn-module">
        <div className="fin-earn-module-hdr">
          <span className="fin-earn-module-title">{pick(!!zh, "Revenue", "营收")}</span>
          <div className="fin-toggle">
            <button className={mode === "annual" ? "on" : ""} onClick={() => setMode("annual")}>
              {pick(!!zh, "Annual", "年度")}
            </button>
            <button className={mode === "quarterly" ? "on" : ""} onClick={() => setMode("quarterly")}>
              {pick(!!zh, "Quarterly", "季度")}
            </button>
          </div>
        </div>
        <div className="fin-empty fin-earn-rev-empty" role="status">
          {pick(
            !!zh,
            "Revenue reported figures are not available for this security.",
            "该证券暂无营收实际数据。"
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="fin-sec fin-earn-module">
      <div className="fin-earn-module-hdr">
        <span className="fin-earn-module-title">{pick(!!zh, "Revenue", "营收")}</span>
        <div className="fin-toggle">
          <button className={mode === "annual" ? "on" : ""} onClick={() => setMode("annual")}>
            {pick(!!zh, "Annual", "年度")}
          </button>
          <button className={mode === "quarterly" ? "on" : ""} onClick={() => setMode("quarterly")}>
            {pick(!!zh, "Quarterly", "季度")}
          </button>
        </div>
      </div>

      {/* Dumbbell chart — orange for revenue actuals */}
      {pts.length > 0 && (
        <Dumbbell
          points={pts}
          fmtY={(v) => fmtNum(v)}
          actualColor="var(--warn)"
          height={160}
          zh={zh}
        />
      )}

      {/* Table: Reported / Estimate / Surprise */}
      <div className="fin-earn-meta">
        <span>{pick(!!zh, "Metrics", "指标")}</span>
        <span className="fin-earn-ccy">{pick(!!zh, "Currency: " + ccy, "货币: " + ccy)}</span>
      </div>
      <div className="fin-table-scroll">
        <table className="fin-table">
          <thead>
            <tr>
              <th className="fin-cell fin-cell-sticky fin-cell-corner" scope="col">
                {pick(!!zh, "Metrics", "指标")}
              </th>
              {pts.map((p, i) => (
                <th key={i} className="fin-cell fin-cell-num fin-cell-head" scope="col">
                  {p.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="fin-row fin-row-b">
              <th className="fin-cell fin-cell-sticky" scope="row">
                {pick(!!zh, "Reported", "实际")}
              </th>
              {pts.map((p, i) => (
                <td key={i} className="fin-cell fin-cell-num">
                  {p.actual != null ? fmtNum(p.actual) : "—"}
                </td>
              ))}
            </tr>
            {/* Only show Estimate row if we have estimate data */}
            {!hasCnActuals && (
              <tr className="fin-row">
                <th className="fin-cell fin-cell-sticky fin-earn-est-row" scope="row">
                  {pick(!!zh, "Estimate", "预期")}
                </th>
                {pts.map((p, i) => (
                  <td key={i} className="fin-cell fin-cell-num fin-earn-est-row">
                    {p.estimate != null ? fmtNum(p.estimate) : "—"}
                  </td>
                ))}
              </tr>
            )}
            {!hasCnActuals && (
              <tr className="fin-row">
                <th className="fin-cell fin-cell-sticky" scope="row">
                  {pick(!!zh, "Surprise", "超预期")}
                </th>
                {pts.map((p, i) => {
                  // compute surprise from actual/estimate if not pre-computed
                  let surp: number | null = null
                  if (mode === "quarterly") {
                    const q = qs[i]
                    surp = q?.surp_pct ?? null
                    if (surp == null && p.actual != null && p.estimate != null && p.estimate !== 0) {
                      surp = ((p.actual - p.estimate) / Math.abs(p.estimate)) * 100
                    }
                  } else {
                    const fy = fys[i]
                    surp = fy?.surp_pct ?? null
                  }
                  return (
                    <td key={i} className="fin-cell fin-cell-num">
                      {surp != null ? (
                        <span className={surp >= 0 ? "fin-cell-surp up" : "fin-cell-surp down"}>
                          {(surp >= 0 ? "+" : "") + Math.abs(surp).toFixed(2) + "%"}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  )
                })}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── main component ────────────────────────────────────────────────────────────

export default function EarningsPage({ fund, zh }: EarningsPageProps) {
  const [epsMode, setEpsMode] = useState<Mode>("quarterly")

  if (!fund) {
    return (
      <div className="fin-body">
        <div className="fin-empty fin-empty-lg" role="status">
          <span className="fin-empty-title">{pick(!!zh, "No earnings data", "暂无盈利数据")}</span>
        </div>
      </div>
    )
  }

  const earn = fund.earnings
  const estimates = fund.estimates
  const qs = earn?.q ?? []
  const fys = earn?.fy ?? []
  const ccy = fund.stmt_currency ?? "USD"

  // ── Summary strip ──
  const nextDate = earn?.next_date
  const daysAway = daysUntil(nextDate)
  const nextPeriod = earn?.next_period
  const nextEps = earn?.next_eps_est
  const nextRev = earn?.next_rev_est

  // ── EPS dumbbell ──
  const epsPts = buildEpsDumbbell(qs, fys, epsMode, estimates)

  return (
    <div className="fin-body">
      {/* ── Summary strip ── */}
      <div className="fin-sec">
        <div className="fin-grid4 fin-earn-strip">
          <div className="fin-fact">
            <span className="k">{pick(!!zh, "Next report date", "下次报告日期")}</span>
            <span className="v">
              {nextDate ? "~ " + fmtDate(nextDate) : "—"}
              {daysAway != null && daysAway > 0 && (
                <span className="fin-earn-days"> ({pick(!!zh, "in " + daysAway + "d", daysAway + "天后")})</span>
              )}
            </span>
          </div>
          <div className="fin-fact">
            <span className="k">{pick(!!zh, "Report period", "报告期")}</span>
            <span className="v">{nextPeriod ?? "—"}</span>
          </div>
          <div className="fin-fact">
            <span className="k">{pick(!!zh, "EPS estimate", "每股盈利预期")}</span>
            <span className="v">{nextEps != null ? fmtNum(nextEps) : "—"}</span>
          </div>
          <div className="fin-fact">
            <span className="k">{pick(!!zh, "Revenue estimate", "营收预期")}</span>
            <span className="v">
              {nextRev != null ? fmtNum(nextRev) + " " + ccy : "—"}
            </span>
          </div>
        </div>
      </div>

      {/* ── EPS Module ── */}
      <div className="fin-sec fin-earn-module">
        <div className="fin-earn-module-hdr">
          <span className="fin-earn-module-title">{pick(!!zh, "EPS", "每股盈利")}</span>
          <div className="fin-toggle">
            <button className={epsMode === "annual" ? "on" : ""} onClick={() => setEpsMode("annual")}>
              {pick(!!zh, "Annual", "年度")}
            </button>
            <button className={epsMode === "quarterly" ? "on" : ""} onClick={() => setEpsMode("quarterly")}>
              {pick(!!zh, "Quarterly", "季度")}
            </button>
          </div>
        </div>

        {/* EPS dumbbell chart — blue for actuals */}
        {epsPts.length > 0 ? (
          <Dumbbell
            points={epsPts}
            fmtY={(v) => v.toFixed(2)}
            actualColor="var(--brand)"
            estimateColor="var(--text-2)"
            height={160}
            zh={zh}
          />
        ) : (
          <div className="fin-empty" role="status">
            {pick(!!zh, "No EPS data", "暂无每股盈利数据")}
          </div>
        )}

        {/* EPS table: Reported / Estimate / Surprise */}
        {epsPts.length > 0 && (
          <>
            <div className="fin-earn-meta">
              <span>{pick(!!zh, "Metrics", "指标")}</span>
              <span className="fin-earn-ccy">{pick(!!zh, "Currency: " + ccy, "货币: " + ccy)}</span>
            </div>
            <div className="fin-table-scroll">
              <table className="fin-table">
                <thead>
                  <tr>
                    <th className="fin-cell fin-cell-sticky fin-cell-corner" scope="col">
                      {pick(!!zh, "Metrics", "指标")}
                    </th>
                    {epsPts.map((p, i) => (
                      <th key={i} className="fin-cell fin-cell-num fin-cell-head" scope="col">
                        {p.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="fin-row fin-row-b">
                    <th className="fin-cell fin-cell-sticky" scope="row">
                      {pick(!!zh, "Reported", "实际")}
                    </th>
                    {epsPts.map((p, i) => (
                      <td key={i} className="fin-cell fin-cell-num">
                        {p.actual != null ? p.actual.toFixed(2) : "—"}
                      </td>
                    ))}
                  </tr>
                  <tr className="fin-row">
                    <th className="fin-cell fin-cell-sticky fin-earn-est-row" scope="row">
                      {pick(!!zh, "Estimate", "预期")}
                    </th>
                    {epsPts.map((p, i) => (
                      <td key={i} className="fin-cell fin-cell-num fin-earn-est-row">
                        {p.estimate != null ? p.estimate.toFixed(2) : "—"}
                      </td>
                    ))}
                  </tr>
                  <tr className="fin-row">
                    <th className="fin-cell fin-cell-sticky" scope="row">
                      {pick(!!zh, "Surprise", "超预期")}
                    </th>
                    {epsPts.map((p, i) => {
                      // Use pre-computed surp_pct from quarterly/FY data when available
                      let surp: number | null = null
                      if (epsMode === "quarterly") {
                        const q = qs[i]
                        surp = q?.surp_pct ?? null
                        if (surp == null && p.actual != null && p.estimate != null && p.estimate !== 0) {
                          surp = ((p.actual - p.estimate) / Math.abs(p.estimate)) * 100
                        }
                      } else {
                        const fy = fys[i]
                        surp = fy?.surp_pct ?? null
                      }
                      return (
                        <td key={i} className="fin-cell fin-cell-num">
                          {surp != null ? (
                            <span className={surp >= 0 ? "fin-cell-surp up" : "fin-cell-surp down"}>
                              {(surp >= 0 ? "+" : "") + Math.abs(surp).toFixed(2) + "%"}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                      )
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* ── Revenue Module ── */}
      <RevenueModule fund={fund} zh={zh} />
    </div>
  )
}
