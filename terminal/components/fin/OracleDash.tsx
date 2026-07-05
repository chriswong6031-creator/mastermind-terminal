"use client"
/**
 * OracleDash — the "Signals" dashboard overlay (REVISION-SPEC Lane B).
 *
 * Renders as a fixed overlay (z-90 scrim + panel) opened from the compact
 * Golden Oracle / Research-desk rail chips. Sections (top→bottom), all
 * null-guarded + bilingual via pick():
 *   1. Header (symbol + "Signals" + close)
 *   2. Golden Oracle scorecard (verdict + WR/PF/CAGR + conviction/decision dims)
 *   3. Research desk read (decision verb/band/headline/gloss + conviction ring)
 *   4. Drivers / Cautions chips
 *   5. Factor profile diverging bars (factors.legs + factors.z)
 *   6. Event edge (decision.trust_en/zh prose)
 *   7. Signal history table — RECOLORED to match the chart markers exactly
 *      (BUY→--buy, REBUY→--rebuy, CUT→--cut, SELL→--sell); row click → onJump(ts)
 *   8. Equity curve (backtest.json)
 *
 * Filename + default-export name are KEPT (OracleDash) to avoid import churn.
 * Props (FROZEN): {sym, row, slice, intel, bars, zh?, onClose?, onJump?}
 * Wired by the shell — do NOT import here.
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
  type: "BUY" | "SELL" | "REBUY" | "CUT" | string
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

/* intel.analysis — narrow to consumed sub-shapes */
interface Decision {
  verb?: string | null; verb_zh?: string | null
  tone?: string | null
  headline?: string | null; headline_zh?: string | null
  gloss?: string | null; gloss_zh?: string | null
  band?: string | null; band_label?: string | null; band_label_zh?: string | null
  name_label?: string | null; name_label_zh?: string | null
  score?: number | null
  trust_tier?: string | null; trust_en?: string | null; trust_zh?: string | null
}
interface Conviction {
  score?: number | null
  band?: string | null; band_zh?: string | null
  drivers?: string[] | null
  cautions?: string[] | null; cautions_zh?: string[] | null
  size_bucket?: string | null; size_pct?: number | null; size_note?: string | null
  rank_pctile?: number | null; potential?: number | null
}
interface Factors {
  z?: number | null
  legs?: Record<string, number | null> | null
}
interface Analysis {
  decision?: Decision | null
  conviction?: Conviction | null
  factors?: Factors | null
}
interface Intel {
  analysis?: Analysis | null
}

export interface OracleDashProps {
  sym: string
  row?: ManifestRow | null
  slice?: Slice | null
  intel?: Intel | null
  bars?: unknown
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

/** EXACT match to ChartPanel renderSignals marker fills:
 *  BUY→--buy, SELL→--sell, REBUY→--rebuy (lime), CUT→--cut (orange). */
function signalColor(type: string): string {
  const t = (type || "").toUpperCase()
  if (t === "BUY") return "var(--buy)"
  if (t === "REBUY") return "var(--rebuy)"
  if (t === "CUT") return "var(--cut)"
  if (t === "SELL") return "var(--sell)"
  return "var(--signal)"
}

/** legs → readable factor labels (bilingual) */
const FACTOR_LABELS: Record<string, [string, string]> = {
  momentum: ["Momentum", "动量"],
  value: ["Value", "价值"],
  quality: ["Quality", "质量"],
  profitability: ["Profitability", "盈利能力"],
  revisions: ["Revisions", "评级调整"],
  investment: ["Investment", "投资"],
  payout: ["Payout", "分红"],
  low_vol: ["Low vol", "低波动"],
  low_beta: ["Low beta", "低贝塔"],
  accruals: ["Accruals", "应计"],
  short_interest: ["Short interest", "空头持仓"],
}
function factorLabel(key: string, zh: boolean): string {
  const l = FACTOR_LABELS[key]
  return l ? pick(zh, l[0], l[1]) : key.replace(/_/g, " ")
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

/* ── ConvictionRing: small radial gauge for conviction.score (0-100) ── */
function ConvictionRing({ score, zh }: { score: number | null | undefined; zh: boolean }) {
  const s = score != null && isFinite(score) ? Math.max(0, Math.min(100, score)) : null
  const R = 22, C = 2 * Math.PI * R
  const off = s == null ? C : C * (1 - s / 100)
  const col = s == null ? "var(--muted)" : s >= 66 ? "var(--buy)" : s >= 40 ? "var(--signal)" : "var(--sell)"
  return (
    <div className="sig-ring" title={pick(zh, "Conviction", "信念度")}>
      <svg viewBox="0 0 56 56" aria-hidden>
        <circle cx="28" cy="28" r={R} fill="none" stroke="var(--line)" strokeWidth="5" />
        <circle cx="28" cy="28" r={R} fill="none" stroke={col} strokeWidth="5" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={off} transform="rotate(-90 28 28)" />
      </svg>
      <div className="sig-ring-v" style={{ color: col }}>{s != null ? Math.round(s) : "—"}</div>
    </div>
  )
}

/* ── FactorBar: one diverging factor leg (z-ish score, typ. -2..+2) ── */
function FactorBar({ label, value, zh }: { label: string; value: number | null | undefined; zh: boolean }) {
  const v = value != null && isFinite(value) ? value : null
  const CAP = 2
  const mag = v == null ? 0 : Math.max(-CAP, Math.min(CAP, v))
  const pct = (Math.abs(mag) / CAP) * 50 // half-width max
  const pos = v != null && v >= 0
  const col = v == null ? "var(--muted)" : pos ? "var(--up)" : "var(--down)"
  return (
    <div className="sig-fac-row">
      <span className="sig-fac-lbl">{label}</span>
      <div className="sig-fac-track">
        <span className="sig-fac-mid" />
        <span
          className="sig-fac-fill"
          style={{
            background: col,
            width: pct + "%",
            left: pos ? "50%" : (50 - pct) + "%",
          }}
        />
      </div>
      <span className="sig-fac-num" style={{ color: col }}>{v != null ? (v >= 0 ? "+" : "") + v.toFixed(2) : "—"}</span>
    </div>
  )
}

/* ── main component ───────────────────────────────────────────────────── */

export default function OracleDash({ sym, row, slice, intel, zh = false, onClose, onJump }: OracleDashProps) {
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
    ? (isBuy ? "var(--buy)" : ["SELL", "TRIM", "CUT"].includes(verdict.toUpperCase()) ? "var(--sell)" : "var(--signal)")
    : "var(--text-2)"

  // intel.analysis sub-shapes (all null-guarded)
  const analysis = intel?.analysis ?? null
  const decision = analysis?.decision ?? null
  const conviction = analysis?.conviction ?? null
  const factors = analysis?.factors ?? null

  const convScore = conviction?.score ?? decision?.score ?? null
  const drivers = Array.isArray(conviction?.drivers) ? conviction!.drivers! : []
  const cautions = Array.isArray(conviction?.cautions) ? conviction!.cautions! : []
  const cautionsZh = Array.isArray(conviction?.cautions_zh) ? conviction!.cautions_zh! : []
  const legs = factors?.legs ?? null
  const legKeys = legs ? Object.keys(legs) : []

  // decision verb tone → color
  const dTone = (decision?.tone || "").toLowerCase()
  const decisionColor = dTone === "go" ? "var(--buy)" : dTone === "stop" ? "var(--sell)" : "var(--signal)"

  // signals: most-recent first, ALL of them
  const sigs: Signal[] = [...(slice?.indicator?.signals ?? [])].reverse()

  const handleJump = (ts: string) => {
    // Dispatch the standard CustomEvent that ChartPanel listens for (R14)
    window.dispatchEvent(new CustomEvent("mm:chart-jump", { detail: { sym, ts } }))
    onJump?.(ts)
    onClose?.()
  }

  return (
    <div className="od-scrim" onClick={handleScrimClick} role="dialog" aria-modal="true" aria-label={pick(zh, "Signals Dashboard", "信号面板")}>
      <div className="od-panel" ref={panelRef}>
        {/* ── 1. header ── */}
        <div className="od-head">
          <span className="od-brand">
            <svg viewBox="0 0 24 24" aria-hidden="true" className="od-star">
              <path d="M12 2l2.2 5.8L20 10l-5.8 2.2L12 18l-2.2-5.8L4 10l5.8-2.2z" />
            </svg>
            {pick(zh, "Signals", "信号")}
          </span>
          <span className="od-sym">{sym}</span>
          <button className="od-close" onClick={onClose} aria-label={pick(zh, "Close", "关闭")}>×</button>
        </div>

        {/* ── scrollable body ── */}
        <div className="od-body">
          {/* 2. Golden Oracle scorecard */}
          <div className="sig-card">
            <div className="sig-card-h">{pick(zh, "Golden Oracle", "黄金神谕")}</div>
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
            {/* supporting dims from conviction/decision */}
            {(convScore != null || conviction?.band || conviction?.size_pct != null || decision?.band_label) && (
              <div className="sig-dims">
                {convScore != null && (
                  <div className="sig-dim">
                    <span className="sig-dim-k">{pick(zh, "Conviction", "信念度")}</span>
                    <span className="sig-dim-v">{Math.round(convScore)}<i>/100</i></span>
                  </div>
                )}
                {(conviction?.band || decision?.band_label) && (
                  <div className="sig-dim">
                    <span className="sig-dim-k">{pick(zh, "Band", "评级")}</span>
                    <span className="sig-dim-v">{pick(zh, conviction?.band ?? decision?.band_label, conviction?.band_zh ?? decision?.band_label_zh) || "—"}</span>
                  </div>
                )}
                {conviction?.size_pct != null && (
                  <div className="sig-dim">
                    <span className="sig-dim-k">{pick(zh, "Size", "仓位")}</span>
                    <span className="sig-dim-v">{Math.round(conviction.size_pct)}%</span>
                  </div>
                )}
                {conviction?.rank_pctile != null && (
                  <div className="sig-dim">
                    <span className="sig-dim-k">{pick(zh, "Rank", "排名")}</span>
                    <span className="sig-dim-v">{Math.round(conviction.rank_pctile)}<i>%ile</i></span>
                  </div>
                )}
              </div>
            )}
            {conviction?.size_note && (
              <div className="sig-conflict">{conviction.size_note}</div>
            )}
          </div>

          {/* 3. Research desk read */}
          {decision && (decision.verb || decision.headline) && (
            <div className="sig-card">
              <div className="sig-card-h">{pick(zh, "Research desk read", "研究台解读")}</div>
              <div className="sig-desk">
                <ConvictionRing score={convScore} zh={zh} />
                <div className="sig-desk-body">
                  <div className="sig-desk-verb" style={{ color: decisionColor }}>
                    {pick(zh, decision.verb, decision.verb_zh) || "—"}
                    {decision.band_label && (
                      <span className="sig-desk-band">{pick(zh, decision.band_label, decision.band_label_zh)}</span>
                    )}
                  </div>
                  {(decision.headline || decision.headline_zh) && (
                    <div className="sig-desk-head">{pick(zh, decision.headline, decision.headline_zh)}</div>
                  )}
                  {(decision.gloss || decision.gloss_zh) && (
                    <div className="sig-desk-gloss">{pick(zh, decision.gloss, decision.gloss_zh)}</div>
                  )}
                  {conviction?.rank_pctile != null && (
                    <div className="sig-desk-rank">{pick(zh, "Rank percentile", "排名分位")}: {Math.round(conviction.rank_pctile)}%</div>
                  )}
                </div>
              </div>
              <div className="sig-caveat">{pick(zh, "Context for the Oracle verdict — not a trade signal.", "作为神谕结论的背景参考——非交易信号。")}</div>
            </div>
          )}

          {/* 4. Drivers / Cautions */}
          {(drivers.length > 0 || cautions.length > 0) && (
            <div className="sig-card">
              <div className="sig-card-h">{pick(zh, "Drivers & Cautions", "驱动与警示")}</div>
              {drivers.length > 0 && (
                <div className="sig-tags">
                  {drivers.slice(0, 6).map((d, i) => (
                    <span key={"d" + i} className="sa-tag up">{d}</span>
                  ))}
                </div>
              )}
              {cautions.length > 0 && (
                <div className="sig-tags">
                  {cautions.slice(0, 6).map((c, i) => (
                    <span key={"c" + i} className="sa-tag warn">{pick(zh, c, cautionsZh[i] ?? c)}</span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 5. Factor profile */}
          {legKeys.length > 0 && (
            <div className="sig-card">
              <div className="sig-card-h">
                {pick(zh, "Factor profile", "因子画像")}
                {factors?.z != null && <span className="sig-card-sub">z {factors.z.toFixed(2)}</span>}
              </div>
              <div className="sig-factors">
                {legKeys.map((k) => (
                  <FactorBar key={k} label={factorLabel(k, zh)} value={legs![k]} zh={zh} />
                ))}
              </div>
            </div>
          )}

          {/* 6. Event edge */}
          {(decision?.trust_en || decision?.trust_zh) && (
            <div className="sig-card">
              <div className="sig-card-h">
                {pick(zh, "Event edge", "事件驱动优势")}
                {decision?.trust_tier && <span className="sig-card-sub">{decision.trust_tier}</span>}
              </div>
              <div className="sig-edge">{pick(zh, decision.trust_en, decision.trust_zh)}</div>
            </div>
          )}

          {/* 7. signal history table */}
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

          {/* 8. equity curve — only for flagships that have a backtest.json */}
          <BacktestCurve sym={sym} zh={zh} />

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
