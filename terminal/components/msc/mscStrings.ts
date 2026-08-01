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
  // Same honesty tier as `tierA` — convention-independent — but "Magnitude" was written
  // for the gamma cards and says nothing true about a regression between two quoted
  // series. Same guarantee, accurate word.
  tierMeasured: ["Measured", "实测"],
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

  // ── W2 · Aggregate greek trend ─────────────────────────────────────────────
  atTitle: ["Positioning vs its own history", "持仓与自身历史对比"],
  atLead: [
    "One number per session for the whole book. A dollar figure means little alone; where it sits in its own record is the reading.",
    "全账簿每个交易日一个数值。单看金额意义有限；它在自身历史中的位置才是要点。",
  ],
  atTierWhy: [
    "The level inherits the dealer-sign assumption. The percentile is sturdier: the same assumption applies to every session, so a constant sign error largely cancels when today is ranked against its own record.",
    "绝对水平沿用做市商符号假设；百分位更稳健：该假设对每个交易日一致，将今日与自身历史排名时，恒定的符号误差大体相互抵销。",
  ],
  atVega: ["Vega", "维加"],
  atWin1y: ["1Y", "1年"],
  atWin3y: ["3Y", "3年"],
  atWinAll: ["All", "全部"],
  atWinAria: ["History window", "历史窗口"],
  atToday: ["Latest", "最新"],
  atRank: ["Rank in window", "窗口内排名"],
  atTypical: ["Median", "中位数"],
  atRange: ["Usual range", "常见区间"],
  atCoverage: ["{n} sessions since {since}.", "自 {since} 起共 {n} 个交易日。"],
  atTruncated: [
    "Shorter than the window requested — the published history does not reach that far.",
    "短于所选窗口——已发布历史未覆盖该长度。",
  ],
  atBandLegend: [
    "Shaded band = the 5th–95th percentile of this window; dashed line = its median.",
    "阴影带为该窗口的第 5–95 百分位；虚线为其中位数。",
  ],
  atNone: ["No positioning history published for this ticker yet.", "该品种暂无持仓历史数据。"],
  atDrift: [
    "Over a long window the rank partly reflects growth: exposure scales with the underlying, and this one has risen a long way since the series began. Shorter windows compare like with like.",
    "长窗口下的排名部分反映规模增长：敞口随标的价格放大，而该标的自序列起点以来涨幅可观。较短窗口的对比更为同类可比。",
  ],

  // ── W2 · Spot–vol relationship ─────────────────────────────────────────────
  svTitle: ["Spot–vol relationship", "现货与波动率关系"],
  svLead: [
    "Daily change in at-the-money implied vol regressed on the day's move. The gauge asks whether vol moved more than the move usually implies — not whether vol is high.",
    "以当日涨跌幅回归平值隐含波动率的日变化。仪表衡量的是波动率相对该涨跌幅是否反应过度，而非波动率本身是否偏高。",
  ],
  svTierWhy: [
    "Two market-quoted series regressed against each other, with n and R² stated. No dealer-sign assumption enters this reading.",
    "两组市场报价序列的回归，并给出样本量与判定系数。该读数不涉及做市商符号假设。",
  ],
  svBeta: ["Vol pts per +1%", "每 +1% 的波动点"],
  svR2: ["Explained", "可解释比例"],
  svVerdict: ["Today", "今日"],
  svOver: ["Overvixed", "波动率偏高"],
  svUnder: ["Undervixed", "波动率偏低"],
  svInline: ["In line", "符合"],
  svUnknown: ["Not graded", "未评级"],
  svGaugeAria: ["Vol reaction versus the regression", "波动率反应与回归对比"],
  svToday: [
    "Latest session moved {r}; implied vol changed {a} pts against {p} expected.",
    "最新交易日涨跌 {r}；隐含波动率变化 {a} 点，预期为 {p} 点。",
  ],
  svLegend: [
    "Fitted over the last {n} sessions. Ring marks the latest session.",
    "基于最近 {n} 个交易日拟合。圆环标记最新交易日。",
  ],
  svNone: [
    "Not enough paired sessions to fit a relationship yet ({n} so far).",
    "配对交易日不足，暂无法拟合关系（当前 {n} 个）。",
  ],

  // ── W2 · Positioning extremes by horizon ───────────────────────────────────
  exTitle: ["Where gamma sits, by horizon", "各期限的伽马集中位置"],
  exLead: [
    "The heaviest gamma strike each side of spot, split by time to expiry. Near-dated concentration decays within days; far-dated persists.",
    "按到期时间划分，现价两侧伽马最重的行权价。近月集中度数日内即衰减，远月则持续存在。",
  ],
  exTierWhy: [
    "Measures where dealer gamma concentrates, under the payload's sign convention. It is not a claim that price will respect these levels — a graded version arrives with the level report card.",
    "在数据的符号约定下衡量做市商伽马的集中位置；并非断言价格会尊重这些水平——评级版本将随水平评分卡推出。",
  ],
  exColHorizon: ["Horizon", "期限"],
  exColBelow: ["Heaviest below", "下方最重"],
  exColAbove: ["Heaviest above", "上方最重"],
  exNear: ["0–5 days", "0–5 天"],
  exSwing: ["6–30 days", "6–30 天"],
  exFar: ["31+ days", "31 天以上"],
  exUnknown: ["no data", "无数据"],
  exNoWall: ["none", "无"],
  exNone: [
    "No strike-by-expiry grid published for this ticker — the horizon split needs both axes together.",
    "该品种未发布行权价×到期日网格——按期限拆分需要两个维度同时具备。",
  ],
  exLegend: [
    "Strike prices. Blank means no concentration on that side; “no data” means this horizon is not covered.",
    "为行权价。“无”表示该侧无集中；“无数据”表示该期限未覆盖。",
  ],
  exDisclose: [
    "Concentration of dealer gamma — not a forecast that these levels hold.",
    "为做市商伽马的集中位置，并非这些水平将保持有效的预测。",
  ],

  // ── W3 · Floating strike (delta-space exposure) ────────────────────────────
  fsTitle: ["The book in delta space", "以 Delta 视角看持仓"],
  fsLead: [
    "The same exposure, filed by call-equivalent delta instead of by strike. A strike is a fixed price; a delta band stays the same object as spot travels and time passes.",
    "同一敞口，按看涨等效 Delta 而非行权价归类。行权价是固定价格；Delta 区间在现价移动与时间流逝中仍指向同一对象。",
  ],
  fsPeak: ["Heaviest band {b}", "最重区间 {b}"],
  fsLegend: [
    "Dashed line = 50Δ, the at-the-money band. Puts are folded onto the call axis: a −30Δ put sits with the 70Δ calls.",
    "虚线为 50Δ（平值区间）。看跌期权折算到看涨轴：−30Δ 看跌与 70Δ 看涨同区间。",
  ],
  fsScale: ["Largest band {v}.", "最大区间 {v}。"],
  fsNone: [
    "No delta breakdown published for this ticker yet.",
    "该品种暂无按 Delta 拆分数据。",
  ],

  // ── W3 · Cross-root screener ───────────────────────────────────────────────
  qdTitle: ["Which names sit at a positioning extreme", "哪些标的处于持仓极端"],
  qdLead: [
    "Every root ranked against its own recent history, not against the others on screen. A percentile is a claim about that ticker; “most negative on the board” is a claim about the board.",
    "每个标的与自身近期历史对比排名，而非与屏幕上其他标的对比。百分位是关于该标的的判断；“全表最负”只是关于这张表的判断。",
  ],
  qdTierWhy: [
    "Both axes inherit the dealer-sign convention. Ranking each root against its own record is the sturdier half: the same assumption applies to every session, so a constant sign error largely cancels.",
    "两轴均沿用做市商符号假设。将每个标的与自身历史排名更为稳健：该假设对每个交易日一致，恒定符号误差大体抵销。",
  ],
  qdAxisX: ["Dealer gamma percentile →", "做市商伽马百分位 →"],
  qdAmpVol: ["Amplify · vol-sensitive", "放大 · 对波动敏感"],
  qdAmpStable: ["Amplify · vol-quiet", "放大 · 波动平静"],
  qdDampVol: ["Dampen · vol-sensitive", "抑制 · 对波动敏感"],
  qdDampStable: ["Dampen · vol-quiet", "抑制 · 波动平静"],
  qdColRoot: ["Root", "标的"],
  qdColGamma: ["Gamma pct · $", "伽马百分位 · 金额"],
  qdColVanna: ["Vanna pct · $", "Vanna 百分位 · 金额"],
  qdColRegime: ["Hedging regime", "对冲机制"],
  qdWindow: [
    "Ranked within each root's trailing {d} sessions, not its whole history — over nine years the rank would partly measure how much the market grew.",
    "在每个标的最近 {d} 个交易日内排名，而非全部历史——若取九年，排名将部分反映市场规模的增长。",
  ],
  qdLegend: [
    "{n} roots. Horizontal = dealer gamma percentile (left: hedging amplifies a move). Vertical = dealer vanna percentile (top: a vol move forces hedging). Highlighted points are at a historical extreme.",
    "共 {n} 个标的。横轴为做市商伽马百分位（左侧：对冲放大波动）。纵轴为做市商 Vanna 百分位（上方：波动变化迫使对冲）。高亮点处于历史极端。",
  ],
  qdMinHistory: [
    "A root needs {d} sessions of history before it is ranked.",
    "标的需具备 {d} 个交易日历史方可参与排名。",
  ],
  qdSkipped: ["{n} skipped for thin history: {r}.", "{n} 个因历史过短被排除：{r}。"],
  qdNone: [
    "The cross-root board has not been published yet.",
    "跨标的看板尚未发布。",
  ],
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
