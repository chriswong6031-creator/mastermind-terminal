import type { GuideLanguage, LocalizedGuideText } from "../experience";

export const SYSTEM_GUIDE_IDS = [
  "system:structure",
  "system:trend",
  "system:pulse",
  "system:rsix",
  "system:macdx",
] as const;

export type SystemGuideId = (typeof SYSTEM_GUIDE_IDS)[number];
export type SystemGuideSuiteKey = "structure" | "trend" | "pulse" | "rsix" | "macdx";

export interface SystemGuideDocument {
  en?: string;
  zh?: string;
}

export interface SystemGuideWorkflowStage {
  /** Stable, language-neutral anchor for navigation and future animated lessons. */
  id: string;
  title: LocalizedGuideText;
  summary: LocalizedGuideText;
  /** Short module keys in the order a learner should consult them at this stage. */
  moduleKeys: readonly string[];
}

export interface SystemGuideDescriptor {
  id: SystemGuideId;
  suiteKey: SystemGuideSuiteKey;
  title: LocalizedGuideText;
  summary: LocalizedGuideText;
  /** Every module covered by the playbook, in the suite's canonical registry order. */
  moduleKeys: readonly string[];
  /** Decision workflow, ordered from context through management. */
  workflow: readonly SystemGuideWorkflowStage[];
  /** Guide prose remains code-split until the learner opens this playbook. */
  load: () => Promise<SystemGuideDocument>;
}

const text = (en: string, zh: string): LocalizedGuideText => ({ en, zh });

function stage(
  id: string,
  en: string,
  zh: string,
  summaryEn: string,
  summaryZh: string,
  moduleKeys: readonly string[],
): SystemGuideWorkflowStage {
  return {
    id,
    title: text(en, zh),
    summary: text(summaryEn, summaryZh),
    moduleKeys,
  };
}

export const SYSTEM_GUIDES: Readonly<Record<SystemGuideId, SystemGuideDescriptor>> = {
  "system:structure": {
    id: "system:structure",
    suiteKey: "structure",
    title: text("Structure Core Playbook", "结构核心作战手册"),
    summary: text(
      "Turn a dense structure map into a four-step read: regime, location, trigger, and risk.",
      "把密集的结构图整理成四步：环境、位置、触发与风险。",
    ),
    moduleKeys: ["ms", "ob", "fvg", "pd", "liq", "sfp", "sr", "mfp", "pat"],
    workflow: [
      stage(
        "map",
        "Map the regime",
        "判断结构环境",
        "Use confirmed swing structure to decide which side controls the auction.",
        "用已确认的摆动结构判断当前由哪一方控制。",
        ["ms"],
      ),
      stage(
        "locate",
        "Locate the decision area",
        "定位决策区域",
        "Choose one value map and one zone family instead of stacking every overlay.",
        "只选择一种价值地图和一种区域工具，不要把所有叠加层堆在一起。",
        ["pd", "sr", "mfp", "ob", "fvg"],
      ),
      stage(
        "trigger",
        "Wait for the reaction",
        "等待价格反应",
        "A sweep, swing failure, reclaim, or confirmed structure event turns context into a decision.",
        "扫单、摆动失败、收回或已确认结构事件，才把背景转化为决策。",
        ["liq", "sfp", "ms"],
      ),
      stage(
        "manage",
        "Define invalidation and objective",
        "定义失效与目标",
        "Anchor risk to the structure that proves the thesis wrong and project only confirmed geometry.",
        "把风险锚定在能证明逻辑错误的结构上，目标只采用已确认的几何。",
        ["ob", "fvg", "sr", "pat"],
      ),
    ],
    load: () => import("./structure"),
  },
  "system:trend": {
    id: "system:trend",
    suiteKey: "trend",
    title: text("Trend Waves Playbook", "趋势波段作战手册"),
    summary: text(
      "Use one trend engine to sequence direction, entry, trailing risk, and staged targets.",
      "用一套趋势引擎依次处理方向、入场、追踪风险与分阶段目标。",
    ),
    moduleKeys: ["te", "fb", "vb", "cp", "dash"],
    workflow: [
      stage(
        "bias",
        "Set directional bias",
        "确定方向偏向",
        "Read the Trend Engine first, then use flow and completed coarse states as confirmation.",
        "先读趋势引擎，再用资金流和已完成的粗分辨率状态做确认。",
        ["te", "fb", "dash"],
      ),
      stage(
        "entry",
        "Choose the execution",
        "选择执行位置",
        "Prefer a confirmed flip or orderly band retest over chasing an extended candle.",
        "优先选择已确认翻转或有序回测，不追逐已经延伸的K线。",
        ["te", "fb", "vb"],
      ),
      stage(
        "protect",
        "Anchor the risk",
        "锚定风险",
        "Use the selected stop model and the price swing behind the setup, not a signal pill alone.",
        "使用所选止损模型与形态背后的价格摆动，而不是只依赖信号标签。",
        ["te", "vb"],
      ),
      stage(
        "manage",
        "Manage the expansion",
        "管理趋势扩张",
        "Let the TP ladder report progress while the trailing rail decides whether the trade remains valid.",
        "用止盈阶梯观察进度，同时让追踪轨道决定交易是否仍然有效。",
        ["te", "dash", "cp"],
      ),
    ],
    load: () => import("./trend"),
  },
  "system:pulse": {
    id: "system:pulse",
    suiteKey: "pulse",
    title: text("Pulse Timing Playbook", "脉冲择时作战手册"),
    summary: text(
      "Use the Pulse Wave for timing after price structure or trend has already supplied direction.",
      "先由价格结构或趋势确定方向，再用脉冲波完成择时。",
    ),
    moduleKeys: ["wave", "sig", "div", "vmap", "flow", "mtf"],
    workflow: [
      stage(
        "bias",
        "Bring an external bias",
        "先确定外部偏向",
        "Pulse measures momentum; price structure or trend must decide the side of the trade.",
        "脉冲衡量动量；交易方向必须由价格结构或趋势决定。",
        ["mtf"],
      ),
      stage(
        "stretch",
        "Watch stretch become a turn",
        "观察极值转化为拐点",
        "An extreme is context; slope rotation and phase change are the first usable evidence.",
        "极值只是背景；斜率旋转与阶段变化才是第一层可用证据。",
        ["wave"],
      ),
      stage(
        "trigger",
        "Demand a confirmed trigger",
        "要求已确认触发",
        "Use the reversal marker or a price confirmation, not an unconfirmed extreme or divergence.",
        "使用反转标记或价格确认，不把未确认极值或背离当成触发。",
        ["sig", "div"],
      ),
      stage(
        "confirm",
        "Grade participation and alignment",
        "评估参与度与协同",
        "Volume and money-flow context grade the turn; completed 2× and 4× cells grade the broader state.",
        "成交量与资金流用于评估转折质量；已完成的2×与4×单元格评估更大背景。",
        ["vmap", "flow", "mtf"],
      ),
    ],
    load: () => import("./pulse"),
  },
  "system:rsix": {
    id: "system:rsix",
    suiteKey: "rsix",
    title: text("RSI Ultimate Playbook", "RSI Ultimate 作战手册"),
    summary: text(
      "Read RSI as a state machine: calibration, stretch, rotation, follow-through, and confirmation.",
      "把 RSI 当成状态机来读：校准、延伸、旋转、跟进与确认。",
    ),
    moduleKeys: ["eng", "sig", "div", "chan", "mtf"],
    workflow: [
      stage(
        "calibrate",
        "Calibrate the engine",
        "校准引擎",
        "The Engine owns source, length, smoothing, and the suite's shared fixed 65/35 state.",
        "引擎负责数据源、周期、平滑，以及整套工具共用的固定65／35状态。",
        ["eng"],
      ),
      stage(
        "stretch",
        "Classify the condition",
        "判断当前状态",
        "Use thresholds and the adaptive channel to distinguish normal movement from real extension.",
        "用阈值与自适应通道区分正常波动和真正延伸。",
        ["eng", "chan"],
      ),
      stage(
        "trigger",
        "Wait for rotation",
        "等待旋转触发",
        "A confirmed reversal or meaningful crossover times the trade; divergence only changes context.",
        "已确认反转或有效交叉用于择时；背离只改变背景判断。",
        ["sig", "div"],
      ),
      stage(
        "confirm",
        "Measure delivery",
        "衡量信号兑现",
        "Deviation levels show follow-through while completed 2× and 4× cells show broader agreement.",
        "偏离阶梯显示后续兑现，已完成的2×与4×单元格显示更大范围的一致性。",
        ["sig", "mtf"],
      ),
    ],
    load: () => import("./rsix"),
  },
  "system:macdx": {
    id: "system:macdx",
    suiteKey: "macdx",
    title: text("MACD Ultimate Playbook", "MACD Ultimate 作战手册"),
    summary: text(
      "Separate momentum state, acceleration, reversal timing, and phase before acting on MACD.",
      "先分清动量状态、加速度、反转择时与阶段，再依据 MACD 行动。",
    ),
    moduleKeys: ["eng", "sig", "hist", "div", "trend", "mtf"],
    workflow: [
      stage(
        "state",
        "Read normalized state",
        "读取标准化状态",
        "The Engine establishes line relationship, slope, and distance from the normalized rails.",
        "引擎建立线间关系、斜率以及相对标准化轨道的距离。",
        ["eng"],
      ),
      stage(
        "impulse",
        "Measure acceleration",
        "衡量加速度",
        "Histogram opacity shows expansion or contraction; the phase lane shows committed direction.",
        "柱状图透明度显示扩张或收缩；阶段泳道显示已锁定方向。",
        ["hist", "trend"],
      ),
      stage(
        "trigger",
        "Demand rotation at an extreme",
        "要求极值区旋转",
        "The Signals module ignores ordinary mid-range crosses and marks only extreme-zone reversals.",
        "信号模块忽略普通中区交叉，只标记极值区反转。",
        ["sig", "div"],
      ),
      stage(
        "confirm",
        "Check broader agreement",
        "检查更大范围协同",
        "Use price confirmation and completed 2× and 4× cells before treating a turn as durable.",
        "在把转折视为可持续之前，先确认价格行为以及已完成的2×、4×单元格。",
        ["mtf", "hist"],
      ),
    ],
    load: () => import("./macdx"),
  },
};

export const SYSTEM_GUIDE_LIST: readonly SystemGuideDescriptor[] = SYSTEM_GUIDE_IDS.map(
  (id) => SYSTEM_GUIDES[id],
);

export function isSystemGuideId(value: string): value is SystemGuideId {
  return (SYSTEM_GUIDE_IDS as readonly string[]).includes(value);
}

export function getSystemGuide(id: string): SystemGuideDescriptor | null {
  return isSystemGuideId(id) ? SYSTEM_GUIDES[id] : null;
}

export function localizeSystemGuide(
  value: LocalizedGuideText,
  lang: GuideLanguage,
): string {
  return value[lang];
}

/** Load the requested language, falling back visibly to English just like module guides. */
export async function loadSystemGuide(
  id: string,
  lang: GuideLanguage,
): Promise<{ text: string; fellBack: boolean } | null> {
  const descriptor = getSystemGuide(id);
  if (!descriptor) return null;
  let document: SystemGuideDocument;
  try {
    document = await descriptor.load();
  } catch {
    return null;
  }
  const requested = document[lang];
  if (typeof requested === "string" && requested.trim()) {
    return { text: requested, fellBack: false };
  }
  if (typeof document.en === "string" && document.en.trim()) {
    return { text: document.en, fellBack: lang !== "en" };
  }
  return null;
}
