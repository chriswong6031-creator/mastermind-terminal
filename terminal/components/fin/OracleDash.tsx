"use client"
/**
 * OracleDash — Golden Oracle overlay dashboard (BUILD-SPEC §3.4 FE2d, R14).
 *
 * Renders as a fixed overlay (z-90 scrim + panel) opened from the Golden Oracle
 * rail card. Shows:
 *   - Verdict hero + WR / PF / CAGR / n-trades stats (from row manifest + slice.backtest)
 *   - Equity curve <LineSeries> from <SYM>.backtest.json when available (flagships only)
 *   - Full signal-history table (ALL slice.indicator.signals, most-recent first, scrollable)
 *     with badge / date / price / strength + reasons chips; hover row → "Jump to chart"
 *       → dispatches window CustomEvent mm:chart-jump {sym, ts} + calls onClose
 *
 * Props: {sym, row, slice, zh?, onClose?, onJump?}
 * Wired by FE3 (TerminalShell) — do NOT import here.
 */
import { useEffect, useRef, useState } from "react"
import { pick, fmtPct, fmtDate } from "../../lib/finFormat"
import { LineSeries } from "./FinCharts"
import { getJSON } from "../../lib/dataCache"

/* ── types (narrow; only what we consume) ────────────────────────────── */

interface ManifestRow {
  verdict?: string | null
  wr?: number | null
  pf?: number | null
  cagr?: number | null
  regimeBull?: boolean | null
}

interface Signal {
  ts: string
  type: "BUY" | "SELL" | string
  strength?: number | null
  price?: number | null
  reasons?: string[]
  regime?: Record<string, boolean>
}

interface SliceIndicator {
  signals?: Signal[]
}

interface BacktestMetrics {
  n_trades?: number | null
  win_rate?: number | null
  profit_factor?: number | null
  cagr?: number | null
}

interface BacktestResult {
  metrics?: BacktestMetrics
  n_trades?: number | null
}

interface Slice {
  indicator?: SliceIndicator
  backtest?: BacktestResult
}

export interface OracleDashProps {
  sym: string
  row?: ManifestRow | null
  slice?: Slice | null
  zh?: boolean
  onClose?: () => void
  /** Called by signal-row click; parent may also handle mm:chart-jump event. */
  onJump?: (ts: string) => void
}

/* ── helpers ─────────────────────────────────────────────────────────── */

function fmt2(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return "—"
  return v.toFixed(2)
}

function fmtPctLocal(v: number | null | undefined, scale = false): string {
  if (v == null || !isFinite(v)) return "—"
  const pct = scale ? v * 100 : v
  return fmtPct(pct, { decimals: 1, alreadyPct: true })
}

function signalColor(type: string): string {
  return type === "BUY" ? "var(--up)" : "var(--down)"
}

/* ── BacktestCurve: lazy-fetch <SYM>.backtest.json and draw equity curve ── */
function BacktestCurve({ sym, zh }: { sym: string; zh: boolean }) {
  const [data, setData] = useState<{ labels: string[]; values: (number | null)[] } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getJSON("/data/" + sym + ".backtest.json")
      .then((raw: any) => {
        if (cancelled || !raw) return
        // Expected shape: {equity: [{date, value}, ...]} or {equity: number[]} or {curve: [...]}
        // null-safe: accept various shapes that a collector might emit
        const eq: any[] = raw?.equity ?? raw?.curve ?? []
        if (!Array.isArray(eq) || eq.length === 0) return
        const labels: string[] = []
        const values: (number | null)[] = []
        eq.forEach((pt: any) => {
          if (typeof pt === "object" && pt !== null) {
            labels.push(pt.date ? fmtDate(pt.date, { short: true }) : String(labels.length))
            values.push(typeof pt.value === "number" ? pt.value : null)
          } else if (typeof pt === "number") {
            labels.push(String(labels.length))
            values.push(pt)
          }
        })
        if (values.some((v) => v != null)) {
          setData({ labels, values })
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [sym])

  if (loading) {
    return (
      <div className="od-curve-loading">
        {pick(zh, "Loading equity curve…", "加载资金曲线…")}
      </div>
    )
  }
  if (!data) return null

  return (
    <div className="od-curve">
      <div className="od-sec-h">{pick(zh, "Equity Curve", "资金曲线")}</div>
      <LineSeries
        labels={data.labels}
        series={[{
          name: pick(zh, "Portfolio", "组合"),
          values: data.values,
          color: "var(--brand)",
        }]}
        includeZero={false}
        refLine={data.values[0] ?? null}
        noLegend
        zh={zh}
        height={140}
      />
    </div>
  )
}

/* ── main component ───────────────────────────────────────────────────── */

export default function OracleDash({ sym, row, slice, zh = false, onClose, onJump }: OracleDashProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  // Esc to close — capture phase so it wins over ChartPanel/SearchModal handlers (R7)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation()
        onClose?.()
      }
    }
    window.addEventListener("keydown", handler, true)
    return () => window.removeEventListener("keydown", handler, true)
  }, [onClose])

  // click outside the panel to close
  const handleScrimClick = (e: React.MouseEvent) => {
    if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
      onClose?.()
    }
  }

  // derived stats: prefer slice.backtest.metrics over row for consistency
  const bt = slice?.backtest
  const metrics = bt?.metrics
  const wr = metrics?.win_rate ?? row?.wr ?? null
  const pf = metrics?.profit_factor ?? row?.pf ?? null
  const cagr = metrics?.cagr ?? row?.cagr ?? null
  const nTrades = metrics?.n_trades ?? bt?.n_trades ?? null

  const verdict = row?.verdict ?? null
  const isBuy = verdict ? ["BUY", "REBUY", "ADD"].includes(verdict.toUpperCase()) : false
  const verdictColor = verdict
    ? (isBuy ? "var(--up)" : ["SELL", "TRIM", "CUT"].includes(verdict.toUpperCase()) ? "var(--down)" : "var(--signal)")
    : "var(--text-2)"

  // signals: most-recent first, ALL of them
  const sigs: Signal[] = [...(slice?.indicator?.signals ?? [])].reverse()

  const handleJump = (ts: string) => {
    // Dispatch the standard CustomEvent that ChartPanel listens for (R14)
    window.dispatchEvent(new CustomEvent("mm:chart-jump", { detail: { sym, ts } }))
    onJump?.(ts)
    onClose?.()
  }

  return (
    <div className="od-scrim" onClick={handleScrimClick} role="dialog" aria-modal="true" aria-label={pick(zh, "Golden Oracle Dashboard", "黄金神谕面板")}>
      <div className="od-panel" ref={panelRef}>
        {/* ── header ── */}
        <div className="od-head">
          <span className="od-brand">
            <svg viewBox="0 0 24 24" aria-hidden="true" className="od-star">
              <path d="M12 2l2.2 5.8L20 10l-5.8 2.2L12 18l-2.2-5.8L4 10l5.8-2.2z" />
            </svg>
            {pick(zh, "Golden Oracle", "黄金神谕")}
          </span>
          <span className="od-sym">{sym}</span>
          <button className="od-close" onClick={onClose} aria-label={pick(zh, "Close", "关闭")}>×</button>
        </div>

        {/* ── scrollable body ── */}
        <div className="od-body">
          {/* verdict hero */}
          <div className="od-hero">
            <div className="od-verdict" style={{ color: verdictColor }}>
              {verdict ?? "—"}
            </div>
            <div className="od-stats">
              <div className="od-stat">
                <span className="od-stat-k">{pick(zh, "Win rate", "胜率")}</span>
                <span className="od-stat-v">{fmtPctLocal(wr, true)}</span>
              </div>
              <div className="od-stat">
                <span className="od-stat-k">{pick(zh, "Profit factor", "盈亏比")}</span>
                <span className="od-stat-v">{fmt2(pf)}</span>
              </div>
              <div className="od-stat">
                <span className="od-stat-k">{pick(zh, "CAGR", "年化收益")}</span>
                <span className="od-stat-v">{fmtPctLocal(cagr, true)}</span>
              </div>
              <div className="od-stat">
                <span className="od-stat-k">{pick(zh, "Trades", "交易次数")}</span>
                <span className="od-stat-v">{nTrades ?? "—"}</span>
              </div>
            </div>
          </div>

          {/* equity curve — only for flagships that have a backtest.json */}
          <BacktestCurve sym={sym} zh={zh} />

          {/* signal history table */}
          <div className="od-sig-section">
            <div className="od-sec-h">
              {pick(zh, "Signal history", "信号历史")}
              {sigs.length > 0 && <span className="od-sig-count">{sigs.length}</span>}
            </div>

            {sigs.length === 0 ? (
              <div className="fin-empty">{pick(zh, "No signals", "暂无信号")}</div>
            ) : (
              <div className="od-sig-scroll">
                <table className="od-sig-table">
                  <thead>
                    <tr>
                      <th>{pick(zh, "Type", "类型")}</th>
                      <th>{pick(zh, "Date", "日期")}</th>
                      <th>{pick(zh, "Price", "价格")}</th>
                      <th>{pick(zh, "Strength", "强度")}</th>
                      <th>{pick(zh, "Reasons", "信号原因")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sigs.map((sig, i) => (
                      <SignalRow key={i} sig={sig} zh={zh} onJump={handleJump} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* backtested note */}
          <div className="od-note">
            {pick(zh, "Backtested results. Past performance does not guarantee future results.", "回测结果。历史表现不代表未来收益。")}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── SignalRow — individual signal table row with hover jump affordance ── */

function SignalRow({ sig, zh, onJump }: { sig: Signal; zh: boolean; onJump: (ts: string) => void }) {
  const [hovered, setHovered] = useState(false)
  const isBuy = sig.type === "BUY"
  const col = signalColor(sig.type)

  return (
    <tr
      className={"od-sig-row" + (hovered ? " od-sig-row-hov" : "")}
      onClick={() => onJump(sig.ts)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ cursor: "pointer" }}
    >
      <td>
        <span className="od-badge" style={{ background: col }}>
          {sig.type}
        </span>
      </td>
      <td className="od-sig-date">{fmtDate(sig.ts)}</td>
      <td className="od-sig-price">
        {sig.price != null ? sig.price.toFixed(2) : "—"}
      </td>
      <td className="od-sig-str">
        {sig.strength != null ? (sig.strength * 100).toFixed(0) + "%" : "—"}
      </td>
      <td>
        <div className="od-chips">
          {(sig.reasons ?? []).map((r, ri) => (
            <span key={ri} className="fin-chip">{r.replace(/_/g, " ")}</span>
          ))}
        </div>
      </td>
      {hovered && (
        <td className="od-jump-cell">
          <button
            className="od-jump-btn"
            onClick={() => onJump(sig.ts)}
            title={pick(zh, "Jump to chart", "跳转到图表")}
          >
            {pick(zh, "Jump to chart", "跳转到图表")} →
          </button>
        </td>
      )}
    </tr>
  )
}
