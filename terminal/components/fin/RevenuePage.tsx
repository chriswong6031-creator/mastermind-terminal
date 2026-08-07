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
import { fmtNum, fmtPct, fmtDate, pick } from "../../lib/finFormat"
import { StackedBars, type Series } from "./FinCharts"

export interface RevenuePageProps {
  fund: Fund | null
  zh?: boolean
  sym?: string
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
  eyebrow,
  title,
  seg,
  ccy,
  zh,
}: {
  eyebrow: string
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
      <div className="fin-eyebrow">{eyebrow}</div>
      <div
        className="fin-sec-h fin-rail fin-rule"
        style={{ "--rail": "var(--brand)" } as React.CSSProperties}
      >
        {title}
      </div>

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
      <div className="fin-eyebrow">{pick(!!zh, "SELL-SIDE CONSENSUS", "卖方一致预期")}</div>
      <div
        className="fin-sec-h fin-rail fin-rule"
        style={{ "--rail": "var(--brand)" } as React.CSSProperties}
      >
        {pick(!!zh, "Revenue estimates", "营收预期")}
      </div>
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
            className="fin-tag num"
            style={{
              // Growth IS directional → the tint formula rides the --up/--down
              // tokens (never hardcoded green/red), so background, ring and text
              // flip together under html[data-updown="east"].
              "--c": (est.growth.rev_yoy ?? 0) >= 0 ? "var(--up)" : "var(--down)",
            } as React.CSSProperties}
          >
            {fmtPct(est.growth.rev_yoy, { sign: true })}
          </span>
        </div>
      )}
      {fund.asof && (
        <div className="fin-asof">
          {pick(!!zh,
            `Consensus estimates · as of ${fmtDate(fund.asof)}`,
            `一致预期数据 · 截至 ${fmtDate(fund.asof)}`
          )}
        </div>
      )}
    </div>
  )
}

// ── main component ────────────────────────────────────────────────────────────

export default function RevenuePage({ fund, zh, sym }: RevenuePageProps) {
  if (!fund) {
    return (
      <div className="fin-body">
        <div className="fin-empty fin-empty-lg" role="status">
          <span className="fin-empty-title">{pick(!!zh, "Fundamentals not yet covered", "尚未覆盖基本面数据")}</span>
          <span className="fin-empty-why">{pick(!!zh,
            `Revenue data for ${sym ?? "this symbol"} hasn't been collected yet.`,
            `${sym ?? "该标的"} 的营收数据尚未采集。`
          )}</span>
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
            eyebrow={pick(!!zh, "REVENUE MIX", "营收构成")}
            title={pick(!!zh, "By source", "按来源")}
            seg={segs.by_source}
            ccy={ccy}
            zh={zh}
          />
        )}
        {segs.by_country && (
          <SegmentModule
            eyebrow={pick(!!zh, "GEOGRAPHIC MIX", "地区构成")}
            title={pick(!!zh, "By country", "按地区")}
            seg={segs.by_country}
            ccy={ccy}
            zh={zh}
          />
        )}
        {fund.asof && (
          <div className="fin-asof">
            {pick(!!zh,
              `Segment breakdown · as of ${fmtDate(fund.asof)}`,
              `分部数据 · 截至 ${fmtDate(fund.asof)}`
            )}
          </div>
        )}
      </div>
    )
  }

  // ── No segments (v1 deferred, R6) → graceful empty-state + estimates fallback ──
  return (
    <div className="fin-body">
      <div className="fin-sec">
        <div className="fin-eyebrow">{pick(!!zh, "REVENUE MIX", "营收构成")}</div>
        <div
          className="fin-sec-h fin-rail fin-rule"
          style={{ "--rail": "var(--brand)" } as React.CSSProperties}
        >
          {pick(!!zh, "Revenue breakdown", "营收分部")}
        </div>
        <div className="fin-empty fin-empty-lg fin-rev-deferred" role="status">
          <div className="fin-empty-title">{pick(!!zh, "No segment breakdown", "暂无营收分部")}</div>
          <div className="fin-empty-why">
            {pick(
              !!zh,
              "The segment collector has not emitted a by-source or by-country split for this listing. Total revenue is still reported on the Statements tab.",
              "分部采集器尚未为该标的输出按来源或按地区的拆分。营收总额仍可在「财务报表」标签中查看。"
            )}
          </div>
        </div>
      </div>

      {/* Revenue estimates fallback — show when available */}
      <EstimatesSection fund={fund} zh={zh} />
    </div>
  )
}
