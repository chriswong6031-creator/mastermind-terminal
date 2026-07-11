/**
 * tutorialStrings.ts — bilingual EN/ZH string table for the interactive
 * options tutorial surface.
 *
 * Pattern matches flowdeskStrings.ts / gexStrings.ts:
 *   each key maps to [English, 中文].
 *
 * HONESTY DOCTRINE (enforced here):
 *   - No "validated", "predictive", or "empirically confirmed" language.
 *   - Direction is always surfaced as a soft lean (~soft); no NBBO assertion.
 *   - Score tiers are descriptive magnitude labels.
 *   - GEX sign is an assumption, not a measured fact.
 *   - Confidence is a composite display — not a win-probability guarantee.
 *   - Disabled / accruing features are labeled honestly.
 *   - "descriptive — not a recommendation" is the standing qualifier on picks.
 *
 * NOTE: translated strings MUST NOT appear in HTML title= attributes (CI-guarded).
 * Use aria-label or visible text spans instead.
 */

import type { Lang } from "@/lib/i18n";

const TUT_LEX = {
  // ── Module picker ──────────────────────────────────────────────────────────
  tutorialTitle:     ["Options Desk Tutorial", "期权台操作教程"],
  tutorialSubtitle:  [
    "6 short modules — learn the tools before trading with them.",
    "6个简短模块 — 交易前先了解这些工具。",
  ],
  moduleProgress:    ["{n} of 6 complete", "已完成 {n}/6"],
  startModule:       ["Start", "开始"],
  replayModule:      ["Replay", "重播"],
  locked:            ["Complete the previous module first", "请先完成上一个模块"],
  done:              ["Done", "已完成"],
  active:            ["In progress", "进行中"],

  // ── Nav buttons ────────────────────────────────────────────────────────────
  btnBack:     ["Back", "上一步"],
  btnNext:     ["Next", "下一步"],
  btnFinish:   ["Finish", "完成"],
  btnSkip:     ["Skip tutorial", "跳过教程"],
  btnClose:    ["Close", "关闭"],

  // ── Step pill ──────────────────────────────────────────────────────────────
  stepPill:    ["STEP {n} OF {total}", "第 {n}/{total} 步"],
  freeExplore: ["FREE EXPLORE", "自由探索"],
  allDone:     ["all done — hit Next", "全部完成 — 点击下一步"],

  // ── Progress/completion ────────────────────────────────────────────────────
  completionTitle:   ["{name} complete", "{name} 完成"],
  completionBody:    [
    "Free explore unlocked — click any element and Momo explains it.",
    "自由探索已解锁 — 点击任意元素，Momo 为你解释。",
  ],
  continueBtn:    ["Continue → {next}", "继续 → {next}"],
  replayBtn:      ["Replay lesson", "重播本课"],

  // ── Disclaimer (bottom of each step) ──────────────────────────────────────
  disclaimer: [
    "Sample data for illustration — not live signals. Descriptive only, not a recommendation.",
    "示例数据仅供说明 — 非实时信号。仅供描述，不构成投资建议。",
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // MODULE 1 — Reading the Flow Desk
  // ═══════════════════════════════════════════════════════════════════════════

  m1Name:      ["Flow Desk", "资金流台"],
  m1Sub:       ["Reading the tape", "读取交易记录"],

  m1s1Title:   ["The live tape", "实时记录"],
  m1s1Body:    [
    "Every row in the Flow Desk is one institutional options print. Size, contract, premium paid, and when it happened. The desk surfaces what real money is doing in the options market — not what it means. That part is your job.",
    "资金流台的每一行都是一笔机构期权成交记录，显示数量、合约、已支付权利金及时间。该台面显示真实资金在期权市场的实际操作 — 而非其含义，解读是你的工作。",
  ],

  m1s2Title:   ["Cards: premium first", "卡片：权利金优先"],
  m1s2Body:    [
    "Each card shows: ticker, contract (strike + expiry), premium size in $M, and execution type (sweep = cross-exchange aggressive, block = single large negotiated print). Premium magnitude is the reliable read. The direction lean (~soft) is tick-rule derived — approximate without NBBO confirmation.",
    "每张卡片显示：代码、合约（行权价+到期日）、权利金（百万美元）及执行方式（扫单=跨交易所主动买入，大宗=单笔大型协商成交）。权利金规模是可靠的读数。方向倾向（~软性）基于tick规则推算 — 无NBBO确认时为近似值。",
  ],

  m1s3Title:   ["Score & size context", "评分与规模参考"],
  m1s3Body:    [
    "The flow score is a magnitude-based composite (premium size, z-score vs baseline, structure). Tiers — ELITE / STRONG / HIGH / MEDIUM — are descriptive labels. A high score means this print is large and structured relative to baseline. It does not predict direction or outcome.",
    "资金流评分是基于规模的综合指标（权利金规模、相对基线的z值、结构）。等级 — 顶级/强势/较高/中等 — 是描述性标签。高分表示该笔成交相对基线规模大且结构清晰，不预测方向或结果。",
  ],

  m1s4Title:   ["OI & DTE: context clues", "持仓量与到期天数：背景线索"],
  m1s4Body:    [
    "Vol > OI flags fresh opening positioning (volume exceeds existing open interest). DTE bucket tells you how far out the bet is placed. These are context clues — not signals in isolation. An OI-confirmed, short-DTE sweep reads differently from a long-dated block, but neither is a buy or sell recommendation.",
    "量超持仓标记新建开仓（成交量超过现有持仓量）。到期天数分组告诉你押注的期限。这些是背景线索 — 不是孤立的信号。OI确认、短期扫单与长期大宗读数不同，但两者均不构成买入或卖出建议。",
  ],

  m1s5Title:   ["Why direction is a soft lean", "为何方向是软性倾向"],
  m1s5Body:    [
    "The tape cannot confirm whether a print is opening or closing, buy or sell, without NBBO (best bid/offer). The lean chip is derived from the tick rule — a heuristic with ~0.41 recovery rate. We display it so you can see the structural pattern (call-heavy vs put-heavy), but rank and color use premium magnitude, not asserted side. Direction without NBBO is approximate.",
    "在没有NBBO（最优买卖价）的情况下，记录无法确认成交是开仓还是平仓、是买入还是卖出。倾向标签基于tick规则推算 — 一种正确率约为0.41的启发式方法。我们显示它是为了让你看到结构模式（认购偏重还是认沽偏重），但排名和颜色使用权利金规模，而非声称的方向。无NBBO时方向为近似值。",
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // MODULE 2 — Score & Tiers
  // ═══════════════════════════════════════════════════════════════════════════

  m2Name:      ["Score & Tiers", "评分与等级"],
  m2Sub:       ["What the numbers mean", "数字的含义"],

  m2s1Title:   ["Score components", "评分分项"],
  m2s1Body:    [
    "The flow score combines: (1) raw premium size, (2) premium z-score vs a 252-session baseline per ticker, (3) structural badges (cluster, sweep, vol>OI). Each component is printed in the Inspector so you can see exactly what drove the score. There is no hidden weighting.",
    "资金流评分结合：(1)原始权利金规模，(2)权利金相对各代码252日基线的z值，(3)结构标记（集群、扫单、量超持仓）。每个分项在详情面板中都有显示，让你清楚了解评分的驱动因素，没有隐藏的权重。",
  ],

  m2s2Title:   ["Tiers: descriptive, not predictive", "等级：描述性而非预测性"],
  m2s2Body:    [
    "ELITE (≥90) / STRONG (75–89) / HIGH (60–74) / MEDIUM (45–59) / LOW (<45) — these thresholds describe magnitude relative to the baseline. An ELITE print is unusually large and structured. It does not guarantee a price move. The tiers exist so you can filter noise, not so you can trade them mechanically.",
    "顶级(≥90) / 强势(75-89) / 较高(60-74) / 中等(45-59) / 偏低(<45) — 这些阈值描述相对基线的规模。顶级成交异常大且结构清晰，但不保证价格会有相应走势。等级的存在是为了帮你过滤噪音，而非机械化交易的依据。",
  ],

  m2s3Title:   ["Baseline warming caveat", "基线积累期说明"],
  m2s3Body:    [
    "A ticker flagged \"baseline warming\" has fewer than 30 sessions of history. Its z-score is unreliable — the baseline hasn't stabilized. The raw premium is still real, but the z-score tier may be inflated. We label it honestly rather than hiding it.",
    "标记\"基线积累中\"的代码历史不足30个交易日。其z值不可靠 — 基线尚未稳定。原始权利金仍然真实，但z值等级可能偏高。我们如实标注而不加掩盖。",
  ],

  m2s4Title:   ["Cluster badge: campaign evidence", "集群标记：活动证据"],
  m2s4Body:    [
    "The CLUSTER badge marks a contract-day accumulation of ≥$3M across multiple prints in the same ticker-strike-expiry. Repetition is the tell — one sweep is noise; three sweeps on the same strike in 15 minutes, size increasing, is a campaign. The Chain Heat rail tracks active campaigns. Campaign evidence is the most reliable signal this desk produces — but it still describes behavior, not intent.",
    "集群标记标识同一代码-行权价-到期日在同一交易日多笔成交累计权利金≥300万美元。重复是关键 — 一笔扫单是噪音；15分钟内三笔相同行权价的扫单且规模递增，是一次活动。链式热度栏追踪活跃活动。活动证据是该台面产生的最可靠信号 — 但仍描述行为而非意图。",
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // MODULE 3 — Chain Heat & Campaigns
  // ═══════════════════════════════════════════════════════════════════════════

  m3Name:      ["Chain Heat", "链式热度"],
  m3Sub:       ["Campaigns & persistence", "活动与持续性"],

  m3s1Title:   ["What Chain Heat tracks", "链式热度追踪什么"],
  m3s1Body:    [
    "Chain Heat isolates contract-day campaigns: same ticker, strike, and expiry; ≥$3M cumulative premium across multiple prints. When you see a campaign in this rail, you're seeing concentrated, repeated activity — the kind of behavior that shows up in the tape before major moves, though not exclusively.",
    "链式热度隔离合约日活动：相同代码、行权价和到期日；多笔成交累计权利金≥300万美元。当你在该栏看到一次活动时，你看到的是集中的、重复的行为 — 虽然不排除其他情况，但这类行为在重大走势前通常会出现在记录中。",
  ],

  m3s2Title:   ["Magnitude over direction", "规模优先于方向"],
  m3s2Body:    [
    "Each campaign shows: total premium, print count, span (minutes active), first-seen time, and the ask-share bar. Ask share is the fraction of prints executed at or above the ask — a proxy for urgency. Lean (accumulation / distribution / contested) is derived from ask share, not NBBO. Magnitude ($M) and persistence (span) are the reliable reads. Treat lean as context, not signal.",
    "每次活动显示：总权利金、成交笔数、时间跨度（活跃分钟数）、首次出现时间和买价成交比例。买价成交比是以买价或更高价格执行的成交比例 — 紧迫性的代理指标。倾向（积累/派发/争议）源自买价成交比，而非NBBO。规模（百万美元）和持续性（时间跨度）是可靠的读数。将倾向视为背景，而非信号。",
  ],

  m3s3Title:   ["The reliable family", "可靠信号族"],
  m3s3Body:    [
    "Across the research we've done: magnitude and persistence (large premium, many prints, extended span) are the most durable components of the flow score. Direction-derived components are weaker. This is why Chain Heat is the first rail in the inspector — it isolates the part of the signal that has shown the most persistence across our accrual window.",
    "根据我们的研究：规模和持续性（大额权利金、多笔成交、较长时间跨度）是资金流评分中最持久的组成部分。方向衍生组件较弱。这就是为什么链式热度是详情面板的第一栏 — 它隔离了在我们的积累窗口中显示出最强持续性的信号部分。",
  ],

  m3s4Title:   ["When no campaigns show", "无活动显示时"],
  m3s4Body:    [
    "An empty Chain Heat rail means no contract-day accumulation has crossed the $3M threshold this session. That's a normal quiet day — not a broken feed. The threshold exists to filter noise. On a slow tape day, use the raw feed filtered to ELITE prints; on an active day, Chain Heat will light up first.",
    "链式热度栏为空意味着本交易日没有合约日积累超过300万美元阈值。这是正常的平静日 — 而非数据故障。阈值的存在是为了过滤噪音。在记录清淡的日子里，使用筛选后的顶级原始成交记录；在活跃的日子里，链式热度会最先点亮。",
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // MODULE 4 — GEX Structure
  // ═══════════════════════════════════════════════════════════════════════════

  m4Name:      ["GEX Structure", "GEX结构"],
  m4Sub:       ["Gamma levels map", "伽马水平图"],

  m4s1Title:   ["What GEX shows", "GEX显示什么"],
  m4s1Body:    [
    "The GEX desk maps where dealer gamma concentrates across strikes. Positive bars (call-side): strikes where dealer hedging conventionally dampens moves. Negative bars (put-side): strikes where dealer hedging conventionally amplifies moves. Sign follows the standard dealer convention — dealers sold the options. If dealers are net long, the sign inverts. This is a known assumption.",
    "GEX台显示做市商伽马在各行权价的集中情况。正值柱（认购端）：做市商对冲通常抑制走势的行权价。负值柱（认沽端）：做市商对冲通常放大走势的行权价。符号遵循标准做市商惯例 — 做市商卖出了期权。若做市商净多，符号反转。这是一个已知的假设。",
  ],

  m4s2Title:   ["Gamma Flip", "伽马翻转"],
  m4s2Body:    [
    "The Gamma Flip level is the estimated price where net dealer gamma changes sign. Above the flip, dealer hedging is conventionally stabilizing. Below it, dealer hedging conventionally amplifies moves. Method: zero-crossing of the GEX profile curve — an approximation with acknowledged error bounds. Not a forecast. Not a support/resistance level. A structural reference.",
    "伽马翻转水平是净做市商伽马符号变化的估算价格。翻转点以上，做市商对冲通常起稳定作用。以下则通常放大波动。方法：GEX曲线零交叉点估算 — 为近似值，存在已知误差范围。不是预测，不是支撑/阻力位，是一个结构性参考。",
  ],

  m4s3Title:   ["Walls & pins", "墙与锁定"],
  m4s3Body:    [
    "Call Wall: the strike with the highest positive dealer gamma above spot. Conventionally, dealer hedging leans against price at this level — a structural headwind, not a guaranteed reversal. Put Support: the highest negative dealer gamma below spot — where hedge-driven demand concentrates on downside. Pin targets: strikes with the highest combined OI and gamma proximity — historically show price clustering in positive-gamma regimes. Display-only until gauntleted (~Sept 2026).",
    "看涨墙：现价上方正值做市商伽马最高的行权价。通常情况下，做市商对冲在该水平对价格产生阻力 — 是结构性阻力，而非保证的反转点。看跌墙：现价下方负值做市商伽马最高处 — 下行时对冲驱动需求集中处。锁定目标：综合持仓量和伽马与现价距离最大的行权价 — 在正伽马状态下历史上显示出价格聚集效应。正式验证前仅供展示（约2026年9月）。",
  ],

  m4s4Title:   ["Regime states (structural descriptions)", "状态分类（结构性描述）"],
  m4s4Body:    [
    "PIN / DRIFT / RANGE — positive gamma regimes: structural tendency toward bounded, mean-reverting price action. TRANSITION — near the flip: elevated structural sensitivity. TREND / CASCADE — negative gamma regimes: dealer hedging may amplify directional moves. These are structural descriptions of the current options chain geometry. They are not forecasts. Single-name GEX regime classification can be near-constant — a product attribute, not a dynamic signal.",
    "PIN/DRIFT/RANGE — 正伽马状态：结构上趋向有界均值回归走势。TRANSITION — 接近翻转：结构敏感性上升。TREND/CASCADE — 负伽马状态：做市商对冲可能放大单边走势。这些是当前期权链几何结构的结构性描述，不是预测。个股GEX状态分类可能近似为固定值 — 是产品属性，而非动态信号。",
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // MODULE 5 — Heatmap & Divergence
  // ═══════════════════════════════════════════════════════════════════════════

  m5Name:      ["Heatmap", "热力图"],
  m5Sub:       ["Price vs flow layers", "价格与资金流层"],

  m5s1Title:   ["Two layers, two questions", "两层，两个问题"],
  m5s1Body:    [
    "The heatmap has two primary layers. PRICE layer: tiles sized by market cap, colored by today's % move — answers \"what moved?\" FLOW layer: tiles sized by total premium spent today, colored by call/put net bias — answers \"where is money going?\" The two layers can diverge. A stock up 2% on the PRICE layer might show put-heavy flow on the FLOW layer. That divergence is the signal, not each layer in isolation.",
    "热力图有两个主要层。价格层：按市值大小显示格子，按今日涨跌幅上色 — 回答\"什么在动？\" 资金流层：按今日总权利金大小显示格子，按认购/认沽净偏向上色 — 回答\"资金往哪里去？\" 两层可能出现背离。在价格层上涨2%的股票，在资金流层可能显示认沽偏重的资金流。这种背离才是信号，而非孤立地看每一层。",
  ],

  m5s2Title:   ["Dead zones and quiet tickers", "死区与安静代码"],
  m5s2Body:    [
    "Not every tile is active. A small, dim tile on the FLOW layer means little premium was traded today — useful to know so you don't over-read a quiet name. A large, bright tile means significant premium concentration. Tile size on the FLOW layer is premium magnitude, not price movement. These two dimensions are independent.",
    "并非每个格子都活跃。资金流层上小而暗的格子意味着今日交易的权利金很少 — 知道这一点很有用，这样你就不会过度解读一个安静的代码。大而亮的格子意味着显著的权利金集中。资金流层上的格子大小是权利金规模，而非价格走势。这两个维度是独立的。",
  ],

  m5s3Title:   ["Reading flow magnitude", "读取资金流规模"],
  m5s3Body:    [
    "When a tile shows a large premium number on the FLOW layer — read the tile detail. How many sweeps? Are there whales (≥$1M single events)? What's the call/put split? A $50M gross with 1 sweep and 49 blocks reads differently from $50M with 12 sweeps and 3 whales. Magnitude is always first; structure is context.",
    "当一个格子在资金流层显示大额权利金数字时 — 阅读格子详情。有多少扫单？是否有巨鲸（单笔≥100万美元）？认购/认沽分布如何？1笔扫单和49笔大宗的5000万美元，与12笔扫单和3条巨鲸的5000万美元读数不同。规模始终优先；结构是背景。",
  ],

  m5s4Title:   ["Price vs flow divergence", "价格与资金流背离"],
  m5s4Body:    [
    "The most actionable heatmap read is divergence: a stock with a negative PRICE tile (down today) but a large, call-heavy FLOW tile. Or a strong gainer with put-heavy institutional flow. Neither pattern is a trade signal — they're a starting point for research. Check the tape for the actual prints. Check the GEX structure for the options landscape. Divergence is a hypothesis, not a conclusion.",
    "最值得关注的热力图读数是背离：一支在价格层显示为负值（今日下跌）但拥有大型认购偏重资金流格子的股票。或一支强劲上涨者伴随认沽偏重的机构资金流。这两种模式都不是交易信号 — 它们是研究的起点。检查记录中的实际成交，检查GEX结构了解期权格局。背离是一个假设，而非结论。",
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // MODULE 6 — Risk & Discipline
  // ═══════════════════════════════════════════════════════════════════════════

  m6Name:      ["Risk & Discipline", "风险与纪律"],
  m6Sub:       ["The math that keeps you solvent", "让你持续交易的数学"],

  m6s1Title:   ["Position sizing: the formula", "仓位管理：公式"],
  m6s1Body:    [
    "One formula: account × risk% ÷ stop distance = position size. This is not our system — it's basic risk management that applies to any trade you take from any signal source. Maximum account risk per trade is your decision. Many experienced traders cap it at 1–2%. The formula does not change based on confidence level.",
    "一个公式：账户规模 × 风险百分比 ÷ 止损距离 = 仓位大小。这不是我们的系统 — 它是适用于任何信号来源的基本风险管理。每笔交易的最大账户风险是你的决定。许多有经验的交易者将其上限设定在1-2%。该公式不因信心水平而改变。",
  ],

  m6s2Title:   ["Invalidation first", "止损优先"],
  m6s2Body:    [
    "Before entering any trade from a flow or GEX read, decide your invalidation price first. What level tells you the thesis is wrong? Set that before the entry. The stop distance drives the position size calculation — so knowing your stop is the precondition for knowing your size. Size follows risk, never the other way.",
    "在基于任何资金流或GEX读数入场前，先确定你的失效价格。哪个价位告诉你论点是错误的？在入场前设定好。止损距离驱动仓位大小的计算 — 因此，了解你的止损是了解仓位大小的前提。仓位跟随风险，永远不要反过来。",
  ],

  m6s3Title:   ["Why we cap confidence displays", "我们为何限制信心显示"],
  m6s3Body:    [
    "Our scores and tiers top out at descriptive labels — not win probabilities. We don't display \"85% probability of up\" because that number requires a calibrated forward return distribution we don't have. What we show: premium magnitude, structure, persistence, z-score context. These are observations, not forecasts. A high-tier print in a favorable tape is a better-than-average setup to investigate — not a guaranteed trade.",
    "我们的评分和等级止步于描述性标签 — 不是胜率。我们不显示\"上涨概率85%\"，因为这个数字需要我们没有的校准前向收益分布。我们显示的是：权利金规模、结构、持续性、z值背景。这些是观察，不是预测。有利记录中的高等级成交是值得研究的好于平均水平的机会 — 不是保证的交易。",
  ],

  m6s4Title:   ["The streak problem", "连败问题"],
  m6s4Body:    [
    "A position-sizing discipline matters most when you're wrong multiple times in a row. Five 2% losses = 10% drawdown — manageable, and you still have 90% of your account. One 10% loss = the same damage in a single trade, plus the psychological cost. Risk per trade should be set assuming your next N trades might all lose. If that assumption breaks your account, the size is wrong.",
    "仓位管理纪律在你连续亏损时最为重要。五次2%的亏损 = 10%的回撤 — 可以承受，你的账户仍有90%。一次10%的亏损 = 单笔交易造成相同损失，加上心理成本。每笔交易的风险应基于假设你接下来的N笔交易可能全部亏损来设定。如果这个假设会导致你的账户崩溃，那么仓位大小就是错误的。",
  ],

  m6s5Title:   ["Accruing data: what's experimental", "积累中的数据：实验性内容"],
  m6s5Body:    [
    "Some features are labeled \"accruing\" or \"experimental — deferred\". These are surfaces that display observations but whose predictive value is not yet established. We label them because honest uncertainty is more useful than false confidence. When a feature graduates from accruing to gauntleted, we'll say so explicitly.",
    "某些功能标记为\"积累中\"或\"实验性 — 已推迟\"。这些功能显示观察结果，但其预测价值尚未确立。我们标注它们，因为诚实的不确定性比虚假的信心更有用。当一个功能从积累阶段进入验证阶段时，我们会明确说明。",
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // MODULE 7 — Market Tide (standalone walkthrough, launched from the Tide tab)
  // ═══════════════════════════════════════════════════════════════════════════

  tideTutorialBtn: ["How to read this", "如何解读"],

  m7s1Title:   ["Market Tide", "市场潮汐"],
  m7s1Body:    [
    "Market Tide tracks the WHOLE market's options premium through the day as one running total. Instead of individual prints, you see the net tug-of-war between call buying and put buying across every name, minute by minute. It answers one question: is today's options tape leaning bullish or bearish, and how hard?",
    "市场潮汐将整个市场当日的期权权利金汇总为一条累计曲线。你看到的不是单笔成交，而是全市场认购买入与认沽买入之间的净拉锯 — 逐分钟呈现。它回答一个问题：今天的期权盘口是偏多还是偏空，力度多大？",
  ],

  m7s2Title:   ["The two curves + SPY", "两条曲线 + SPY"],
  m7s2Body:    [
    "The up-color line is NCP — cumulative net CALL premium (a bullish lean). The down-color line is NPP — cumulative net PUT premium (a bearish lean). The amber line overlays SPY price. Watch whether the tape tide CONFIRMS price (both rising) or DIVERGES from it (price up while put premium builds). Direction here is ~soft — tick-rule derived, not NBBO-confirmed; magnitude is the reliable read.",
    "上行色曲线是 NCP — 累计净认购权利金（偏多）。下行色曲线是 NPP — 累计净认沽权利金（偏空）。琥珀色线叠加 SPY 价格。关注盘口潮汐是印证价格（同步上行）还是背离价格（价格上涨而认沽权利金累积）。此处方向为~软性 — 基于 tick 规则推算，非 NBBO 确认；规模才是可靠读数。",
  ],

  m7s3Title:   ["Sector Tide", "板块潮汐"],
  m7s3Body:    [
    "The same net-premium read, broken out by sector. Each tile is one sector's net (call premium minus put premium) — up-color = net-call lean, down-color = net-put lean. Use it to see WHERE the day's options conviction is concentrated. Click a tile to filter the Tape to that sector.",
    "同样的净权利金读数，按板块拆分。每块代表一个板块的净值（认购权利金减认沽权利金）— 上行色=偏认购，下行色=偏认沽。用它查看当日期权信心集中在哪里。点击色块可将交易记录筛选至该板块。",
  ],

  m7s4Title:   ["Top Net Impact — why a #1 name can be red", "净影响榜 — 为何榜首会是红色"],
  m7s4Body:    [
    "This ranks names by the SIZE of their net directional premium — the bar length is magnitude (|net premium|), and the COLOR is which side won. So the #1 name can be the DOWN color: it just means that name had the single largest net options premium today AND it leaned net-put (bearish). Big + red = the loudest bearish options bet, not a small one. Length tells you how big; color tells you which way.",
    "此处按名称的净方向权利金规模排序 — 条形长度是量级（|净权利金|），颜色表示哪一方占优。所以榜首可能是下行色：这仅表示该名称当日的净期权权利金最大，且偏向净认沽（看空）。大 + 红 = 最响亮的看空期权押注，而非小额。长度告诉你多大，颜色告诉你方向。",
  ],

  m7s5Title:   ["DTE Buckets", "到期日分桶"],
  m7s5Body:    [
    "The same tide split by days-to-expiry. Near-dated (0DTE / weekly) flow is fast, reactive positioning — often hedging or same-day speculation. Longer-dated flow reflects slower, higher-conviction structural bets. Comparing the buckets tells you whether today's lean is a quick reaction or a durable position.",
    "同样的潮汐，按到期天数拆分。近月（当日/周期权）资金流是快速、反应式的仓位 — 通常是对冲或当日投机。远月资金流反映更慢、更高信心的结构性押注。对比各分桶可判断当日倾向是快速反应还是持久仓位。",
  ],

  m7s6Title:   ["Reading it well", "如何用好它"],
  m7s6Body:    [
    "Market Tide is a DESCRIPTION of the options tape, not a signal. Magnitude (how much premium) is reliable; direction (call vs put lean) is a soft tick-rule estimate. Use it for context — is the crowd leaning, where, and how hard — then confirm with price and your own thesis. It is display-only and not investment advice.",
    "市场潮汐是对期权盘口的描述，而非信号。规模（权利金多少）可靠；方向（偏认购或认沽）为软性 tick 规则估计。用它建立背景 — 人群是否倾斜、在哪里、力度多大 — 再用价格和你自己的判断加以印证。仅供展示，不构成投资建议。",
  ],
} as const;

type TutorialKey = keyof typeof TUT_LEX;

export function getTutStr(lang: Lang, key: TutorialKey): string {
  const entry = TUT_LEX[key];
  return lang === "zh" ? entry[1] : entry[0];
}

export function makeTutT(lang: Lang): (key: TutorialKey) => string {
  return (key: TutorialKey) => getTutStr(lang, key);
}

export type { TutorialKey };
