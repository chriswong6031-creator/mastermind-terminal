"use client"
/**
 * OracleDash — TWO-CONTAINER DOCK overlay (REVISION-SPEC Lane B4).
 *
 * Renders as a fixed overlay (sd-scrim + sd-dock) with two side-by-side
 * containers on web (Research Desk LEFT, Golden Oracle RIGHT) and stacked
 * full-screen on mobile.
 *
 * Props (FROZEN + new onOpenFull?):
 *   {sym, row, slice, intel, bars, zh?, onClose?, onJump?, onOpenFull?}
 */
import { useEffect, useMemo, useRef, useState } from "react"
import { pick, fmtPct, fmtDate } from "../../lib/finFormat"
import { LineSeries } from "./FinCharts"
import { getJSON } from "../../lib/dataCache"
import { oracleVerdict, deskVerdict } from "../../lib/signalVerdict"
import { computeTrendState } from "../../lib/trend"
import { computeRatings, verdictFromScore } from "../../lib/techRating"
import type { Bar } from "../../lib/fund"

/* ── staleness helper: days since intel.asof (returns 0 when missing/unparseable) ── */
function intelStaleDays(asof?: string | null): number {
  if (!asof) return 0
  const m = asof.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return 0
  const asofNoon = new Date(+m[1], +m[2] - 1, +m[3], 12, 0, 0, 0)
  const todayNoon = new Date(); todayNoon.setHours(12, 0, 0, 0)
  return Math.max(0, Math.round((todayNoon.getTime() - asofNoon.getTime()) / 86_400_000))
}

/* ── tech verdict → bilingual plain-word label ──────────────────────── */
function techVerdictLabel(v: string, zh: boolean): string {
  switch (v) {
    case "Strong buy": return zh ? "强烈买入" : "Strong buy"
    case "Buy": return zh ? "买入" : "Buy"
    case "Sell": return zh ? "卖出" : "Sell"
    case "Strong sell": return zh ? "强烈卖出" : "Strong sell"
    default: return zh ? "中性" : "Neutral"
  }
}

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
  // GC v2 keeper/recipe grading (BUY|REBUY only; absent on v1 slices, null tier/score for regime_blocked)
  quality?: "take" | "block" | "pending" | "regime_blocked" | string | null
  quality_reason?: string | null
  tier?: "aplus" | "quality" | "base" | string | null
  score?: number | null
  score_basis?: "full" | "partial" | string | null
  // CUT: scored:false — a caution, not a scored exit
  scored?: boolean | null
}

/** GC v2 structure-break warning side channel: {ts, kind:"arm"|"confirm"}. */
interface Warning {
  ts: string
  kind: "arm" | "confirm" | string
}

interface SliceIndicator {
  signals?: Signal[]
  early_dots?: string[]
  warnings?: Warning[]
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
  cards?: Record<string, any> | null   // live research-desk schema (ai_judgment · conviction · levels · analyst · smart_money)
  tape?: Record<string, any> | null    // ai_lean (dir) · regime · sector_pulse
  asof?: string | null                 // "YYYY-MM-DD" — date the research desk last ran for this name
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
  /** Opens the MegaPane full analysis view; passed from TerminalShell. */
  onOpenFull?: () => void
}

/* ── helpers ─────────────────────────────────────────────────────────── */

function fmt2(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return "—"
  return v.toFixed(2)
}

// size_pct arrives in percent form (e.g. 7.5 = 7.5%) on live data, but older/other
// emitters may send a 0..1 fraction. Treat <=1 as a fraction, >1 as already-percent
// so we never render "7500%". Returns a rounded whole-percent number.
function sizePctDisplay(v: number): number {
  return Math.round(v <= 1 ? v * 100 : v)
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

/** GC v2 tier → bilingual badge label. aplus="强烈 A+", quality="优质", base=none. */
function tierLabel(tier: string | null | undefined, zh: boolean): string {
  const t = (tier || "").toLowerCase()
  if (t === "aplus") return pick(zh, "A+", "A+级")
  if (t === "quality") return pick(zh, "Quality", "优质")
  return ""
}

/** GC v2 quality verdict → bilingual label + color. */
function qualityLabel(q: string | null | undefined, zh: boolean): string {
  const v = (q || "").toLowerCase()
  if (v === "take") return pick(zh, "Take", "采纳")
  if (v === "block") return pick(zh, "Blocked", "拦截")
  if (v === "pending") return pick(zh, "Pending", "待定")
  if (v === "regime_blocked") return pick(zh, "Regime-blocked", "结构破位")
  return ""
}
function qualityColor(q: string | null | undefined): string {
  const v = (q || "").toLowerCase()
  if (v === "take") return "var(--buy)"
  if (v === "block") return "var(--sell)"
  if (v === "pending") return "var(--signal)"
  if (v === "regime_blocked") return "var(--muted)"
  return "var(--muted)"
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

/* ── Icon constants — reused in .sd-ic container headers ────────────── */
const OracleStar = (
  <svg viewBox="0 0 24 24" aria-hidden style={{ width: 14, height: 14, fill: "var(--vc,var(--brand))", stroke: "none" }}>
    <path d="M12 2l2.2 5.8L20 10l-5.8 2.2L12 18l-2.2-5.8L4 10l5.8-2.2z" />
  </svg>
)
const DeskGlyph = (
  <svg viewBox="0 0 24 24" aria-hidden style={{ width: 14, height: 14, fill: "none", stroke: "var(--vc,var(--brand))", strokeWidth: 2 }}>
    <path d="M4 19V5M4 19h16M8 15l3-4 3 2 4-6" />
  </svg>
)

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

/* ── MarketRisk: compact regime chip (market_risk.json mirror of macro Risk Radar) ── */

interface MarketRiskDisplay {
  verdict?: string | null
  score?: number | null
  label_en?: string | null
  label_zh?: string | null
  color?: string | null
}
interface MarketRiskData {
  built?: string | null
  display?: MarketRiskDisplay | null
}

function MarketRiskChip({ zh }: { zh: boolean }) {
  const [data, setData] = useState<MarketRiskData | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch("/data/market_risk.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((raw: MarketRiskData | null) => {
        if (cancelled || !raw) return
        // graceful degradation: hide if data older than 48 h
        const built = raw?.built ? Date.parse(raw.built) : NaN
        if (!isNaN(built) && Date.now() - built > 48 * 3600 * 1000) return
        if (!raw?.display?.verdict) return
        setData(raw)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  if (!data) return null
  const disp = data.display!
  const dotColor = disp.color === "green" ? "var(--up)" : disp.color === "red" ? "var(--down)" : "var(--warn)"
  const label = pick(zh, disp.label_en ?? disp.verdict ?? "—", disp.label_zh ?? disp.verdict ?? "—")
  const score = disp.score != null && isFinite(disp.score) ? Math.round(disp.score) : null

  return (
    <div className="sig-conflict" style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--text-2)" }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor, flexShrink: 0, display: "inline-block" }} aria-hidden />
      <span style={{ fontWeight: 600, color: dotColor }}>{label}</span>
      {score != null && <span style={{ opacity: 0.7 }}>{score}/100</span>}
      <span style={{ marginLeft: "auto", opacity: 0.5, fontSize: "10px" }}>{pick(zh, "Market risk", "市场风险")}</span>
    </div>
  )
}

/* ── main component ───────────────────────────────────────────────────── */

export default function OracleDash({ sym, row, slice, intel, bars, zh = false, onClose, onJump, onOpenFull }: OracleDashProps) {
  const dockRef = useRef<HTMLDivElement>(null)

  // Rail-left measurement for web positioning
  const [railLeft, setRailLeft] = useState<number | null>(null)
  const [mobile, setMobile] = useState(false)

  useEffect(() => {
    function measure() {
      const r = document.querySelector(".rail")?.getBoundingClientRect()
      setRailLeft(r?.left ?? null)
      setMobile(window.innerWidth <= 860)
    }
    measure()
    window.addEventListener("resize", measure)
    return () => window.removeEventListener("resize", measure)
  }, [])

  const dockStyle: React.CSSProperties | undefined =
    !mobile && railLeft != null
      ? { right: Math.max(12, window.innerWidth - railLeft + 12) }
      : undefined

  // Esc to close — capture phase so it wins over ChartPanel/SearchModal handlers
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

  // Click outside the dock to close
  const handleScrimClick = (e: React.MouseEvent) => {
    if (dockRef.current && !dockRef.current.contains(e.target as Node)) {
      onClose?.()
    }
  }

  // Mobile swipe-to-close state (per-container, shared refs)
  const swipeStartY = useRef<number | null>(null)
  const handleTouchStart = (e: React.TouchEvent) => {
    swipeStartY.current = e.touches[0]?.clientY ?? null
  }
  const handleTouchMove = (e: React.TouchEvent) => {
    if (swipeStartY.current == null) return
    const dy = (e.touches[0]?.clientY ?? swipeStartY.current) - swipeStartY.current
    if (dy > 70) {
      swipeStartY.current = null
      onClose?.()
    }
  }

  // Derived verdicts using shared helpers (trend powers the stance ladder on stale events)
  const trendState = Array.isArray(bars) && (bars as Bar[]).length >= 200 ? computeTrendState(bars as Bar[]) : null
  const ov = oracleVerdict(row?.verdict ?? null, slice, zh, Date.now(), trendState)
  const dv = deskVerdict(intel, zh)

  // derived stats: prefer slice.backtest.metrics over row for consistency
  const bt = slice?.backtest
  const metrics = bt?.metrics
  const wr = metrics?.win_rate ?? row?.wr ?? null
  const pf = metrics?.profit_factor ?? row?.pf ?? null
  const cagr = metrics?.cagr ?? row?.cagr ?? null
  const nTrades = metrics?.n_trades ?? bt?.n_trades ?? null

  // Research-desk read from the LIVE intel `cards` + `tape` schema (the old `analysis.decision`
  // schema is deprecated → only carries confluence/sniper now, hence the previously-empty panel).
  const cards = intel?.cards ?? null
  const tape = intel?.tape ?? null
  const aj = cards?.ai_judgment ?? null            // decision: verdict + gloss + size_pct
  const conv = cards?.conviction ?? null           // score + band + drivers + cautions
  const sectorPulse = tape?.sector_pulse ?? null   // theme + heat + reco (supporting read)

  const convScore = typeof conv?.score === "number" ? conv.score : null
  const convBand = typeof conv?.band === "string" ? conv.band : null
  const drivers = Array.isArray(conv?.drivers) ? (conv!.drivers as string[]) : []
  const cautions = Array.isArray(conv?.cautions) ? (conv!.cautions as string[]) : []

  // ── Live tech rating (D1/D2) ──
  const barsArr: Bar[] = Array.isArray(bars) ? (bars as Bar[]) : []
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const techRatings = useMemo(() => (barsArr.length >= 30 ? computeRatings(barsArr) : null), [bars])
  const techOverall = techRatings?.summary[2].score ?? null   // [-1, 1]
  const techVerdict = techRatings?.summary[2].verdict ?? null // Verdict string

  // ── D1: Freshness discount ──
  const staleDays = intelStaleDays(intel?.asof)
  const freshnessW = Math.min(0.5, Math.max(0, (staleDays - 2) / 10))
  // Blended score. HOUSE LAW: tech may only DE-ESCALATE — take min(convScore, blend) so tech
  // can only pull the score down, never up a bearish/low-conviction desk read into buy colors.
  const _blend = (convScore != null && techOverall != null && freshnessW > 0)
    ? Math.round((1 - freshnessW) * convScore + freshnessW * ((techOverall + 1) / 2) * 100)
    : convScore
  const displayedScore: number | null = (_blend == null || convScore == null)
    ? _blend
    : Math.min(convScore, _blend)

  // ── D2: Disagreement haircut ──
  // deskLean: derive from tape.ai_lean.dir (BULL/BEAR)
  const deskLeanDir = String(intel?.tape?.ai_lean?.dir || "").toUpperCase()
  const deskLean = deskLeanDir === "BULL" ? 1 : deskLeanDir === "BEAR" ? -1 : 0
  const d2Cap = deskLean === 1 && techOverall != null && techOverall <= -0.3
  const d2Improve = deskLean === -1 && techOverall != null && techOverall >= 0.3
  // Color-coherence gate: when desk is NOT bullish (deskLean<=0), cap at 65 so the ring never
  // enters buy-green (≥66) — convScore is conviction magnitude, not direction; blending with
  // directional tech can collapse a high-conviction WAIT toward green despite a non-buy read.
  const _afterD2 = (displayedScore != null && d2Cap) ? Math.min(55, displayedScore) : displayedScore
  const finalScore = (freshnessW > 0 && _afterD2 != null && deskLean <= 0)
    ? Math.min(65, _afterD2)
    : _afterD2

  // signals: most-recent first, ALL of them
  const sigs: Signal[] = [...(slice?.indicator?.signals ?? [])].reverse()
  const latestSig = sigs[0] ?? null   // freshest signal (already reversed → index 0)

  // GC v2 side channel: surface the freshest structure-break warning only when it POST-DATES the
  // latest signal (i.e. new information the last marker doesn't yet reflect). ts are "YYYY-MM-DD" → lexical compare is chronological.
  const warnings: Warning[] = slice?.indicator?.warnings ?? []
  const latestWarn: Warning | null = warnings.length ? warnings[warnings.length - 1] : null
  const freshWarn: Warning | null =
    latestWarn && (!latestSig || latestWarn.ts > latestSig.ts) ? latestWarn : null

  const handleJump = (ts: string) => {
    // Dispatch the standard CustomEvent that ChartPanel listens for (R14)
    window.dispatchEvent(new CustomEvent("mm:chart-jump", { detail: { sym, ts } }))
    onJump?.(ts)
    onClose?.()
  }

  return (
    <div
      className="sd-scrim"
      onClick={handleScrimClick}
      role="dialog"
      aria-modal="true"
      aria-label={pick(zh, "Research Desk and Golden Oracle", "研究台与黄金神谕")}
    >
      <div className="sd-dock" ref={dockRef} style={dockStyle}>

        {/* ── Research Desk container (LEFT on web, TOP on mobile) ── */}
        <section
          className="sd-cont sd-rd"
          style={{ borderTopColor: dv.color, ["--vc" as any]: dv.color }}
        >
          <div className="sd-head">
            <span className="sd-ic">{DeskGlyph}</span>
            <span className="sd-lbl">{pick(zh, "Research Desk", "研究台")}</span>
            <button className="sd-x" onClick={onClose} aria-label={pick(zh, "Close", "关闭")}>×</button>
          </div>
          <div
            className="sd-grab"
            aria-hidden="true"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
          />
          <div className="sd-body">

            {/* Research desk read — decision + conviction ring from the live cards schema.
                Deliberately terse: the verdict line carries the read; blend/staleness mechanics
                stay silent (they still shape the ring score) instead of rendering meta-copy. */}
            {(aj?.verdict || convScore != null) && (
              <div className="sig-card">
                <div className="sig-desk">
                  {/* D1: ring shows blended score when desk data is stale */}
                  <ConvictionRing score={finalScore} zh={zh} />
                  <div className="sig-desk-body">
                    <div className="sig-desk-verb" style={{ color: dv.color }}>
                      {aj?.verdict || dv.label}
                      {convBand && <span className="sig-desk-band">{convBand}</span>}
                    </div>
                    {typeof aj?.size_pct === "number" && aj.size_pct > 0 && (
                      <div className="sig-desk-rank">{pick(zh, "Suggested size", "建议仓位")}: {sizePctDisplay(aj.size_pct)}%</div>
                    )}
                    {/* Technical rating line — reconciles desk read with live price action */}
                    {techVerdict != null && techOverall != null && (
                      <div className="sig-desk-tech">
                        <span className="sig-desk-tech-k">{pick(zh, "Technical rating", "技术评级")}</span>
                        <span className="sig-desk-tech-v" style={{ color: techOverall >= 0.1 ? "var(--up)" : techOverall <= -0.1 ? "var(--down)" : "var(--text-2)" }}>
                          {techVerdictLabel(techVerdict, zh)}
                          {" "}
                          <span className="sig-desk-tech-score">({techOverall >= 0 ? "+" : ""}{techOverall.toFixed(2)})</span>
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                {/* D2: disagreement caution/context chips */}
                {d2Cap && (
                  <div className="sig-caution-chip">
                    {pick(zh, "Technical tape disagrees", "技术面不支持")}
                  </div>
                )}
                {d2Improve && (
                  <div className="sig-context-chip">
                    {pick(zh, "Technical tape improving", "技术面转强")}
                  </div>
                )}
              </div>
            )}

            {/* Drivers / Cautions — from cards.conviction */}
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
                      <span key={"c" + i} className="sa-tag warn">{c}</span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Sector read — supporting context from tape.sector_pulse */}
            {sectorPulse?.theme_name && (
              <div className="sig-card">
                <div className="sig-card-h">
                  {pick(zh, "Sector", "板块")}
                  {sectorPulse.rank != null && sectorPulse.n_themes != null && (
                    <span className="sig-card-sub">#{sectorPulse.rank}/{sectorPulse.n_themes}</span>
                  )}
                </div>
                <div className="sig-desk-gloss">
                  {sectorPulse.theme_name}
                  {sectorPulse.label ? ` — ${sectorPulse.label}` : ""}
                  {sectorPulse.reco ? ` · ${pick(zh, "suggested", "建议")}: ${sectorPulse.reco}` : ""}
                </div>
              </div>
            )}

            {/* Open full analysis link */}
            {onOpenFull && (
              <button className="sd-full" onClick={onOpenFull}>
                {pick(zh, "Open full analysis", "打开完整分析")} ›
              </button>
            )}
          </div>
        </section>

        {/* ── Golden Oracle container (RIGHT on web, BOTTOM on mobile) ── */}
        <section
          className="sd-cont sd-go"
          style={{ borderTopColor: ov.color, ["--vc" as any]: ov.color }}
        >
          <div className="sd-head">
            <span className="sd-ic">{OracleStar}</span>
            <span className="sd-lbl">{pick(zh, "Golden Oracle", "黄金神谕")}</span>
            <button className="sd-x" onClick={onClose} aria-label={pick(zh, "Close", "关闭")}>×</button>
          </div>
          <div
            className="sd-grab"
            aria-hidden="true"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
          />
          <div className="sd-body">

            {/* Golden Oracle scorecard — the hero always carries its date; a stance renders
                smaller (descriptive posture) and a dim/undated event loses full saturation */}
            <div className="sig-card">
              <div className="od-hero">
                <div
                  className={"od-verdict" + (ov.stance ? " stance" : "") + (ov.dim && !ov.stance ? " dim" : "")}
                  style={{ color: ov.color }}
                >
                  {ov.label !== "—" ? ov.label : (row?.verdict ?? "—")}
                </div>
                {ov.sub && <div className="od-vsub">{ov.sub}</div>}
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
              {/* conviction/band/size intentionally NOT repeated here — they are the Research
                  Desk card's read (left/top); this card is the signal engine's scorecard */}
              {/* GC v2: latest signal's keeper quality + recipe tier (BUY|REBUY only) */}
              {latestSig && (latestSig.type === "BUY" || latestSig.type === "REBUY") && latestSig.quality && (
                <div className="sig-dims">
                  <div className="sig-dim">
                    <span className="sig-dim-k">{pick(zh, "Latest quality", "最新质量")}</span>
                    <span className="sig-dim-v" style={{ color: qualityColor(latestSig.quality) }}>
                      {qualityLabel(latestSig.quality, zh) || "—"}
                    </span>
                  </div>
                  {tierLabel(latestSig.tier, zh) && (
                    <div className="sig-dim">
                      <span className="sig-dim-k">{pick(zh, "Tier", "级别")}</span>
                      <span className="sig-dim-v" style={{ color: "var(--buy)" }}>{tierLabel(latestSig.tier, zh)}</span>
                    </div>
                  )}
                  {latestSig.score != null && isFinite(latestSig.score) && (
                    <div className="sig-dim">
                      <span className="sig-dim-k">{pick(zh, "Score", "评分")}</span>
                      <span className="sig-dim-v">{Math.round(latestSig.score)}<i>/100{latestSig.score_basis === "partial" ? "*" : ""}</i></span>
                    </div>
                  )}
                </div>
              )}
              {/* GC v2: fresh structure-break warning (only when it post-dates the latest signal) */}
              {freshWarn && (
                <div className="sig-conflict" style={{ color: "var(--warn)" }}>
                  {freshWarn.kind === "confirm"
                    ? pick(zh, "⛔ Structure break confirmed", "⛔ 结构破位（已确认）")
                    : pick(zh, "⚠ Structure-break warning (armed)", "⚠ 结构破位预警（预备）")}
                  <span style={{ opacity: 0.7, marginLeft: 6 }}>{fmtDate(freshWarn.ts)}</span>
                </div>
              )}
              {/* Market-level risk regime (macro Risk Radar mirror — additive, graceful-degrade) */}
              <MarketRiskChip zh={zh} />
            </div>

            {/* Signal history — compact date · price rows, scrollable (slim dark scrollbar) */}
            <div className="od-sig-section">
              <div className="od-sec-h">
                {pick(zh, "Signal history", "信号历史")}
                {sigs.length > 0 && <span className="od-sig-count">{sigs.length}</span>}
              </div>

              {sigs.length === 0 ? (
                <div className="fin-empty">{pick(zh, "No signals", "暂无信号")}</div>
              ) : (
                <div className="sd-siglist">
                  {sigs.map((sig, i) => {
                    const isEntry = sig.type === "BUY" || sig.type === "REBUY"
                    const isReclaim = sig.type === "RECLAIM"
                    const q = isEntry ? qualityLabel(sig.quality, zh) : ""
                    return (
                      <button key={i} className="sd-sigrow" onClick={() => handleJump(sig.ts)} title={isReclaim ? (sig.quality_reason || "") : pick(zh, "Jump to chart", "跳转到图表")}>
                        {/* tinted (not solid) pills — the signal color rides --sc; RECLAIM keeps the
                            hollow treatment (glyph law — never the solid entry pill) */}
                        <span
                          className={"sd-sig-badge" + (isReclaim ? " hollow" : "")}
                          style={{ ["--sc" as any]: isReclaim ? "var(--buy)" : signalColor(sig.type) }}
                        >
                          {isReclaim ? pick(zh, "RE-ENTRY", "再入场") : sig.type}
                        </span>
                        {/* pre-promotion display-tier markers (scored:false) carry the unscored tag;
                            scored reclaim-lane events are normal position events and need none */}
                        {isReclaim && sig.scored === false && <span className="sd-sig-q">{pick(zh, "unscored", "未计分")}</span>}
                        {q && <span className="sd-sig-q">{q}</span>}
                        <span className="sd-sig-date">{fmtDate(sig.ts)}</span>
                        <span className="sd-sig-price">{sig.price != null ? sig.price.toFixed(2) : "—"}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Equity curve */}
            <BacktestCurve sym={sym} zh={zh} />
          </div>
        </section>

      </div>
    </div>
  )
}
