/**
 * Clean-room visual-guide metadata.
 *
 * These definitions describe Mastermind's own indicator modules. They intentionally
 * do not contain third-party copy or image URLs; the companion SVG component renders
 * an original schematic from this data.
 */

export type GuideLanguage = "en" | "zh";
export type GuideVisualTone = "bull" | "bear" | "accent" | "warn" | "muted" | "volume";

export interface LocalizedGuideText {
  en: string;
  zh: string;
}

export interface GuideVisualLegendItem {
  label: LocalizedGuideText;
  tone: GuideVisualTone;
}

export type GuideVisualStageId = "context" | "confirmation" | "decision";

export interface GuideVisualStage {
  id: GuideVisualStageId;
  eyebrow: LocalizedGuideText;
  title: LocalizedGuideText;
  description: LocalizedGuideText;
  tone: GuideVisualTone;
}

export interface GuideVisualMetadata {
  id: GuideVisualId;
  suiteKey: string;
  moduleKey: string;
  title: LocalizedGuideText;
  kicker: LocalizedGuideText;
  caption: LocalizedGuideText;
  legend: readonly GuideVisualLegendItem[];
  stages: readonly GuideVisualStage[];
}

export const GUIDE_VISUAL_IDS = [
  "structure/ms",
  "structure/ob",
  "structure/fvg",
  "structure/pd",
  "structure/liq",
  "structure/sfp",
  "structure/sr",
  "structure/mfp",
  "structure/pat",
  "trend/te",
  "trend/fb",
  "trend/vb",
  "trend/cp",
  "trend/dash",
  "pulse/wave",
  "pulse/sig",
  "pulse/div",
  "pulse/vmap",
  "pulse/flow",
  "pulse/mtf",
  "rsix/eng",
  "rsix/sig",
  "rsix/div",
  "rsix/chan",
  "rsix/mtf",
  "macdx/eng",
  "macdx/sig",
  "macdx/hist",
  "macdx/div",
  "macdx/trend",
  "macdx/mtf",
] as const;

export type GuideVisualId = (typeof GUIDE_VISUAL_IDS)[number];

const text = (en: string, zh: string): LocalizedGuideText => ({ en, zh });
const legend = (
  en: string,
  zh: string,
  tone: GuideVisualTone,
): GuideVisualLegendItem => ({ label: text(en, zh), tone });

const STAGE_BLUEPRINTS: readonly {
  id: GuideVisualStageId;
  eyebrow: LocalizedGuideText;
  describe: (item: GuideVisualLegendItem) => LocalizedGuideText;
}[] = [
  {
    id: "context",
    eyebrow: text("01 · Map the context", "01 · 定位环境"),
    describe: (item) => text(
      `First, locate ${item.label.en}. It establishes the context for everything that follows.`,
      `先定位${item.label.zh}。这是理解后续变化的基础环境。`,
    ),
  },
  {
    id: "confirmation",
    eyebrow: text("02 · Confirm the change", "02 · 确认变化"),
    describe: (item) => text(
      `Then, wait for ${item.label.en}. It connects the setup to a measurable change instead of an assumption.`,
      `然后等待${item.label.zh}。它把前提连接到可衡量的变化，而不是主观猜测。`,
    ),
  },
  {
    id: "decision",
    eyebrow: text("03 · Resolve the decision", "03 · 完成决策"),
    describe: (item) => text(
      `Finally, read ${item.label.en}. Use it to confirm, invalidate, or manage the outcome.`,
      `最后读取${item.label.zh}，用它确认、否定或管理最终结果。`,
    ),
  },
] as const;

function visualStages(items: readonly GuideVisualLegendItem[]): readonly GuideVisualStage[] {
  if (items.length !== STAGE_BLUEPRINTS.length) {
    throw new Error(`Guide visuals require exactly ${STAGE_BLUEPRINTS.length} semantic stages.`);
  }

  return STAGE_BLUEPRINTS.map((blueprint, index) => {
    const item = items[index];
    return {
      id: blueprint.id,
      eyebrow: blueprint.eyebrow,
      title: item.label,
      description: blueprint.describe(item),
      tone: item.tone,
    };
  });
}

function visual(
  id: GuideVisualId,
  title: LocalizedGuideText,
  kicker: LocalizedGuideText,
  caption: LocalizedGuideText,
  items: readonly GuideVisualLegendItem[],
): GuideVisualMetadata {
  const [suiteKey, moduleKey] = id.split("/");
  return {
    id,
    suiteKey,
    moduleKey,
    title,
    kicker,
    caption,
    legend: items,
    stages: visualStages(items),
  };
}

export const GUIDE_VISUALS: Readonly<Record<GuideVisualId, GuideVisualMetadata>> = {
  "structure/ms": visual(
    "structure/ms",
    text("Read the structural hand-off", "读懂结构交接"),
    text("Structure anatomy", "结构解剖"),
    text(
      "A CHoCH warns that control may be changing; a later BOS confirms continuation in the new direction.",
      "CHoCH 提醒控制权可能易手；随后 BOS 确认新方向延续。",
    ),
    [
      legend("Swing structure", "摆动结构", "accent"),
      legend("Bullish confirmation", "看涨确认", "bull"),
      legend("Bearish hand-off", "看跌交接", "bear"),
    ],
  ),
  "structure/ob": visual(
    "structure/ob",
    text("Trace origin, mitigation, and failure", "追踪起点、回补与失效"),
    text("Institutional zone lifecycle", "机构区域生命周期"),
    text(
      "Order blocks begin at displacement, strengthen with participation, and become breakers only after decisive invalidation.",
      "订单块始于位移，成交参与会增强其质量；只有明确失效后才转为破坏块。",
    ),
    [
      legend("Bullish block", "看涨订单块", "bull"),
      legend("Bearish block", "看跌订单块", "bear"),
      legend("Volume grade", "成交量评级", "volume"),
    ],
  ),
  "structure/fvg": visual(
    "structure/fvg",
    text("See imbalance fill in stages", "分阶段观察失衡回补"),
    text("Fair-value gap lifecycle", "公平价值缺口生命周期"),
    text(
      "The three-candle void remains active while unfilled, fades as price mitigates it, and can invert after a confirmed close through.",
      "三根 K 线形成的缺口在未填补时保持有效，回补时逐渐减弱，确认收盘穿越后可转为反向缺口。",
    ),
    [
      legend("Open imbalance", "未填补失衡", "accent"),
      legend("Mitigated area", "已回补区域", "muted"),
      legend("Inversion", "反转缺口", "bear"),
    ],
  ),
  "structure/pd": visual(
    "structure/pd",
    text("Locate value inside the active range", "在有效区间内定位价值"),
    text("Range-position map", "区间位置地图"),
    text(
      "Discount favors long-side investigation, premium favors risk reduction, and equilibrium is the range's decision line.",
      "折价区更适合研究多头机会，溢价区更适合降低风险，均衡线是区间决策轴。",
    ),
    [
      legend("Premium", "溢价区", "bear"),
      legend("Equilibrium", "均衡", "warn"),
      legend("Discount", "折价区", "bull"),
    ],
  ),
  "structure/liq": visual(
    "structure/liq",
    text("Separate a sweep from a breakout", "区分扫单与真正突破"),
    text("Liquidity-pool reaction", "流动性池反应"),
    text(
      "Equal highs advertise resting liquidity; a wick through followed by a reclaim is a sweep, not continuation.",
      "等高点暴露潜在止损流动性；刺穿后迅速收回属于扫单，而不是延续突破。",
    ),
    [
      legend("Liquidity pool", "流动性池", "warn"),
      legend("Sweep wick", "扫单影线", "bear"),
      legend("Reclaim", "收回确认", "bull"),
    ],
  ),
  "structure/sfp": visual(
    "structure/sfp",
    text("Trade the failed auction, not the wick", "交易失败拍卖，而非单根影线"),
    text("Swing-failure sequence", "摆动失败序列"),
    text(
      "A valid SFP runs the swing, closes back inside, and preserves the nearby invalidation level.",
      "有效 SFP 会刺穿摆动点、收盘回到区间内，并保留清晰的邻近失效位。",
    ),
    [
      legend("Deviation", "偏离区", "bear"),
      legend("Close back inside", "收盘回区间", "bull"),
      legend("Invalidation", "失效位", "warn"),
    ],
  ),
  "structure/sr": visual(
    "structure/sr",
    text("Rank levels by evidence", "按证据强度评估水平位"),
    text("Adaptive support and resistance", "自适应支撑阻力"),
    text(
      "Repeated reactions increase a level's score; a clean break and retest can flip its role.",
      "反复反应会提高水平位评分；干净突破并回测后，支撑与阻力可能互换。",
    ),
    [
      legend("High-confidence level", "高置信水平位", "accent"),
      legend("Reaction", "价格反应", "bull"),
      legend("Role flip", "角色互换", "warn"),
    ],
  ),
  "structure/mfp": visual(
    "structure/mfp",
    text("Find where participation concentrates", "寻找成交参与的集中区"),
    text("Money-flow profile", "资金流分布"),
    text(
      "The point of control marks peak participation; value-area edges frame acceptance and rejection.",
      "控制点标记成交参与峰值；价值区边界界定市场接受与拒绝的位置。",
    ),
    [
      legend("Value area", "价值区", "accent"),
      legend("Point of control", "控制点", "warn"),
      legend("Directional flow", "方向资金流", "volume"),
    ],
  ),
  "structure/pat": visual(
    "structure/pat",
    text("Let confirmed geometry define the trade", "让已确认几何定义交易"),
    text("Trendline and channel workflow", "趋势线与通道流程"),
    text(
      "Confirmed pivots anchor trendlines; parallel pairs form channels, and a channel break can project one measured-move objective.",
      "已确认拐点锚定趋势线；平行线组成通道，通道突破后可投射一个量度目标。",
    ),
    [
      legend("Confirmed trendline", "已确认趋势线", "accent"),
      legend("Confirmed break", "确认突破", "bull"),
      legend("Measured target", "测量目标", "warn"),
    ],
  ),
  "trend/te": visual(
    "trend/te",
    text("Manage the full trade path", "管理完整交易路径"),
    text("Signal, target, and trailing risk", "信号、目标与追踪风险"),
    text(
      "The trend flip starts the thesis, the adaptive rail defines invalidation, and the ladder turns expansion into staged exits.",
      "趋势翻转建立交易逻辑，自适应轨道定义失效，目标阶梯把扩张行情转化为分批退出。",
    ),
    [
      legend("Trend rail", "趋势轨道", "accent"),
      legend("BUY / target hit", "买入／目标达成", "bull"),
      legend("Trailing stop", "追踪止损", "bear"),
    ],
  ),
  "trend/fb": visual(
    "trend/fb",
    text("Read direction and participation together", "同步读取方向与参与度"),
    text("Flow-band confirmation", "流向带确认"),
    text(
      "A widening, rising cloud shows aligned flow; the first orderly retest offers the cleanest risk reference.",
      "向上扩张的云带表示资金流协同；第一次有序回测通常提供最清晰的风险锚点。",
    ),
    [
      legend("Directional cloud", "方向云带", "accent"),
      legend("Quality retest", "高质量回测", "bull"),
      legend("Flow deterioration", "资金流恶化", "bear"),
    ],
  ),
  "trend/vb": visual(
    "trend/vb",
    text("Recognize expansion without chasing it", "识别扩张，同时避免追高"),
    text("Volatility-envelope reaction", "波动包络反应"),
    text(
      "Price outside the envelope signals overextension; the close back inside supplies reversal confirmation.",
      "价格越过包络代表过度延伸；收盘回到带内才提供反转确认。",
    ),
    [
      legend("Volatility envelope", "波动包络", "accent"),
      legend("Overextension", "过度延伸", "warn"),
      legend("Re-entry confirmation", "回归确认", "bull"),
    ],
  ),
  "trend/cp": visual(
    "trend/cp",
    text("Turn candle color into market state", "把 K 线颜色转化为市场状态"),
    text("State-colored price action", "状态着色价格行为"),
    text(
      "Color changes summarize the selected trend, momentum, or volume model without altering candle geometry.",
      "颜色变化汇总所选趋势、动量或成交量模型，同时不改变 K 线本身结构。",
    ),
    [
      legend("Constructive state", "建设性状态", "bull"),
      legend("Transition", "过渡状态", "warn"),
      legend("Defensive state", "防御性状态", "bear"),
    ],
  ),
  "trend/dash": visual(
    "trend/dash",
    text("Compress the regime into one glance", "一眼压缩整个市场环境"),
    text("Market-state dashboard", "市场状态仪表盘"),
    text(
      "Volatility, compression, trend, pressure, rating, and Chart/2×/4× state form a compact decision checklist.",
      "波动、压缩、趋势、压力、评级与图表／2×／4× 状态共同组成紧凑决策清单。",
    ),
    [
      legend("Constructive", "建设性", "bull"),
      legend("Caution", "谨慎", "warn"),
      legend("Defensive", "防御性", "bear"),
    ],
  ),
  "pulse/wave": visual(
    "pulse/wave",
    text("Spot momentum turning before price confirms", "在价格确认前捕捉动量转折"),
    text("Normalized momentum wave", "标准化动量波"),
    text(
      "Extremes reveal stretched momentum, while slope inflection and the zero-line reclaim sequence the turn.",
      "极值揭示动量过度延伸；斜率拐点与零轴收复共同排列转折顺序。",
    ),
    [
      legend("Positive pulse", "正向脉冲", "bull"),
      legend("Negative pulse", "负向脉冲", "bear"),
      legend("Early turn", "早期转折", "warn"),
    ],
  ),
  "pulse/sig": visual(
    "pulse/sig",
    text("Distinguish setup markers from triggers", "区分准备信号与真正触发"),
    text("Pulse signal grammar", "脉冲信号语法"),
    text(
      "Diamonds flag improving dips, dots mark exhaustion, and BUY/SELL turns require the wave to rotate.",
      "菱形提示回踩改善，圆点标记衰竭，BUY／SELL 转折则要求波形真正旋转。",
    ),
    [
      legend("BUY turn", "买入转折", "bull"),
      legend("SELL turn", "卖出转折", "bear"),
      legend("Setup marker", "准备标记", "warn"),
    ],
  ),
  "pulse/div": visual(
    "pulse/div",
    text("Compare price direction with internal force", "比较价格方向与内部力量"),
    text("Pulse divergence", "脉冲背离"),
    text(
      "A lower price low paired with a higher Pulse low exposes weakening downside force; confirmation still comes from price.",
      "价格创新低而脉冲形成更高低点，说明下行动能减弱；最终确认仍须来自价格。",
    ),
    [
      legend("Price leg", "价格走势", "muted"),
      legend("Momentum disagreement", "动量分歧", "bull"),
      legend("Confirmation", "价格确认", "accent"),
    ],
  ),
  "pulse/vmap": visual(
    "pulse/vmap",
    text("Measure whether a move has participation", "衡量行情是否获得成交参与"),
    text("Volume mapped to momentum", "成交量映射到动量"),
    text(
      "Relative-volume columns reveal conviction behind each Pulse rotation instead of treating every turn equally.",
      "相对成交量柱揭示每次脉冲旋转背后的确信度，避免把所有转折视为同等质量。",
    ),
    [
      legend("Pulse wave", "脉冲波", "accent"),
      legend("Positive participation", "正向参与", "volume"),
      legend("Low-conviction turn", "低确信转折", "muted"),
    ],
  ),
  "pulse/flow": visual(
    "pulse/flow",
    text("Cross-check momentum with money pressure", "用资金压力交叉验证动量"),
    text("MFI and volume-flow context", "MFI 与成交量流环境"),
    text(
      "MFI measures price-volume intensity while estimated CVD tracks directional pressure; agreement strengthens the Pulse thesis.",
      "MFI 衡量价量强度，估算 CVD 追踪方向压力；两者一致时会增强脉冲逻辑。",
    ),
    [
      legend("Pulse", "脉冲", "accent"),
      legend("Money flow", "资金流", "bull"),
      legend("Volume pressure", "成交量压力", "volume"),
    ],
  ),
  "pulse/mtf": visual(
    "pulse/mtf",
    text("Separate live movement from confirmed state", "区分实时波动与已确认状态"),
    text("Pulse across chart resolutions", "跨图表分辨率脉冲"),
    text(
      "Rows compare the chart with completed 2× and 4× resampled blocks—never implied independent timeframe feeds.",
      "各行比较图表与已完成的 2×、4× 重采样区块，不假装使用独立周期数据。",
    ),
    [
      legend("Aligned bullish", "看涨协同", "bull"),
      legend("Mixed", "分歧", "warn"),
      legend("Aligned bearish", "看跌协同", "bear"),
    ],
  ),
  "rsix/eng": visual(
    "rsix/eng",
    text("Read strength as a regime, not a number", "把强弱视为环境，而非单一数值"),
    text("RSI state engine", "RSI 状态引擎"),
    text(
      "Thresholds frame stretched conditions, smoothing reveals the durable slope, and the centerline separates regimes.",
      "阈值框定过度延伸，平滑线揭示持续斜率，中轴则区分市场环境。",
    ),
    [
      legend("RSI engine", "RSI 引擎", "accent"),
      legend("Smoothed state", "平滑状态", "bull"),
      legend("Extreme zone", "极值区", "warn"),
    ],
  ),
  "rsix/sig": visual(
    "rsix/sig",
    text("Sequence reversal, deviation, and follow-through", "排列反转、偏离与跟进"),
    text("RSI signal progression", "RSI 信号进程"),
    text(
      "The reversal marks the turn, deviation +1 and +2 grade follow-through, and crossover dots confirm state change.",
      "反转标记转向，偏离 +1 与 +2 评估后续推进，交叉圆点确认状态变化。",
    ),
    [
      legend("Reversal", "反转", "bull"),
      legend("Deviation follow-through", "偏离跟进", "warn"),
      legend("Cross confirmation", "交叉确认", "accent"),
    ],
  ),
  "rsix/div": visual(
    "rsix/div",
    text("Expose strength that price is hiding", "揭示价格尚未反映的强弱变化"),
    text("RSI divergence", "RSI 背离"),
    text(
      "Compare matched pivots: price extending while RSI contracts reveals loss of directional efficiency.",
      "比较对应拐点：价格继续延伸而 RSI 收缩，代表方向效率正在下降。",
    ),
    [
      legend("Price extension", "价格延伸", "muted"),
      legend("RSI contraction", "RSI 收缩", "bull"),
      legend("Pivot pair", "拐点配对", "accent"),
    ],
  ),
  "rsix/chan": visual(
    "rsix/chan",
    text("Measure RSI relative to its own volatility", "衡量 RSI 相对自身波动的位置"),
    text("Adaptive RSI channel", "自适应 RSI 通道"),
    text(
      "The channel turns a fixed oscillator into a volatility-aware map of expansion, compression, and mean reversion.",
      "通道把固定振荡器转化为具备波动感知的扩张、压缩与均值回归地图。",
    ),
    [
      legend("Adaptive envelope", "自适应包络", "accent"),
      legend("Expansion", "扩张", "warn"),
      legend("Mean reversion", "均值回归", "bull"),
    ],
  ),
  "rsix/mtf": visual(
    "rsix/mtf",
    text("Align strength from trigger to regime", "从触发周期到环境周期对齐强弱"),
    text("RSI across chart resolutions", "跨图表分辨率 RSI"),
    text(
      "RSI values, signals, and divergences compare the chart with completed 2× and 4× resampled blocks.",
      "RSI 数值、信号与背离把图表和已完成的 2×、4× 重采样区块并排比较。",
    ),
    [
      legend("Strong", "强势", "bull"),
      legend("Neutral", "中性", "warn"),
      legend("Weak", "弱势", "bear"),
    ],
  ),
  "macdx/eng": visual(
    "macdx/eng",
    text("Normalize momentum across instruments", "跨标的标准化动量"),
    text("±100 MACD engine", "±100 MACD 引擎"),
    text(
      "Normalization makes distance and slope comparable while the MACD/signal relationship exposes acceleration.",
      "标准化让距离与斜率具备可比性，MACD 与信号线的关系则揭示加速变化。",
    ),
    [
      legend("MACD line", "MACD 线", "accent"),
      legend("Signal line", "信号线", "warn"),
      legend("Normalized extreme", "标准化极值", "bear"),
    ],
  ),
  "macdx/sig": visual(
    "macdx/sig",
    text("Demand rotation at the extreme", "要求极值区出现真实旋转"),
    text("MACD reversal trigger", "MACD 反转触发"),
    text(
      "Entering an extreme is only context; the reversal marker appears after momentum rotates back toward balance.",
      "进入极值区只是环境；只有动量重新转向平衡时才出现反转标记。",
    ),
    [
      legend("Extreme zone", "极值区", "bear"),
      legend("Momentum rotation", "动量旋转", "accent"),
      legend("Reversal trigger", "反转触发", "bull"),
    ],
  ),
  "macdx/hist": visual(
    "macdx/hist",
    text("Read acceleration bar by bar", "逐柱读取加速变化"),
    text("Four-state histogram", "四状态柱状图"),
    text(
      "Bar height shows impulse, color distinguishes rising from falling momentum, and zero flips mark regime changes.",
      "柱高表示推动力，颜色区分动量上升或下降，零轴翻转标记环境变化。",
    ),
    [
      legend("Rising positive", "正向增强", "bull"),
      legend("Falling positive", "正向减弱", "warn"),
      legend("Negative impulse", "负向推动", "bear"),
    ],
  ),
  "macdx/div": visual(
    "macdx/div",
    text("Compare price extension with normalized impulse", "比较价格延伸与标准化推动力"),
    text("MACD divergence", "MACD 背离"),
    text(
      "Matched price and MACD pivots reveal when a new extreme is being produced with less momentum.",
      "对应的价格与 MACD 拐点揭示新极值是否由更弱动量推动。",
    ),
    [
      legend("Price extreme", "价格极值", "muted"),
      legend("Momentum contraction", "动量收缩", "bull"),
      legend("Divergence pair", "背离配对", "accent"),
    ],
  ),
  "macdx/trend": visual(
    "macdx/trend",
    text("Name the phase before choosing the tactic", "先识别阶段，再选择战术"),
    text("MACD phase cycle", "MACD 阶段周期"),
    text(
      "Accumulation, expansion, distribution, and contraction describe how momentum is evolving—not a guaranteed price direction.",
      "吸筹、扩张、派发与收缩描述动量如何演变，而不是保证价格方向。",
    ),
    [
      legend("Accumulation / expansion", "吸筹／扩张", "bull"),
      legend("Distribution", "派发", "warn"),
      legend("Contraction", "收缩", "bear"),
    ],
  ),
  "macdx/mtf": visual(
    "macdx/mtf",
    text("Align impulse and phase across time", "跨周期对齐推动力与阶段"),
    text("MACD across chart resolutions", "跨图表分辨率 MACD"),
    text(
      "MACD values, reversals, and phases compare the chart with completed 2× and 4× resampled blocks.",
      "MACD 数值、反转与阶段把图表和已完成的 2×、4× 重采样区块并排比较。",
    ),
    [
      legend("Expansion", "扩张", "bull"),
      legend("Transition", "过渡", "warn"),
      legend("Contraction", "收缩", "bear"),
    ],
  ),
};

export function guideVisualId(suiteKey: string, moduleKey: string): string {
  return `${suiteKey}/${moduleKey}`;
}

export function getGuideVisualMetadata(
  suiteKey: string,
  moduleKey: string,
): GuideVisualMetadata | null {
  const id = guideVisualId(suiteKey, moduleKey);
  return Object.prototype.hasOwnProperty.call(GUIDE_VISUALS, id)
    ? GUIDE_VISUALS[id as GuideVisualId]
    : null;
}

export function localizeGuideText(value: LocalizedGuideText, lang: GuideLanguage): string {
  return value[lang];
}
