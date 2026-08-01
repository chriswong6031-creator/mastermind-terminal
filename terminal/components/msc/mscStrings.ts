/**
 * mscStrings.ts — bilingual EN/ZH string table for the Market Structure Core panel.
 *
 * Pattern matches gexStrings.ts / structureStrings.ts: each key maps to [English, 中文].
 *
 * HONESTY DOCTRINE (enforced here — masterplan §4.1 tiering):
 *   - Tier A copy states the reading is magnitude-only and convention-independent.
 *   - Tier B copy ALWAYS carries the dealer-sign disclosure and the sensitivity verdict.
 *   - The scenario grid is named a LOCAL ESTIMATE wherever it appears; it is a first-order
 *     expansion around the published snapshot, not a re-priced book.
 *   - No support/resistance claim, no "validated"/"predictive" language, no win rates.
 *     Level *claims* need a live grade (wave R2.4) and are absent from this wave.
 *
 * NOTE: translated strings MUST NOT appear in HTML title= attributes (CI-guarded across
 * every options surface). Use the <Tip> primitive, aria-label, or a visible span.
 */

import type { Lang } from "@/lib/i18n";

const MSC_LEX = {
  // ── Drawer chrome ──────────────────────────────────────────────────────────
  panelTitle: ["Positioning Core", "持仓结构核心"],
  panelSub: ["Dealer positioning mechanics", "做市商持仓机制"],
  tierA: ["Magnitude", "量级"],
  tierB: ["Signed estimate", "带符号估计"],
  tierAWhy: [
    "Depends on gamma magnitude and open interest only — the dealer-sign assumption cannot change this reading.",
    "仅取决于伽马量级与未平仓量——做市商符号假设不会改变该读数。",
  ],
  tierBWhy: [
    "Inherits the payload's dealer-sign assumption. The sensitivity panel shows how much the reading depends on it.",
    "沿用数据中的做市商符号假设。敏感度面板显示该读数对此假设的依赖程度。",
  ],
  noData: ["No exposure ladder for this ticker yet.", "该品种暂无敞口梯图。"],
  loading: ["Loading…", "加载中…"],
  errorLoad: ["Could not load", "无法加载"],
  asofChip: ["Nightly EOD · as of {date}", "每日收盘 · 截至 {date}"],
  asofStale: ["{n} sessions old", "已过 {n} 个交易日"],
  emptyTitle: ["No positioning snapshot", "无持仓快照"],
  emptyWhy: [
    "The nightly options build covers the index anchors first, so a missing single name is a coverage gap rather than a broken desk. Try {sym} again after tonight's build, or pick another root.",
    "夜间期权构建优先覆盖指数锚定品种，因此缺少个股属于覆盖缺口而非故障。可在今晚构建后重试 {sym}，或选择其他标的。",
  ],
  windowed: [
    "{n} of {full} strikes — the published ladder is a ±20% window, so these are window sums, not the full book.",
    "{n}/{full} 个行权价——已发布梯图为 ±20% 窗口，因此为窗口合计而非完整持仓。",
  ],

  // ── Module A: sign sensitivity (Tier B) ────────────────────────────────────
  signTitle: ["Sign robustness", "符号稳健性"],
  signLead: [
    "How much does the long/short-gamma read depend on the dealer-sign assumption?",
    "多空伽马判断在多大程度上依赖做市商符号假设？",
  ],
  signRobust: ["Robust", "稳健"],
  signFragile: ["Fragile", "脆弱"],
  signUnknown: ["No gamma", "无伽马"],
  signTilt: ["Gamma tilt", "伽马倾斜"],
  signTiltWhy: [
    "Gross call gamma minus gross put gamma, over their sum. The margin by which the regime read survives a change of convention.",
    "看涨伽马总量减看跌伽马总量，再除以两者之和。该判断在符号约定变化下的安全边际。",
  ],
  signCritical: ["Flips at call weight", "翻转于看涨权重"],
  signCriticalWhy: [
    "Our published convention weights the call side at +1 (dealers long calls). This is the weight at which net gamma would be exactly zero.",
    "已发布约定将看涨方权重设为 +1（做市商持有看涨期权多头）。此为净伽马恰好为零时的权重。",
  ],
  signNoFlip: ["No plausible weight flips it", "任何合理权重都无法翻转"],
  signVerdictLbl: ["Verdict", "结论"],
  signCurve: ["Net gamma by call-side weight", "按看涨方权重的净伽马"],
  signRobustNote: [
    "The regime read survives the full range of conventions we consider plausible.",
    "该判断在我们认为合理的全部约定范围内均成立。",
  ],
  signFragileNote: [
    "Call and put gamma are close to balanced — a small change of convention would flip the regime read. Treat the sign as unresolved.",
    "看涨与看跌伽马接近平衡——约定的微小变化即可翻转该判断。应视符号为未定。",
  ],
  signConventionLabel: ["Convention", "约定"],
  signWeightPlus1: ["+1 dealers long calls", "+1 做市商看涨多头"],
  signWeight0: ["0 calls unsigned", "0 看涨方无符号"],
  signWeightMinus1: ["−1 dealers short calls", "−1 做市商看涨空头"],

  // ── Module B: gamma topology (Tier A) ──────────────────────────────────────
  topoTitle: ["Gamma topology", "伽马拓扑"],
  topoAbsStrike: ["Absolute gamma strike", "绝对伽马行权价"],
  topoAbsWhy: [
    "The strike carrying the most gamma in absolute terms (calls plus puts). Computed from magnitudes, so it does not inherit the dealer-sign assumption.",
    "以绝对值计伽马最大的行权价（看涨加看跌）。基于量级计算，因此不受做市商符号假设影响。",
  ],
  topoShare: ["of gross gamma", "占伽马总量"],
  topoRanked: ["Largest absolute-gamma strikes", "绝对伽马最大的行权价"],
  topoColStrike: ["Strike", "行权价"],
  topoColAbs: ["Abs gamma", "绝对伽马"],
  topoColShare: ["Share", "占比"],
  topoNone: ["No gamma in the published window.", "已发布窗口内无伽马。"],

  // ── Module C: hedge-flow scenario grid (Tier B) ────────────────────────────
  scenTitle: ["Hedge-flow scenarios", "对冲流量情景"],
  scenLead: [
    "Underlying a continuously hedged dealer would have to trade to stay flat.",
    "持续对冲的做市商为维持中性所需交易的标的数量。",
  ],
  scenAxisSpot: ["Spot move", "标的变动"],
  scenAxisVol: ["IV shock", "隐波冲击"],
  scenVolUnit: ["vol pts", "波动点"],
  scenBuy: ["dealers buy", "做市商买入"],
  scenSell: ["dealers sell", "做市商卖出"],
  scenLegend: ["Positive = dealers buy · negative = dealers sell", "正值＝做市商买入 · 负值＝做市商卖出"],
  scenCharm: ["One day of decay", "一日时间衰减"],
  scenCharmWhy: [
    "Delta drift from time passing alone, with spot and implied volatility unchanged — the charm bid or offer.",
    "仅因时间流逝产生的德尔塔漂移（标的与隐含波动率不变）——即 charm 带来的买盘或卖盘。",
  ],
  scenNoVanna: ["No vanna lens in this payload — the IV axis is gamma-only.", "该数据无 vanna 维度——隐波轴仅含伽马。"],
  scenNoCharm: ["No charm lens in this payload.", "该数据无 charm 维度。"],
  scenDisclose: [
    "Local estimate. A first-order expansion around the published snapshot: the greeks are measured at the current spot and are themselves functions of spot, so accuracy falls away from the centre. Bounded to ±3% and ±5 vol points for that reason.",
    "局部估计。围绕已发布快照的一阶展开：希腊值在当前标的价处测得，而其本身又是标的价的函数，因此偏离中心后精度下降。故限定在 ±3% 与 ±5 个波动点以内。",
  ],
  // The value is auto-scaled by the shared $mn formatter (it prints its own K/M/B
  // suffix), so this label names WHAT the number is, never its unit.
  scenUnit: ["Largest scenario", "最大情景"],

  // ── Module D: levels in expected-move units (Tier A) ───────────────────────
  emTitle: ["Levels in expected moves", "以预期波动计的水平"],
  emLead: [
    "Structural levels priced in today's expected move rather than in points — a level three expected moves away is not this session's structure.",
    "以当日预期波动而非点数衡量结构水平——距离三个预期波动的水平不构成当日结构。",
  ],
  emColLevel: ["Level", "水平"],
  emColPrice: ["Price", "价格"],
  emColDist: ["Distance", "距离"],
  emColEm: ["In EM", "预期波动数"],
  emReachable: ["in range", "可及"],
  emFar: ["far", "远"],
  emOneSigma: ["1σ expected move", "1σ 预期波动"],
  emHorizon: ["horizon {d}d", "期限 {d} 天"],
  emCalib: [
    "A same-multiplier band contained the next session's range in {pct} of {n} historical sessions.",
    "同倍数区间在 {n} 个历史交易日中的 {pct} 覆盖了下一交易日的波动范围。",
  ],
  emCalibCi: ["95% CI {lo}–{hi}", "95% 置信区间 {lo}–{hi}"],
  emNoBand: [
    "No expected-move band published for this ticker — distances are shown in percent only.",
    "该品种未发布预期波动区间——仅按百分比显示距离。",
  ],
  // ── Volland-parity wave 1: hedging-requirement framing ─────────────────────
  hgTitle: ["Hedging requirement by strike", "按行权价的对冲需求"],
  hgLead: [
    "Every greek on one axis: the underlying a continuously hedged dealer must transact. Not the exposure — the trade the exposure forces.",
    "所有希腊值统一到一个坐标：持续对冲的做市商需要交易的标的量。不是敞口本身，而是敞口所迫使的交易。",
  ],
  hgGreekAria: ["Greek lens", "希腊值维度"],
  hgViewAria: ["Chart form", "图表形式"],
  hgGamma: ["Gamma", "Gamma"],
  hgDelta: ["Delta", "Delta"],
  hgVanna: ["Vanna", "Vanna"],
  hgCharm: ["Charm", "Charm"],
  hgViewBars: ["By strike", "按行权价"],
  hgViewProfile: ["Cumulative", "累计"],
  hgPerUnit: ["per {u}", "每 {u}"],
  unitSpot: ["+1% spot", "标的 +1%"],
  unitVol: ["+1 vol point", "+1 波动点"],
  unitDay: ["+1 day", "+1 天"],
  unitPosition: ["position", "持仓"],
  hgSpot: ["spot", "现价"],
  hgLegend: ["Positive = dealers buy · negative = dealers sell", "正值＝做市商买入 · 负值＝做市商卖出"],
  hgAnchored: [
    "Anchored at spot: this greek measures a rate, so the curve reads zero at spot and accumulates outward — what dealers would transact travelling from here to there.",
    "以现价为锚：该希腊值衡量的是变化率，因此曲线在现价处为零并向两侧累计——即价格从此处移动到彼处时做市商需要交易的量。",
  ],
  hgUnanchored: [
    "Running total across the ladder: this greek measures a position level rather than a rate, so it is not anchored at spot.",
    "沿梯图的累计合计：该希腊值衡量的是持仓水平而非变化率，因此不以现价为锚。",
  ],
  hgNoLens: ["This greek is not published for the current ladder.", "当前梯图未发布该希腊值。"],
  hgScale: ["Largest bar ± {v}", "最大值 ± {v}"],

  tsTitle: ["Term structure of hedging", "对冲的期限结构"],
  tsLead: [
    "Where in TIME the dealer risk sits — the same requirement, per expiration, accumulating from the nearest outward.",
    "做市商风险在时间上的分布——同一对冲需求按到期日展开，并自最近到期日向外累计。",
  ],
  tsColExp: ["Expiration", "到期日"],
  tsColDte: ["DTE", "剩余天数"],
  tsColHedge: ["Hedge", "对冲"],
  tsColCum: ["Cumulative", "累计"],
  tsNone: ["No expiration breakdown for this ticker yet.", "该品种暂无按到期日数据。"],
  tsMore: ["+{n} further expirations not shown.", "另有 {n} 个到期日未显示。"],
  tsBandWhy: [
    "The colour marks the GAP to the next expiration, not its distance from today — so a dense front-month cluster and an isolated long-dated line are distinguishable at a glance.",
    "颜色标记的是与下一到期日之间的间隔，而非距今天的远近——因此密集的近月序列与孤立的远期到期日一眼即可区分。",
  ],
  tsGammaOnly: [
    "Gamma only: the by-expiration payload carries gamma and delta, never vanna or charm.",
    "仅限 Gamma：按到期日的数据仅含 gamma 与 delta，不含 vanna 或 charm。",
  ],
  bandDaily: ["daily", "每日"],
  bandWeekly: ["weekly", "每周"],
  bandMonthly: ["monthly", "每月"],
  bandQuarterly: ["quarterly", "每季"],
  bandAnnual: ["annual", "每年"],

  dhTitle: ["Today's hedging", "今日对冲"],
  dhLead: [
    "What a typical session asks of dealers, each leg scaled by a stated shock rather than a nominal unit.",
    "典型交易日对做市商的要求，各分项均按明示的冲击幅度而非名义单位缩放。",
  ],
  dhSpot: ["From a spot move", "来自标的变动"],
  dhVol: ["From an IV move", "来自隐波变动"],
  dhTime: ["From time passing", "来自时间流逝"],
  dhTotal: ["Total", "合计"],
  dhOneDay: ["1 day", "1 天"],
  dhAbsent: ["not published", "未发布"],
  dhLegend: ["Positive = dealers buy · negative = dealers sell", "正值＝做市商买入 · 负值＝做市商卖出"],
  dhDisclose: [
    "The spot leg uses this ticker's own one-sigma expected move rather than a nominal 1%, so the figure reads as a typical day. Legs are independent first-order estimates and do not compound; a greek we do not publish is shown absent, never counted as zero.",
    "标的分项采用该品种自身的 1σ 预期波动而非名义 1%，因此该数值代表典型交易日。各分项为彼此独立的一阶估计，不做复合；未发布的希腊值显示为缺失，绝不按零计入。",
  ],
  emArchived: [
    "The expected-move band is a current-session read and did not travel with the archived ladder — distances are shown in percent only.",
    "预期波动区间为当前交易日读数，不随已归档梯图回放——仅按百分比显示距离。",
  ],
  emNone: ["No levels published for this ticker.", "该品种未发布水平。"],
  // Level display names (keys mirror the payload fields they come from).
  lvlCallWall: ["Call wall", "看涨墙"],
  lvlPutWall: ["Put wall", "看跌墙"],
  lvlFlip: ["Gamma flip", "伽马翻转"],
  lvlAbsGamma: ["Absolute gamma", "绝对伽马"],
  lvlMaxPain: ["Max pain", "最大痛点"],
  lvlMagnet: ["Magnet", "磁吸位"],

  // ── Module E: front expiry / post-expiry book (Tier A) ─────────────────────
  expTitle: ["Front expiry & the book after it", "近月到期与到期后持仓"],
  expLead: [
    "How much of the exposure rolls off at the next expiration, and what the book looks like once it does.",
    "有多少敞口在下一到期日消失，以及消失后的持仓形态。",
  ],
  expNext: ["Next expiration", "下一到期日"],
  expGammaShare: ["Gamma expiring", "到期伽马占比"],
  expDeltaShare: ["Delta expiring", "到期德尔塔占比"],
  expConcentrated: ["Concentrated", "集中"],
  expConcentratedWhy: [
    "More than a quarter of gross gamma sits in the front expiration — the structure the desk reads today is largely a front-expiry structure.",
    "超过四分之一的伽马总量集中于近月到期——当前所读结构在很大程度上属于近月结构。",
  ],
  expCurrent: ["Net gamma now", "当前净伽马"],
  expAfter: ["After the front expiry", "近月到期之后"],
  expSignFlip: ["Sign flips on expiry", "到期后符号翻转"],
  expSignFlipWhy: [
    "Removing the front expiration reverses the sign of net gamma: the regime the desk reads today is carried by contracts that are about to disappear.",
    "剔除近月到期后净伽马符号反转：当前所读机制由即将消失的合约支撑。",
  ],
  expNone: ["No expiration breakdown for this ticker yet.", "该品种暂无按到期日数据。"],
  expNoAfter: ["Only one expiration published — no after-expiry preview.", "仅发布一个到期日——无到期后预览。"],
} as const;

type MscKey = keyof typeof MSC_LEX;

export function getMscStr(lang: Lang, key: MscKey): string {
  const entry = MSC_LEX[key];
  if (!entry) return "";
  return lang === "zh" ? entry[1] : entry[0];
}

export function makeMscT(lang: Lang): (key: MscKey) => string {
  return (key: MscKey) => getMscStr(lang, key);
}

export type { MscKey };
