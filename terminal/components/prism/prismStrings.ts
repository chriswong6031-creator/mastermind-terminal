/**
 * prismStrings.ts — bilingual EN/ZH string table for the PRISM tab.
 *
 * Pattern matches gexStrings.ts / flowdeskStrings.ts: each key maps to [English, 中文].
 *
 * HONESTY DOCTRINE (enforced here):
 *   - GEX sign is ASSUMED dealer-short convention, not measured fact.
 *   - "Magnitude is the reliable read" — stated on every signed-lens panel.
 *   - HeatSeeker pick carries the verbatim disclaimer "descriptive — not a recommendation".
 *   - VEX is labeled "experimental — deferred".
 *   - UNUSUAL is labeled "accruing baseline" until 30-day history is present.
 *   - ΔOI carries a "PIT: OI[t-1]−OI[t-2]" caption (our naming, not MomoEdge's).
 *   - No "validated", "predictive", or asserted-direction copy.
 *   - Translated strings MUST NOT appear in HTML title= attributes (CI-guarded).
 *     Use aria-label or visible text spans.
 */

import type { Lang } from "@/lib/i18n";

const PRISM_LEX = {
  // ── Surface header ─────────────────────────────────────────────────────────
  prismTitle:      ["PRISM", "PRISM"],
  prismSubtitle:   ["Options structure matrix", "期权结构矩阵"],

  // ── Mode toggle ────────────────────────────────────────────────────────────
  modeSingle:      ["SINGLE", "单品种"],
  modeConfluence:  ["CONFLUENCE", "联合"],

  // ── Lens tabs (active) ─────────────────────────────────────────────────────
  lensGex:         ["GEX", "GEX"],
  lensOi:          ["OI", "持仓量"],
  lensVol:         ["VOL", "成交量"],
  lensDoi:         ["ΔOI", "ΔOI"],
  lensVex:         ["VEX", "VEX"],
  lensUnusual:     ["UNUSUAL", "异常"],

  // ── Lens disabled labels ───────────────────────────────────────────────────
  lensVexDisabled:     ["experimental — deferred", "实验性 — 延期"],
  lensUnusualDisabled: ["accruing baseline", "基线积累中"],

  // ── DTE range chips ────────────────────────────────────────────────────────
  dte7:    ["≤7d", "≤7天"],
  dte30:   ["≤30d", "≤30天"],
  dte90:   ["≤90d", "≤90天"],
  dteAll:  ["ALL", "全部"],

  // ── Normalization ──────────────────────────────────────────────────────────
  normGlobal:  ["GLOBAL", "全局"],
  normColumn:  ["PER-COL", "按列"],

  // ── Strike range chips ─────────────────────────────────────────────────────
  range10:  ["±10", "±10"],
  range20:  ["±20", "±20"],
  range40:  ["±40", "±40"],
  strikeRangeLabel: ["RANGE", "区间"],

  // ── DTE column count ───────────────────────────────────────────────────────
  dteCols: ["COLS", "列数"],

  // ── Expiry scope ──────────────────────────────────────────────────────────
  scopeDefault: ["DEFAULT", "默认"],
  scope0dte:    ["0DTE", "0DTE"],
  scopeAll:     ["ALL Σ", "全部Σ"],

  // ── Spot ──────────────────────────────────────────────────────────────────
  spotLabel: ["Spot", "现价"],

  // ── Level badges (strike row labels) ──────────────────────────────────────
  levelWall:     ["WALL", "看涨墙"],
  levelSupport:  ["SUPPORT", "看跌墙"],
  levelFlip:     ["FLIP", "翻转"],
  levelMagnet:   ["MAGNET", "磁吸"],
  levelMaxPain:  ["MAX PAIN", "最大痛苦"],
  levelSpot:     ["SPOT", "现价"],

  // ── Column headers ─────────────────────────────────────────────────────────
  colStrike:    ["Strike", "行权价"],
  colSpotPct:   ["% from Spot", "距现价%"],

  // ── Tooltip labels ─────────────────────────────────────────────────────────
  tipCallOi:    ["Call OI", "认购持仓"],
  tipPutOi:     ["Put OI", "认沽持仓"],
  tipCallVol:   ["Call Vol", "认购成交量"],
  tipPutVol:    ["Put Vol", "认沽成交量"],
  tipNetGex:    ["Net GEX", "净GEX"],
  tipDoi:       ["ΔOI", "ΔOI"],
  tipStrike:    ["Strike", "行权价"],
  tipExpiry:    ["Expiry", "到期日"],
  tipDte:       ["DTE", "到期天数"],
  tipValue:     ["Value", "数值"],

  // ── GEX formula unit line (shown in tooltip) ──────────────────────────────
  gexFormulaUnit: [
    "$ gamma per 1% move — dealer-sign assumed",
    "每1%波动的美元伽马 — 假定做市商符号",
  ],

  // ── Per-lens unit descriptions ─────────────────────────────────────────────
  gexUnitDesc: [
    "Dollar gamma exposure per 1% spot move. Sign follows the standard dealer convention (calls +, puts −) — an assumption, not a measured fact. Magnitude is the reliable read.",
    "每1%现价波动的美元伽马敞口。符号遵循标准做市商惯例（认购为正，认沽为负）——这是假设而非实测事实。数量级才是可靠读数。",
  ],
  oiUnitDesc: [
    "Net open interest at this cell, calls minus puts, in contracts. Positive = more calls parked; negative = more puts.",
    "本格净持仓量（认购减认沽），单位：张。正值 = 认购更多；负值 = 认沽更多。",
  ],
  volUnitDesc: [
    "Net traded volume today at this cell, calls minus puts, in contracts. Fresh flow rather than standing positions.",
    "本格今日净成交量（认购减认沽），单位：张。反映当日新增流量而非存量持仓。",
  ],
  doiUnitDesc: [
    "PIT: OI[t-1] − OI[t-2] — day-over-day change in open interest per cell. Positive = contracts added; negative = contracts removed.",
    "定点快照：OI[t-1]−OI[t-2] — 每格持仓量逐日变化。正值 = 新增合约；负值 = 减少合约。",
  ],
  vexUnitDesc: [
    "DTE-weighted vanna load, normalized across expirations. Experimental — deferred pending data stability review.",
    "DTE加权vanna负载，跨到期日归一化。实验性 — 数据稳定性验证完成前暂缓。",
  ],
  unusualUnitDesc: [
    "Volume vs trailing 30-day per-strike median. Ratio ≥3× flags unusual activity. Accruing baseline — shows NO HIST until 30-day history is present.",
    "成交量与过去30日每行权价中位数对比。比率≥3×标记为异常活动。基线积累中 — 30日历史数据齐全前显示无历史记录。",
  ],

  // ── ΔOI caption ────────────────────────────────────────────────────────────
  doiCaption: [
    "PIT: OI[t-1]−OI[t-2]",
    "定点：OI[t-1]−OI[t-2]",
  ],

  // ── Honesty banners ────────────────────────────────────────────────────────
  magnitudeFirst: [
    "Sign is an assumption, not a fact. Magnitude is the reliable read.",
    "符号为假设而非事实。数量级才是可靠读数。",
  ],
  dealerSignNote: [
    "Dealer-sign assumed (standard convention). If dealers hold net long gamma, sign inverts.",
    "假定做市商符号（标准惯例）。若做市商持有净多伽马，符号将反转。",
  ],
  descriptiveOnly: [
    "Descriptive — not a recommendation. Index complex only.",
    "仅供描述 — 非交易建议。仅限指数组合。",
  ],

  // ── HeatSeeker card ────────────────────────────────────────────────────────
  heatSeekerTitle:      ["HeatSeeker Pick", "热点精选"],
  heatSeekerDisclaimer: [
    "descriptive — not a recommendation",
    "仅供描述 — 非交易建议",
  ],
  heatSeekerLens:       ["Lens", "视角"],
  heatSeekerStrike:     ["Strike", "行权价"],
  heatSeekerExpiry:     ["Expiry", "到期日"],
  heatSeekerRatio:      ["Standout ratio", "突出比率"],
  heatSeekerConf:       ["Confidence", "置信度"],
  heatSeekerNull:       [
    "No standout pick — load is shared across levels.",
    "无突出精选 — 仓位分布于多个价位。",
  ],
  heatSeekerGated:      ["★ PICK", "★ 精选"],
  heatSeekerRaw:        ["⚡ RAW", "⚡ 原始"],

  // ── OI Movers rail ─────────────────────────────────────────────────────────
  oiMoversTitle:   ["OI Movers", "持仓量变动"],
  oiMoversNew:     ["NEW", "新增"],
  oiMoversUp:      ["▲", "▲"],
  oiMoversDown:    ["▼", "▼"],
  oiMoversCall:    ["Call", "认购"],
  oiMoversPut:     ["Put", "认沽"],
  oiMoversEmpty:   ["No OI movers — data loading or none detected.", "暂无持仓量变动 — 数据加载中或未检测到。"],

  // ── Confluence ─────────────────────────────────────────────────────────────
  confluenceTitle:    ["Confluence", "联合视图"],
  confluenceNote:     [
    "Strikes normalized to % from spot — index-only, descriptive. This is not a trading signal.",
    "行权价以距现价百分比表示 — 仅限指数，仅供描述。这不是交易信号。",
  ],
  confluenceAligned:  ["levels aligned — index complex", "水平对齐 — 指数组合"],
  confluence2of3:     ["2/3 aligned", "2/3对齐"],
  confluence3of3:     ["3/3 aligned", "3/3对齐"],
  confluenceEmpty:    [
    "No alignment detected across indices at this lens.",
    "当前视角下指数间未检测到对齐。",
  ],

  // ── Loading / error states ─────────────────────────────────────────────────
  loading:      ["Loading…", "加载中…"],
  loadingMatrix:["Loading matrix…", "加载矩阵中…"],
  errorMatrix:  ["Could not load matrix data", "无法加载矩阵数据"],
  errorRetry:   ["Retry", "重试"],
  noData:       ["No data — select a ticker", "暂无数据 — 请选择品种"],
  noDataMatrix: ["No matrix data for this ticker", "该品种暂无矩阵数据"],

  // ── Ticker input ──────────────────────────────────────────────────────────
  tickerLabel:       ["Ticker", "代码"],
  tickerPlaceholder: ["SPY", "SPY"],
  asOf:              ["as of", "更新于"],
  lastSession:       ["last session", "上一交易日"],
  daysOld:           ["{n}d old", "{n}天前"],
} as const;

type PrismKey = keyof typeof PRISM_LEX;

export function getPrismStr(lang: Lang, key: PrismKey): string {
  const entry = PRISM_LEX[key];
  if (!entry) return "";
  return lang === "zh" ? entry[1] : entry[0];
}

export function makePrismT(lang: Lang): (key: PrismKey) => string {
  return (key: PrismKey) => getPrismStr(lang, key);
}

export type { PrismKey };
