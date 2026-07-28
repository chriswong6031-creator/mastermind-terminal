/**
 * flowdeskStrings.ts — complete EN/ZH string table for the Flow Desk surface.
 *
 * Pattern: each key maps to [English, 中文].
 * Getter: getFlowStr(lang, key) → string.
 *
 * HONESTY DOCTRINE (enforced here):
 *   - Direction labels always carry a "(~soft)" qualifier.
 *   - Tier names are descriptive magnitude labels — no claim of edge.
 *   - The LEAN chip tooltip explicitly disclaims tick-rule derivation.
 *   - No "validated", "predictive", or "empirically confirmed" language.
 *   - "Lean" is the approved word for direction; "buy/sell" is never asserted.
 *
 * NOTE: translated strings MUST NOT appear in HTML title= attributes (CI-guarded).
 * Use aria-label or visible text spans instead.
 */

import type { Lang } from "@/lib/i18n";

// ─── String table type ───────────────────────────────────────────────────────

type FlowDeskKey = keyof typeof FLOW_LEX;

const FLOW_LEX = {
  // ── Tab ────────────────────────────────────────────────────────────────────
  tabFlow: ["Flow Desk", "资金流"],

  // ── Filter panel labels ────────────────────────────────────────────────────
  filterType:           ["Type", "期权类型"],
  filterTypeCall:       ["Call", "认购"],
  filterTypePut:        ["Put", "认沽"],
  filterTypeAll:        ["All", "全部"],
  filterLean:           ["Lean (~soft)", "倾向（~软性）"],
  filterLeanBuy:        ["~buy", "~买入"],
  filterLeanSell:       ["~sell", "~卖出"],
  filterLeanMixed:      ["mixed", "混合"],
  filterScore:          ["Min score", "最低评分"],
  filterDte:            ["DTE bucket", "到期分组"],
  filterDteZero:        ["0DTE", "当日到期"],
  filterDte1_7:         ["1–7d", "1–7天"],
  filterDte8_30:        ["8–30d", "8–30天"],
  filterDte31_90:       ["31–90d", "31–90天"],
  filterDte90p:         [">90d", ">90天"],
  filterMoneyness:      ["Moneyness", "价值状态"],
  filterMnyItm:         ["ITM", "实值"],
  filterMnyAtm:         ["ATM", "平值"],
  filterMnyNearOtm:     ["Near OTM", "近虚值"],
  filterMnyFarOtm:      ["Far OTM", "深虚值"],
  filterMinPremium:     ["Min premium", "最低权利金"],
  filterExecType:       ["Execution", "执行方式"],
  filterFreshOnly:      ["Fresh (vol>OI)", "新仓（量超持仓）"],
  filterRepeatOnly:     ["Cluster / repeat", "重复/集群"],
  filterBadge:          ["Badge", "标记"],
  filterReset:          ["Reset", "重置"],
  filterApply:          ["Apply", "应用"],

  // ── Score tiers (descriptive magnitude — no edge claims) ──────────────────
  tierElite:  ["ELITE",  "顶级"],
  tierStrong: ["STRONG", "强势"],
  tierHigh:   ["HIGH",   "较高"],
  tierMedium: ["MEDIUM", "中等"],
  tierLow:    ["LOW",    "偏低"],

  tierEliteDesc:  ["Top-magnitude event — largest premium + structure alignment", "高权利金+结构共振的顶级事件"],
  tierStrongDesc: ["Strong premium and positioning signal", "强权利金与持仓信号"],
  tierHighDesc:   ["Above-average premium with supporting signals", "高于均值的权利金与支撑信号"],
  tierMediumDesc: ["Moderate premium; mixed or weaker structure", "中等权利金；结构信号偏弱"],
  tierLowDesc:    ["Below threshold — included for completeness", "低于阈值，仅供参考"],

  // ── Badge names ────────────────────────────────────────────────────────────
  badgeWhale:   ["WHALE",   "巨鲸"],
  badgeCluster: ["CLUSTER", "集群"],
  badgeSweep:   ["SWEEP",   "扫单"],
  badgeUnusual: ["UNUSUAL", "异常"],
  badgeBlock:   ["BLOCK",   "大宗"],

  badgeWhaleDesc:   ["Premium ≥$1M single event", "单笔权利金≥100万美元"],
  badgeClusterDesc: ["Repeat-root: multiple prints on this underlying this session (not a $-sized campaign)", "重复标的：本时段该标的多次成交（非按金额的集群）"],
  badgeSweepDesc:   ["Multi-exchange heuristic — labeled, not confirmed aggressor", "多交易所启发式扫单 — 标记，非确认主动方"],
  badgeUnusualDesc: ["Premium activity is much higher than its typical one-year level", "权利金活跃度显著高于过去一年的常态"],
  badgeBlockDesc:   ["Large single-print block; size ≥500 contracts", "单笔大宗；规模≥500张"],

  // ── Flow Gauge labels ──────────────────────────────────────────────────────
  gaugeTitle:      ["Flow Gauge", "资金流量表"],
  gaugeCallPrem:   ["Call premium", "认购权利金"],
  gaugePutPrem:    ["Put premium", "认沽权利金"],
  gaugePcRatio:    ["P/C ratio", "认沽/认购比"],
  gaugeNetSoft:    ["Net (~soft)", "净值（~软性）"],
  gaugeSessionPct: ["Session", "盘中进度"],

  // ── Smart Money Radar ──────────────────────────────────────────────────────
  radarTitle:     ["Smart Money Radar", "聪明钱雷达"],
  radarSubtitle:  ["Ranked by premium activity versus the past trading year", "按权利金活动相对过去一年排名"],
  radarPremZ:     ["Activity", "活跃度"],
  radarGrossPrem: ["Gross prem", "总权利金"],
  radarCallShare: ["Call share", "认购占比"],
  radarNEvents:   ["Events", "事件数"],
  radarBaseline:  ["baseline warming", "基线积累中"],

  // ── Watchlist rail ─────────────────────────────────────────────────────────
  watchlistTitle:     ["Watchlist", "自选期权"],
  watchlistAdd:       ["Add ticker", "添加代码"],
  watchlistEmpty:     ["No tickers — add one to track its flow", "暂无代码，添加后可跟踪其资金流"],
  watchlistBestScore: ["Best score today", "今日最高评分"],
  watchlistNoFlow:    ["No flow today", "今日无流向"],

  // ── Inspector panel ────────────────────────────────────────────────────────
  inspectorTitle:      ["Inspector", "详情"],
  inspectorContract:   ["Contract", "合约"],
  inspectorPremium:    ["Premium", "权利金"],
  inspectorSize:       ["Size", "数量"],
  inspectorAvgPx:      ["Avg price", "均价"],
  inspectorDte:        ["DTE", "到期天数"],
  inspectorVolGtOi:    ["Vol > OI", "成交量>持仓"],
  inspectorVolGtOiYes: ["Yes — fresh positioning", "是 — 新开仓"],
  inspectorVolGtOiNo:  ["No", "否"],
  inspectorRepeated:   ["Repeated", "重复"],
  inspectorNPrints:    ["Prints", "笔数"],
  inspectorScore:      ["Flow score", "资金流评分"],
  inspectorScoreNote:  ["Magnitude-based composite — see components below", "基于权利金规模的综合评分 — 详见各分项"],
  inspectorComponents: ["Score components", "评分分项"],
  inspectorLean:       ["Lean (~soft)", "倾向（~软性）"],
  inspectorLeanNote:   ["Tick-rule derived — magnitude is the reliable read", "基于tick规则推算 — 权利金规模是可靠的读数"],
  inspectorClose:      ["Close", "关闭"],

  // ── Chain Heat rail ────────────────────────────────────────────────────────
  chainHeatTitle:     ["Chain Heat", "链式热度"],
  chainHeatSubtitle:  ["Contract-day accumulation ≥$3M", "合约日累计权利金≥300万美元"],
  chainHeatAlertCt:   ["hits", "笔"],
  chainHeatSpan:      ["span", "时长"],
  chainHeatAskShare:  ["at ask", "按卖价成交"],
  chainHeatFirstSeen: ["first seen", "首次出现"],
  chainHeatDte:       ["DTE", "到期天数"],
  chainHeatLeanAccum: ["accumulation", "积累"],
  chainHeatLeanDist:  ["distribution", "派发"],
  chainHeatContested: ["contested", "争议"],
  chainHeatLeanNote:  ["ask-share derived — not NBBO", "基于卖价成交比 — 非NBBO"],
  chainHeatEmpty:     ["No campaigns today — accumulation threshold ≥$3M", "今日无集群 — 累计阈值≥300万美元"],
  chainHeatLoading:   ["Loading chain heat…", "加载链式热度中…"],

  // ── Soft-direction tooltip (HONESTY DOCTRINE — the key required copy) ──────
  leanTooltip: [
    "Lean is tick-rule derived — magnitude is the reliable read. Direction without NBBO is approximate (~0.41 recovery). Color and rank use premium size, not asserted side.",
    "倾向基于tick规则推算 — 权利金规模才是可靠读数。无NBBO时方向为近似值（约0.41正确率）。颜色与排名基于权利金规模，非声称的买卖方向。",
  ],

  // ── Empty / loading states ─────────────────────────────────────────────────
  loading:       ["Loading…", "加载中…"],
  loadingFeed:   ["Loading flow feed…", "加载资金流中…"],
  loadingRadar:  ["Loading radar…", "加载雷达中…"],
  emptyFeed:     ["No events match the current filters", "当前筛选无匹配事件"],
  emptyFeedHint: ["Try clearing filters or lowering the min-premium threshold", "尝试清除筛选条件或降低最低权利金阈值"],
  errFeed:       ["Could not load flow feed", "无法加载资金流"],
  errRetry:      ["Retry", "重试"],

  // ── Misc ───────────────────────────────────────────────────────────────────
  scoreLabel:       ["Score", "评分"],
  premiumLabel:     ["Prem", "权利金"],
  sideLabel:        ["Side", "方向"],
  sizeLabel:        ["Size", "数量"],
  dteLabel:         ["DTE", "到期天数"],
  strikeLabel:      ["Strike", "行权价"],
  expLabel:         ["Exp", "到期日"],
  typeCall:         ["Call", "认购"],
  typePut:          ["Put", "认沽"],
  displayOnly:      ["Display-only — not investment advice", "仅供展示 — 非投资建议"],
  softDirection:    ["~soft direction", "~软性方向"],
  noNbbo:           ["Direction without NBBO is approximate", "无NBBO时方向为近似值"],
  baselineWarming:  ["baseline warming (<30 sessions)", "基线积累中（<30个交易日）"],
} as const;

// ─── Typed getter ─────────────────────────────────────────────────────────────

/**
 * Get a localized string from the Flow Desk string table.
 *
 * @param lang - "en" | "zh"
 * @param key  - A key from FLOW_LEX
 * @returns The localized string for the given language.
 *
 * Usage:
 *   const t = (key: FlowDeskKey) => getFlowStr(lang, key);
 *   t("leanTooltip") // returns the EN or ZH string depending on lang
 */
export function getFlowStr(lang: Lang, key: FlowDeskKey): string {
  const entry = FLOW_LEX[key];
  return lang === "zh" ? entry[1] : entry[0];
}

/**
 * Returns a bound getter for a fixed language — useful inside components.
 *
 * @param lang - "en" | "zh"
 * @returns (key: FlowDeskKey) => string
 *
 * Usage:
 *   const t = makeFlowT(lang);
 *   t("tierElite") // "ELITE" or "顶级"
 */
export function makeFlowT(lang: Lang): (key: FlowDeskKey) => string {
  return (key: FlowDeskKey) => getFlowStr(lang, key);
}

// Export the key type for consuming components
export type { FlowDeskKey };

// ─── Compat exports for pre-generated component stubs ────────────────────────
// Components under terminal/components/flowdesk/ import `FD` (an object with
// { en, zh } per key) and `strings` (imported but currently unused).
// These aliases keep those imports compiling without modifying components.

type BiStr = { en: string; zh: string };

function bi(en: string, zh: string): BiStr { return { en, zh }; }

/**
 * FD — flat object of bilingual string pairs, for components that use the
 * `FD.keyName.en` / `FD.keyName.zh` access pattern.
 */
export const FD = {
  // Used in RadarStrip
  smartMoneyRadar: bi(...FLOW_LEX.radarTitle),
  radarBaseline:   bi(...FLOW_LEX.radarBaseline),
  // Used in FlowGauge
  sessionGauge:    bi(...FLOW_LEX.gaugeTitle),
  sessionOverview: bi("Session overview", "盘中概览"),
  // Used in InspectorPane
  inspectorEmpty:  bi("Select an event to inspect", "选择事件查看详情"),
  // Used in watchlist rail
  watchlist:       bi(...FLOW_LEX.watchlistTitle),
} as const;

/**
 * strings — legacy named export (imported but not yet accessed in components).
 * Forwards to the same FLOW_LEX table via the getFlowStr interface.
 */
export const strings = {
  get: getFlowStr,
  make: makeFlowT,
} as const;
