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
  // Reworded (D3 honesty pass): "Managed signal intelligence" implied options provenance
  // this desk does not have. The eyebrow now states what it is and how often it moves.
  mastheadEyebrow:  ["Signal desk · nightly EOD", "信号台 · 每日收盘"],
  mastheadActive:   ["Active plans", "活跃计划"],
  mastheadFocus:    ["In focus", "当前焦点"],
  mastheadUpdated:  ["Model close", "模型收盘"],
  mastheadMarks:    ["Option marks", "期权报价"],
  mastheadMarksLive:["Live", "实时"],

  // ── Provenance (D3 honesty pass) ───────────────────────────────────────────
  // The desk is mounted in the Options Hub but the signals come from the stock factor
  // engine. Saying so is the whole point of this line — never soften it.
  provenanceLine: [
    "Source: Mastermind factor engine — nightly EOD standouts. Options shown as context overlays, not signal input.",
    "来源：Mastermind 因子引擎 — 每日收盘精选。期权仅为背景叠加信息，不参与信号生成。",
  ],
  provSource:       ["Mastermind factor engine", "Mastermind 因子引擎"],
  provCadence:      ["nightly EOD", "每日收盘"],
  provAuthority:    ["display only", "仅供展示"],
  tagDisplayOnly:   ["Display only", "仅供展示"],

  // ── Cadence / authority chips ──────────────────────────────────────────────
  cadenceLabel:     ["nightly EOD — updates after close", "每日收盘后更新"],
  authorityLabel:   ["display-only — forward ledger accruing", "仅供展示 — 前向账本积累中"],

  // ── Contract structure receipt (OEU T-E) ───────────────────────────────────
  // The receipt answers the three questions a reader has about a NAMED contract: what the
  // spread costs, whether anyone else is in the strike, and whether the option is dear for
  // THIS name. macro (lib/options_context.structure_receipt) ships the plain word and the
  // Tier-2 sentence pre-translated; only this chrome is local.
  structTitle:      ["Contract structure", "合约结构"],
  structAria:       ["Option contract structure receipt", "期权合约结构说明"],
  // Stated on the chip, because a spread and an OI count read as live numbers otherwise.
  structVintage:    ["at the close", "收盘时"],
  structYoung:      ["short IV history", "IV 历史较短"],
  // Absent-safe: a plan whose build predates the receipt, or a contract macro could not
  // price. Silence would leave the reader assuming the contract is fine to trade.
  structAbsent: [
    "Contract structure not published for this plan.",
    "该计划未发布合约结构数据。",
  ],

  // ── Sub-tabs ───────────────────────────────────────────────────────────────
  tabSignals:       ["Signals", "信号"],
  tabPerf:          ["PERF", "绩效"],

  // ── Signal stream ──────────────────────────────────────────────────────────
  signalStreamTitle:["Signal Stream", "信号流"],
  noPlans:          ["No active prophecies — ledger accruing.", "暂无活跃预测 — 账本积累中。"],
  // An empty desk must say WHICH empty it is: the run happened and published nothing,
  // rather than "still loading" or "broken".
  noPlansWhy: [
    "The nightly EOD run published no active plans. The forward ledger keeps accruing.",
    "每日收盘运行未发布活跃计划。前向账本持续积累。",
  ],
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

  // ── Geometry ladder ────────────────────────────────────────────────────────
  geometryTitle:    ["Trade Geometry", "交易结构"],
  stop:             ["STOP", "止损"],
  entry:            ["ENTRY", "入场"],
  last:             ["LAST", "现价"],
  t1:               ["T1", "T1"],
  t2:               ["T2", "T2"],
  rUnit:            ["R", "R"],
  distAway:         ["away", "距离"],
  horizonPct:       ["horizon used", "持有进度"],
  geometryEmpty:    ["Insufficient geometry data", "结构数据不足"],
  geometryEmptyWhy: [
    "Entry, stop and at least one target are required to draw the ladder.",
    "绘制价格阶梯需要入场价、止损价和至少一个目标价。",
  ],
  ladderCaption: [
    "Plan levels on one price axis. R is the entry-to-stop distance.",
    "同一价格轴上的计划价位。R 为入场价至止损价的距离。",
  ],
  // Wide-geometry display guard (D3 fix_spec 1). {r} = R in dollars, {pct} = R as % of entry.
  wideGeomTag:      ["Wide geometry", "结构过宽"],
  wideGeomBody: [
    "Targets are projected from a structural base-low stop (R = {r}, {pct}% of entry). Treat T1/T2 as geometry, not forecasts.",
    "目标价由结构性低点止损推算得出（R = {r}，为入场价的 {pct}%）。请将 T1/T2 视为几何推算，而非预测。",
  ],
  // Live payloads carry no last_price — say so rather than letting plan levels read as current.
  noLastNote: [
    "No intraday price in this payload — entry, stop and targets are plan levels, marked nightly.",
    "此数据包不含盘中价格 — 入场、止损与目标均为计划价位，按每日收盘更新。",
  ],

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
  optionExpand:     ["Show option contract", "显示期权合约"],
  optionCollapse:   ["Hide option contract", "隐藏期权合约"],
  // The contract is a suggested overlay on a stock signal — it never generated the signal.
  optionOverlayTag: ["Overlay — not signal input", "叠加信息 — 非信号来源"],

  // ── Analysis center / thesis ──────────────────────────────────────────────
  thesisLabel:      ["Signal Thesis", "信号论点"],
  thesisCaption:    ["Machine-generated from engine fields — display only", "由引擎字段自动生成 — 仅供展示"],
  // The dealer-positioning sentence is context appended by the options overlay, not a
  // driver of the signal — it is lifted out of the prose so it cannot read as one.
  positioningLabel: ["Dealer positioning — context overlay", "做市商持仓 — 背景叠加"],
  briefLabel:       ["What To Do Now", "当前操作建议"],
  briefCaption:     ["Phase-keyed action guide — display only", "阶段动作指南 — 仅供展示"],
  profitPlanLabel:  ["Profit Taking Plan", "利润获取计划"],
  profitPlanCaption:["Exit levels from engine geometry — display only", "引擎几何计算的退出位 — 仅供展示"],
  profitStatusActive:["ACTIVE", "进行中"],
  profitStatusPending:["PENDING", "待定"],
  profitStatusDone: ["DONE", "完成"],
  profitColLevel:   ["Level", "价位"],
  profitColAction:  ["Action", "操作"],
  profitColStatus:  ["Status", "状态"],
  rrLabel:          ["R/R at Entry", "入场风险收益比"],
  rrRisk:           ["Risk", "风险"],
  rrReward:         ["Reward (T1)", "收益(T1)"],
  rrRiskTile:       ["Risk to stop", "至止损风险"],
  rrRewardTile:     ["Reward to T1", "至 T1 收益"],
  horizonMeter:     ["Horizon used", "持有进度"],
  analysisTitle:    ["Analysis", "分析"],
  confidenceTitle:  ["Confidence Index", "置信度指标"],
  confidenceEyebrow:["Confidence", "置信度"],
  // Dossier meta line + per-plan provenance row.
  dossierSignalOn:  ["Signal", "信号日"],
  dossierConviction:["Conviction", "信心分"],
  // Component surfaces are honest about absence — the live payload publishes neither.
  verdictNoScore: [
    "No management score in this payload.",
    "此数据包未提供管理评分。",
  ],
  componentMixLabel:  ["Component mix", "分项构成"],
  componentMixCaption:[
    "Segment width is each component's share of the five component scores.",
    "分段宽度为各分项占五项分数之和的比重。",
  ],
  componentsAbsent: [
    "Component scores are not published in this payload — only the headline score is.",
    "此数据包未发布分项评分 — 仅提供总分。",
  ],

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
