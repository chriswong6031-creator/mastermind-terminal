/**
 * gexStrings.ts — bilingual EN/ZH string table for the GEX Desk surface.
 *
 * Pattern matches flowdeskStrings.ts: each key maps to [English, 中文].
 *
 * HONESTY DOCTRINE (enforced here):
 *   - GEX levels are a LEVELS MAP, display-only until forward-vol gate (~Sept 2026).
 *   - Dealer-sign is an ASSUMPTION (standard convention), not a verified fact.
 *   - Single-name GEX regime is a near-constant product attribute, not time-varying signal.
 *   - No "validated", "predictive", or directional trade-signal language.
 *   - State descriptions are structural/descriptive, not forecasts.
 *
 * NOTE: translated strings MUST NOT appear in HTML title= attributes (CI-guarded).
 * Use aria-label or visible text spans instead.
 */

import type { Lang } from "@/lib/i18n";

const GEX_LEX = {
  // ── Tab / surface header ───────────────────────────────────────────────────
  gexTitle:        ["GEX Desk", "敞口台"],
  gexSubtitle:     ["Dealer gamma levels map", "做市商伽马水平图"],

  // ── Controls ───────────────────────────────────────────────────────────────
  tickerInputLabel:  ["Ticker", "代码"],
  tickerPlaceholder: ["SPY", "SPY"],
  expiryAll:         ["ALL", "全部"],
  expiryChipDte:     ["DTE", "到期天数"],

  // ── Greek exposure lens (GEX / DEX / VEX / CHEX switcher) ───────────────────
  // Acronyms are identical EN/ZH; the aria + full names carry the translation.
  greekLensAria:  ["Exposure greek", "敞口希腊值"],
  greekGamma:     ["GEX", "GEX"],
  greekDelta:     ["DEX", "DEX"],
  greekVanna:     ["VEX", "VEX"],
  greekCharm:     ["CHEX", "CHEX"],
  greekGammaFull: ["Gamma exposure", "伽马敞口"],
  greekDeltaFull: ["Delta exposure", "德尔塔敞口"],
  greekVannaFull: ["Vanna exposure", "Vanna 敞口"],
  greekCharmFull: ["Charm exposure", "Charm 敞口"],
  // Walls/flip are gamma-only constructs — this note shows when a non-gamma lens is active.
  greekLensNote:  ["walls & flip apply to gamma only", "墙与翻转仅适用于伽马"],
  ladderNetPrefix:["Net", "净"],

  // ── Summary bar labels ─────────────────────────────────────────────────────
  sumNetGex:      ["Net GEX", "净GEX"],
  sumCallWall:    ["Call Wall", "看涨墙"],
  sumPutSupport:  ["Put Support", "看跌墙"],
  sumMagnet:      ["Magnet / HVL", "磁吸 / 高量位"],
  sumMaxPain:     ["Max Pain", "最大痛苦点"],
  sumPcOi:        ["P/C Ratio", "认沽/认购比"],
  sumCallOI:      ["Call OI", "认购持仓"],
  sumPutOI:       ["Put OI", "认沽持仓"],
  sumIv30:        ["IV30", "30日IV"],
  sumFlip:        ["Gamma Flip", "伽马翻转"],
  sumNotAvail:    ["—", "—"],

  // ── Expiry dropdown ────────────────────────────────────────────────────────
  expiryDropdownLabel: ["All expirations", "全部到期日"],
  expiry0Dte:          ["0DTE", "当日到期"],
  expiryAggregateNote: ["net-γ by expiry — ladder is all-expiry aggregate", "按到期日净伽马 — 梯图为全到期日合计"],

  // ── Strike ladder ──────────────────────────────────────────────────────────
  ladderTitle:      ["Strike Ladder", "行权价梯度"],
  ladderCallWall:   ["WALL", "看涨墙"],
  ladderPutSupport: ["SUPPORT", "看跌墙"],
  ladderMagnet:     ["MAGNET", "磁吸"],
  ladderFlip:       ["FLIP", "翻转"],
  ladderSpot:       ["SPOT", "现价"],
  ladderNetGex:     ["Net GEX", "净GEX"],
  ladderCallGex:    ["Call GEX", "认购GEX"],
  ladderPutGex:     ["Put GEX", "认沽GEX"],
  ladderStrike:     ["Strike", "行权价"],
  ladderFlipLine:   ["Γ FLIP", "Γ翻转"],
  ladderNoData:     ["No GEX for this ticker yet — indices + liquid single names build nightly", "该品种暂无GEX — 指数与高流动性个股每日夜间构建"],
  ladderLoading:    ["Loading strike ladder…", "加载行权价梯度中…"],

  // ── Market state card ──────────────────────────────────────────────────────
  stateTitle:         ["Market State", "市场状态"],
  stateComputing:     ["State computing — nightly", "状态计算中 — 每日更新"],
  stateRegimeLabel:   ["Regime", "状态"],
  stateStability:     ["Stability", "稳定性"],
  stateGravity:       ["Gravity", "引力"],
  stateGravityUp:     ["up", "向上"],
  stateGravityDown:   ["down", "向下"],
  stateGravityNeutral:["neutral", "中性"],
  statePinTarget:     ["Pin Target", "锁定目标"],
  statePinProb:       ["prob", "概率"],
  statePinNone:       ["—", "—"],
  stateCascadeTrigger:["Cascade Trigger", "瀑布触发"],
  stateUpsideTrigger: ["Upside Trigger", "上行触发"],
  stateRange:         ["Structural Range", "结构区间"],
  stateNetGamma:      ["Net γ", "净伽马"],
  stateGammaPos:      ["POSITIVE", "正值"],
  stateGammaNeg:      ["NEGATIVE", "负值"],

  // ── Regime names + one-line honest structural theses ──────────────────────
  // These are structural descriptions only — not trade forecasts.
  regimePIN:        ["PIN", "锁定"],
  regimeDRIFT:      ["DRIFT", "漂移"],
  regimeRANGE:      ["RANGE", "区间"],
  regimeTRANSITION: ["TRANSITION", "转变"],
  regimeTREND:      ["TREND", "趋势"],
  regimeCASCADE:    ["CASCADE", "瀑布"],
  regimeUNKNOWN:    ["UNKNOWN", "未知"],

  // One-line structural theses per regime (display-only, not forecasts)
  thesisPIN:        [
    "Strong dealer positioning near magnet — bounded range structure.",
    "做市商持仓集中于磁吸附近，区间结构稳固。",
  ],
  thesisDRIFT:      [
    "Saturated positive gamma — passive positioning, pinning weaker.",
    "正伽马饱和，被动持仓，锁定效果趋弱。",
  ],
  thesisRANGE:      [
    "Positive gamma dominant — mean-reverting structure between walls.",
    "正伽马主导，两墙之间均值回归结构。",
  ],
  thesisTRANSITION: [
    "Near gamma flip — structural sensitivity elevated, regime shift possible.",
    "接近伽马翻转，结构敏感性上升，可能发生状态切换。",
  ],
  thesisTREND:      [
    "Negative gamma — dealer hedging amplifies moves directionally.",
    "负伽马，做市商对冲放大单边走势。",
  ],
  thesisCASCADE:    [
    "Deep negative gamma — sharp move amplification likely near limit breaks.",
    "深度负伽马，关键位突破时跌势放大风险上升。",
  ],
  thesisUNKNOWN:    [
    "Insufficient chain data for regime classification.",
    "链条数据不足，无法分类状态。",
  ],

  // ── Passport / honesty caveat chips (non-negotiable display) ──────────────
  passportIndex:    [
    "Levels map — dealer-sign assumed; display-only",
    "水平图 — 假定做市商符号；仅供展示",
  ],
  passportSingleName: [
    "Single-name GEX — regime is a near-constant product attribute, not a time-varying signal",
    "个股GEX — 状态为近似固定的产品属性，非实时信号",
  ],
  passportGate:     [
    "Forward-vol gate: display-only until ~Sept 2026",
    "前向波动率验证中：~2026年9月前仅供展示",
  ],

  // ── GEX Guide ─────────────────────────────────────────────────────────────
  guideTitle:       ["How to Read GEX", "如何解读GEX"],
  guideToggleOpen:  ["How to Read ▼", "解读指南 ▼"],
  guideToggleClose: ["How to Read ▲", "解读指南 ▲"],

  guideGexTerm:   ["GEX (Gamma Exposure)", "GEX（伽马敞口）"],
  guideGexBody:   [
    "A map of where the largest options positions sit and where dealer hedging activity concentrates. Sign is the standard dealer convention (calls +, puts −) — an assumption, not a measured fact. Magnitude is the reliable read.",
    "显示最大期权持仓的分布图，以及做市商对冲活动的集中区域。符号遵循标准做市商惯例（认购为正，认沽为负）——这是假设而非实测事实。数量级才是可靠的读数。",
  ],
  guideCallWallTerm: ["Call Wall", "看涨墙"],
  guideCallWallBody: [
    "The strike with the strongest call-side dealer gamma above spot. Price movement toward this level faces concentrated hedge-driven supply. A descriptive level — not a forecast of reversal.",
    "现价上方认购端做市商伽马最强的行权价。价格向该水平运动时，面临集中的对冲驱动抛压。这是一个描述性水平，而非反转预测。",
  ],
  guidePutSupportTerm: ["Put Support", "看跌墙"],
  guidePutSupportBody: [
    "The strike with the strongest put-side dealer gamma below spot. Describes where hedge-driven demand concentrates on the downside. A descriptive level — not a forecast of bounce.",
    "现价下方认沽端做市商伽马最强的行权价。描述下行时对冲驱动需求的集中区域。这是一个描述性水平，而非反弹预测。",
  ],
  guideMagnetTerm: ["Magnet / HVL", "磁吸 / 高量位"],
  guideMagnetBody: [
    "The High-Volume Level — the strike between the walls with the highest combined OI and gamma proximity to spot. Historically shows price clustering in positive-gamma regimes. Display-only until gauntleted.",
    "高量位 — 两墙之间对现价综合持仓量与伽马最大的行权价。在正伽马状态下历史上显示出价格聚集效应。正式验证前仅供展示。",
  ],
  guideFlipTerm: ["Gamma Flip", "伽马翻转"],
  guideFlipBody: [
    "The estimated price level where net dealer gamma changes sign. Above it, dealer hedging is conventionally stabilizing (positive gamma). Below it, hedging conventionally amplifies moves (negative gamma). Method: zero-crossing of the GEX profile curve — an approximation with acknowledged error bounds.",
    "净做市商伽马符号改变的估算价格水平。该水平以上，做市商对冲通常起稳定作用（正伽马）；以下则通常放大波动（负伽马）。方法：GEX曲线零交叉点估算——为近似值，存在已知误差范围。",
  ],
  guideRegimeTerm: ["Regime States", "状态分类"],
  guideRegimeBody: [
    "PIN / DRIFT / RANGE: positive gamma regimes — structural tendency toward bounded, mean-reverting price action. TRANSITION: near the flip — elevated sensitivity. TREND / CASCADE: negative gamma regimes — moves potentially amplified. These are structural descriptions, not forecasts.",
    "PIN / DRIFT / RANGE：正伽马状态——结构上趋向有界均值回归走势。TRANSITION：接近翻转点——敏感性上升。TREND / CASCADE：负伽马状态——走势可能被放大。以上均为结构性描述，非价格预测。",
  ],
  guideDealerSignTerm: ["Dealer-Sign Assumption", "做市商符号假设"],
  guideDealerSignBody: [
    "All GEX calculations assume dealers sold the options in the chain (standard convention). If significant dealer-long positioning exists (e.g. bought protection), the sign assumption fails and all derived levels invert. This is a known limitation of all publicly-available GEX products. Single-name GEX is especially fragile — regime classification may be near-constant rather than dynamic.",
    "所有GEX计算均假设做市商卖出了链中期权（标准惯例）。若存在大量做市商净多持仓（如购买保护），符号假设失效，所有衍生水平将反转。这是所有公开GEX产品的已知局限。个股GEX尤为脆弱——状态分类可能近似为固定值而非动态变化。",
  ],

  // ── Loading / error / placeholder states ──────────────────────────────────
  loading:         ["Loading…", "加载中…"],
  loadingGex:      ["Loading GEX data…", "加载GEX数据中…"],
  errorGex:        ["Could not load GEX data", "无法加载GEX数据"],
  errorRetry:      ["Retry", "重试"],
  noGexData:       ["No GEX data for this ticker", "该品种暂无GEX数据"],
  stateAbsent:     ["State computing — nightly", "状态计算中 — 每日更新"],

  // ── Tooltip / hover labels ─────────────────────────────────────────────────
  tooltipNetGex:   ["Net GEX", "净GEX"],
  tooltipCallGex:  ["Call GEX", "认购GEX"],
  tooltipPutGex:   ["Put GEX", "认沽GEX"],
  tooltipTotalOi:  ["Total OI", "总持仓"],
  tooltipCallOi:   ["Call OI", "认购持仓"],
  tooltipPutOi:    ["Put OI", "认沽持仓"],

  // ── Data freshness ─────────────────────────────────────────────────────────
  asOf:            ["as of", "更新于"],
  lastSession:     ["last session", "上一交易日"],
  daysOld:         ["{n}d old", "{n}天前"],
  dataEod:         ["EOD", "收盘数据"],
  dataIntraday:    ["intraday", "盘中"],
} as const;

type GexDeskKey = keyof typeof GEX_LEX;

export function getGexStr(lang: Lang, key: GexDeskKey): string {
  const entry = GEX_LEX[key as keyof typeof GEX_LEX];
  if (!entry) return "";
  return lang === "zh" ? entry[1] : entry[0];
}

export function makeGexT(lang: Lang): (key: GexDeskKey) => string {
  return (key: GexDeskKey) => getGexStr(lang, key);
}

export type { GexDeskKey };
