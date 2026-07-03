"use client"
/**
 * RevenuePage — TradingView-parity Revenue tab (BUILD-SPEC §3.4 FE2b,
 * spec/stats-earn-rev-div.md §3, R6).
 *
 * JUDGE-FIXED constraints:
 *   - Renders segments when fund.segments present (by_source + by_country).
 *   - Graceful deferred empty-state card when segments absent (R6: v1 collectors
 *     emit null).
 *   - If estimates exist (estimates.rev_fy), shows a revenue-estimates fallback
 *     section beneath the empty-state card.
 *
 * Props: {fund, zh}
 */
import type { Fund, SegmentSeries } from "../../lib/fund"
import { fmtNum, fmtPct, pick } from "../../lib/finFormat"
import { StackedBars, type Series } from "./FinCharts"

export interface RevenuePageProps {
  fund: Fund | null
  zh?: boolean
}

// ── color palette for segments (cycles) ──────────────────────────────────────
const SEG_COLORS = [
  "var(--brand)",
  "var(--up)",
  "var(--warn)",
  "var(--down)",
  "var(--code-fn)",
  "var(--brand-2)",
]

// ── one segmentation module (By source / By country) ─────────────────────────

function SegmentModule({
  title,
  seg,
  ccy,
  zh,
}: {
  title: string
  seg: SegmentSeries
  ccy: string
  zh?: boolean
}) {
  const periods = seg.periods ?? []
  const seriesData = seg.series ?? []

  const chartSeries: Series[] = seriesData.map((s, i) => ({
    name: s.name,
    values: s.values,
    color: SEG_COLORS[i % SEG_COLORS.length],
  }))

  // Show chart window: last 7 years
  const chartPeriods = periods.slice(-7)
  const chartSer: Series[] = chartSeries.map((s) => ({
    ...s,
    values: s.values.slice(-7),
  }))

  return (
    <div className="fin-sec">
      <div className="fin-sec-h">{title}</div>

      {/* Stacked bar chart (last 7 periods) */}
      {chartPeriods.length > 0 && (
        <StackedBars
          labels={chartPeriods}
          series={chartSer}
          fmtY={(v) => fmtNum(v)}
          height={180}
          zh={zh}
        />
      )}

      {/* Segment table: full history */}
      <div className="fin-earn-meta">
        <span>{pick(!!zh, "Metrics", "指标")}</span>
        <span className="fin-earn-ccy">{pick(!!zh, "Currency: " + ccy, "货币: " + ccy)}</span>
      </div>
      <div className="fin-table-scroll">
        <table className="fin-table">
          <thead>
            <tr>
              <th className="fin-cell fin-cell-sticky fin-cell-corner" scope="col">
                {pick(!!zh, "Segment", "分部")}
              </th>
              {periods.map((p, i) => (
                <th key={i} className="fin-cell fin-cell-num fin-cell-head" scope="col">{p}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {seriesData.map((s, si) => (
              <tr key={si} className="fin-row">
                <th className="fin-cell fin-cell-sticky" scope="row">
                  <span
                    className="fin-seg-dot"
                    style={{ background: SEG_COLORS[si % SEG_COLORS.length] }}
                  />
                  {s.name}
                </th>
                {periods.map((_, pi) => {
                  const v = s.values[pi]
                  return (
                    <td key={pi} className="fin-cell fin-cell-num">
                      {v != null && isFinite(v) ? fmtNum(v) : "—"}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Revenue estimates fallback section ────────────────────────────────────────

function EstimatesSection({
  fund,
  zh,
}: {
  fund: Fund
  zh?: boolean
}) {
  const est = fund.estimates
  if (!est?.rev_fy) return null
  const { periods, avg, high, low, n } = est.rev_fy
  if (!periods || periods.length === 0) return null
  const ccy = fund.stmt_currency ?? "USD"

  return (
    <div className="fin-sec">
      <div className="fin-sec-h">{pick(!!zh, "Revenue estimates", "营收预期")}</div>
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
              {periods.map((p, i) => (
                <th key={i} className="fin-cell fin-cell-num fin-cell-head" scope="col">{p}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="fin-row fin-row-b">
              <th className="fin-cell fin-cell-sticky" scope="row">
                {pick(!!zh, "Average", "平均")}
              </th>
              {periods.map((_, i) => (
                <td key={i} className="fin-cell fin-cell-num">
                  {avg[i] != null ? fmtNum(avg[i]) : "—"}
                </td>
              ))}
            </tr>
            <tr className="fin-row">
              <th className="fin-cell fin-cell-sticky" scope="row">
                {pick(!!zh, "High", "最高")}
              </th>
              {periods.map((_, i) => (
                <td key={i} className="fin-cell fin-cell-num">
                  {high[i] != null ? fmtNum(high[i]) : "—"}
                </td>
              ))}
            </tr>
            <tr className="fin-row">
              <th className="fin-cell fin-cell-sticky" scope="row">
                {pick(!!zh, "Low", "最低")}
              </th>
              {periods.map((_, i) => (
                <td key={i} className="fin-cell fin-cell-num">
                  {low[i] != null ? fmtNum(low[i]) : "—"}
                </td>
              ))}
            </tr>
            <tr className="fin-row">
              <th className="fin-cell fin-cell-sticky" scope="row">
                {pick(!!zh, "# Estimates", "分析师数")}
              </th>
              {periods.map((_, i) => (
                <td key={i} className="fin-cell fin-cell-num">
                  {n[i] != null ? String(Math.round(n[i] as number)) : "—"}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      {/* Revenue growth estimates */}
      {(est.growth?.rev_yoy != null) && (
        <div className="fin-rev-growth">
          <span className="fin-rev-growth-lbl">{pick(!!zh, "Revenue growth (YoY est.)", "营收增长（同比预期）")}</span>
          <span
            className="fin-chip"
            style={{
              color: (est.growth.rev_yoy ?? 0) >= 0 ? "var(--up)" : "var(--down)",
              borderColor: (est.growth.rev_yoy ?? 0) >= 0 ? "rgba(38,194,129,.3)" : "rgba(240,86,107,.3)",
            }}
          >
            {fmtPct(est.growth.rev_yoy, { sign: true })}
          </span>
        </div>
      )}
    </div>
  )
}

// ── main component ────────────────────────────────────────────────────────────

export default function RevenuePage({ fund, zh }: RevenuePageProps) {
  if (!fund) {
    return (
      <div className="fin-body">
        <div className="fin-empty fin-empty-lg" role="status">
          <span className="fin-empty-title">{pick(!!zh, "No revenue data", "暂无营收数据")}</span>
        </div>
      </div>
    )
  }

  const segs = fund.segments
  const ccy = fund.stmt_currency ?? "USD"

  // ── Segments present → full Revenue segmentation page ──
  if (segs && (segs.by_source || segs.by_country)) {
    return (
      <div className="fin-body">
        {segs.by_source && (
          <SegmentModule
            title={pick(!!zh, "By source", "按来源")}
            seg={segs.by_source}
            ccy={ccy}
            zh={zh}
          />
        )}
        {segs.by_country && (
          <SegmentModule
            title={pick(!!zh, "By country", "按地区")}
            seg={segs.by_country}
            ccy={ccy}
            zh={zh}
          />
        )}
      </div>
    )
  }

  // ── No segments (v1 deferred, R6) → graceful empty-state + estimates fallback ──
  return (
    <div className="fin-body">
      <div className="fin-sec">
        <div className="fin-card fin-rev-deferred">
          <div className="fin-card-h">{pick(!!zh, "Revenue breakdown", "营收分部")}</div>
          <div className="fin-rev-deferred-body">
            {pick(
              !!zh,
              "Revenue segment breakdown is not yet available for this security.",
              "该证券的营收分部数据暂未开放。"
            )}
          </div>
        </div>
      </div>

      {/* Revenue estimates fallback — show when available */}
      <EstimatesSection fund={fund} zh={zh} />
    </div>
  )
}
