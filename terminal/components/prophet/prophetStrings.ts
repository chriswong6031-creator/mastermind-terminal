/**
 * prophetStrings.ts — bilingual EN/ZH string table for the Prophet Desk surface.
 *
 * Pattern matches flowdeskStrings.ts / gexStrings.ts: each key maps to [English, 中文].
 *
 * HONESTY DOCTRINE (non-negotiable):
 *   - Management confidence is a TRADE-STATE score, not a pick rank.
 *   - Ceiling 92 — uncertainty is honest; certainty is forbidden.
 *   - No "validated", "predictive", or directional claim language.
 *   - Thesis lines carry "machine-generated from engine fields" caption.
 *   - Cadence chip: "nightly EOD — updates after close".
 *   - Authority chip: "display-only — forward ledger accruing".
 *
 * NOTE: translated strings MUST NOT appear in HTML title= attributes (CI-guarded).
 * Use aria-label or visible text spans instead.
 */

import type { Lang } from "@/lib/i18n";

const PROPHET_LEX = {
  // ── Tab / surface header ───────────────────────────────────────────────────
  tabProphet:       ["Prophet", "预言台"],
  tabSubtitle:      ["Managed-pick desk", "主动选股台"],

  // ── Cadence / authority chips ──────────────────────────────────────────────
  cadenceLabel:     ["nightly EOD — updates after close", "每日收盘后更新"],
  authorityLabel:   ["display-only — forward ledger accruing", "仅供展示 — 前向账本积累中"],

  // ── Sub-tabs ───────────────────────────────────────────────────────────────
  tabSignals:       ["Signals", "信号"],
  tabPerf:          ["PERF", "绩效"],

  // ── Signal stream ──────────────────────────────────────────────────────────
  signalStreamTitle:["Signal Stream", "信号流"],
  noPlans:          ["No active prophecies — ledger accruing.", "暂无活跃预测 — 账本积累中。"],
  sortNew:          ["NEW", "最新"],
  sortBest:         ["BEST", "最优"],
  sortGainers:      ["GAINERS", "涨幅"],
  daysActive:       ["d active", "天活跃"],
  entryLabel:       ["Entry", "入场价"],
  phase:            ["Phase", "阶段"],
  t1Progress:       ["→ T1", "→ T1"],
  minHold:          ["min hold", "最短持有"],
  locked:           ["LOCKED", "锁定中"],
  eligible:         ["ELIGIBLE", "可退出"],
  hold:             ["HOLD", "持有"],

  // ── Direction badges ───────────────────────────────────────────────────────
  bull:             ["BULL", "做多"],
  bear:             ["BEAR", "做空"],

  // ── Lifecycle phases (7-phase) ────────────────────────────────────────────
  phasePretrigger:  ["Pre-Trigger", "触发前"],
  phaseTriggered:   ["Triggered", "已触发"],
  phaseAtT1:        ["At T1", "T1位"],
  phaseBetweenT1T2: ["T1→T2", "T1→T2"],
  phaseAtT2:        ["At T2", "T2位"],
  phaseOvertime:    ["Overtime", "超时"],
  phaseInvalidated: ["Invalidated", "已失效"],

  // ── Geometry rail ──────────────────────────────────────────────────────────
  geometryTitle:    ["Trade Geometry", "交易结构"],
  stop:             ["STOP", "止损"],
  entry:            ["ENTRY", "入场"],
  last:             ["LAST", "现价"],
  t1:               ["T1", "T1"],
  t2:               ["T2", "T2"],
  rUnit:            ["R", "R"],
  distAway:         ["away", "距离"],
  horizonPct:       ["horizon used", "持有进度"],

  // ── Confidence panel ────────────────────────────────────────────────────────
  confidenceHeader:    ["Management confidence — trade state, not a pick rank", "管理置信度 — 交易状态分，非选股排名"],
  confidenceCeil:      ["Ceiling: 92", "上限：92"],
  confidenceCeilNote:  ["Uncertainty is honest; certainty is forbidden.", "不确定性是诚实的；确定性是被禁止的。"],
  componentValidity:   ["Validity", "有效性"],
  componentProgress:   ["Progress", "进展"],
  componentPace:       ["Pace", "节奏"],
  componentRetention:  ["Retention", "价格保留"],
  componentOverlay:    ["Overlay", "市场叠加"],
  componentTooltipValidity:  [
    "Thesis validity: has the invalidation level been breached?",
    "论点有效性：止损位是否被突破？",
  ],
  componentTooltipProgress:  [
    "Progress toward T1: how far along the trade path?",
    "T1进展：距目标还有多远？",
  ],
  componentTooltipPace:      [
    "Pace vs expected: is the trade moving at the expected rate?",
    "节奏对比预期：交易速度是否符合预期？",
  ],
  componentTooltipRetention: [
    "Price retention: is the trade holding its gains?",
    "价格保留：交易是否保住盈利？",
  ],
  componentTooltipOverlay:   [
    "Market overlay: macro/sector alignment with this trade.",
    "市场叠加：宏观/行业与该交易的一致性。",
  ],
  changeReasonLabel:   ["Change reason", "变化原因"],
  actionLabel:         ["Recommended action", "建议操作"],

  // ── Recommended actions (enum) ────────────────────────────────────────────
  actionWait:       ["Wait", "等待"],
  actionEnter:      ["Enter", "入场"],
  actionHold:       ["Hold", "持有"],
  actionTrim:       ["Trim", "减仓"],
  actionTrail:      ["Trail stop", "移动止损"],
  actionExit:       ["Exit", "退出"],
  actionInvalidated:["Invalidated", "已失效"],

  // ── Option sub-card ────────────────────────────────────────────────────────
  optionCardTitle:  ["Oracle Option", "期权方案"],
  optionType:       ["Type", "类型"],
  optionStrike:     ["Strike", "行权价"],
  optionExpiry:     ["Expiry", "到期日"],
  optionPremEntry:  ["Entry prem.", "入场权利金"],
  optionEodMark:    ["EOD mark", "收盘标记"],
  optionCall:       ["CALL", "认购"],
  optionPut:        ["PUT", "认沽"],

  // ── Analysis center / thesis ──────────────────────────────────────────────
  thesisLabel:      ["Signal Thesis", "信号论点"],
  thesisCaption:    ["Machine-generated from engine fields — display only", "由引擎字段自动生成 — 仅供展示"],
  briefLabel:       ["What To Do Now", "当前操作建议"],
  briefCaption:     ["Phase-keyed action guide — display only", "阶段动作指南 — 仅供展示"],
  profitPlanLabel:  ["Profit Taking Plan", "利润获取计划"],
  profitPlanCaption:["Exit levels from engine geometry — display only", "引擎几何计算的退出位 — 仅供展示"],
  profitStatusActive:["ACTIVE", "进行中"],
  profitStatusPending:["PENDING", "待定"],
  profitStatusDone: ["DONE", "完成"],
  rrLabel:          ["R/R at Entry", "入场风险收益比"],
  rrRisk:           ["Risk", "风险"],
  rrReward:         ["Reward (T1)", "收益(T1)"],
  analysisTitle:    ["Analysis", "分析"],
  confidenceTitle:  ["Confidence Index", "置信度指标"],

  // ── PERF sub-tab placeholder ───────────────────────────────────────────────
  perfPlaceholderTitle:  ["Outcome Ledger", "结果账本"],
  perfPlaceholderBody:   [
    "Outcome ledger accruing — performance will appear here once the forward ledger has sufficient closed trades.",
    "结果账本积累中 — 前向账本积累足够的已平仓交易后，绩效数据将在此显示。",
  ],

  // ── Loading / error states ─────────────────────────────────────────────────
  loading:    ["Loading…", "加载中…"],
  error:      ["Could not load prophet data.", "无法加载预言台数据。"],
  retry:      ["Retry", "重试"],
  asOf:       ["as of", "更新于"],
} as const;

type ProphetKey = keyof typeof PROPHET_LEX;

export function getProphetStr(lang: Lang, key: ProphetKey): string {
  const entry = PROPHET_LEX[key];
  if (!entry) return "";
  return lang === "zh" ? entry[1] : entry[0];
}

export function makeProphetT(lang: Lang): (key: ProphetKey) => string {
  return (key: ProphetKey) => getProphetStr(lang, key);
}

export type { ProphetKey };
