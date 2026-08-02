/**
 * volStrings.ts — bilingual EN/ZH string table for the Volatility tab.
 *
 * Pattern matches gexStrings.ts: each key maps to [English, 中文].
 *
 * HONESTY DOCTRINE (enforced here):
 *   - The options_hub.vol store is NIGHTLY EOD — no "LIVE" language anywhere;
 *     the asof chip is the only freshness truth.
 *   - Vol is NON-DIRECTIONAL: no bullish/bearish copy, no signal language.
 *   - Structure labels (Contango / Inverted) are descriptive term-structure
 *     geometry, never a forecast.
 *
 * NOTE: translated strings MUST NOT appear in HTML title= attributes
 * (CI-guarded). Use aria-label or the components/ui/Tip primitive instead.
 */

import type { Lang } from "@/lib/i18n";

const VOL_LEX = {
  // ── Header / controls ──────────────────────────────────────────────────────
  tickerInputLabel:  ["Ticker", "代码"],
  tickerPlaceholder: ["SPY", "SPY"],
  // Freshness chip — the ONE truth about cadence on this surface.
  asofChip:          ["Nightly EOD · as of {date}", "每晚收盘 · 更新于 {date}"],
  asofStaleAge:      ["{n} sessions old", "{n} 个交易日前"],
  loading:           ["Loading volatility data…", "加载波动率数据中…"],
  errorLoad:         ["Could not load volatility data", "无法加载波动率数据"],
  // Honest empty — a missing single name is a nightly-coverage gap, not a broken tab.
  emptyTitle:        ["No volatility snapshot for this name yet", "该品种暂无波动率快照"],
  emptyWhy: [
    "{sym} isn't in this nightly build — index anchors and the most liquid single names publish first.",
    "本次夜间构建中没有 {sym} — 指数锚定品种与流动性最高的个股优先发布。",
  ],
  // Per-panel provenance footer (store name stays literal; cadence translates).
  provenance:        ["options_hub · nightly EOD", "options_hub · 每晚收盘数据"],

  // ── Panel A — stat tiles ───────────────────────────────────────────────────
  statsTitle:        ["Volatility snapshot", "波动率概览"],
  statAtmIv:         ["ATM IV", "平值IV"],
  statIvRank252:     ["IV Rank 252d", "IV百分位 252日"],
  statIvRankAll:     ["IV Rank all-history", "IV百分位 全历史"],
  statSinceCaption:  ["since {date} · {n}d", "自 {date} · {n}日"],
  stat52wRange:      ["52-week IV range", "52周IV区间"],
  statRv20:          ["RV20", "RV20"],
  statRv20Caption:   ["20d realized vol", "20日已实现波动率"],
  statVrp:           ["VRP", "波动率风险溢价"],
  statVrpCaption:    ["IV − RV20", "IV − RV20"],
  statRangeAria:     ["Current ATM IV position inside the 52-week range", "当前平值IV在52周区间中的位置"],

  // ── Panel B — ATM IV history ───────────────────────────────────────────────
  histTitle:         ["ATM IV history", "平值IV历史"],
  // Coverage is disclosed from the data (the old title asserted "90-day" over
  // whatever history[] actually held).
  histCoverage:      ["{n} sessions · since {d}", "{n} 个交易日 · 自 {d}"],
  histEmptyTitle:    ["Not enough IV history to draw yet", "IV历史数据不足，暂无法绘制"],
  histEmptyWhy: [
    "The history line needs at least 10 sessions of ATM IV.",
    "历史曲线需要至少 10 个交易日的平值IV数据。",
  ],
  hist52wHi:         ["52w hi", "52周高"],
  hist52wLo:         ["52w lo", "52周低"],
  histAria:          ["ATM implied volatility across recent sessions", "近期交易日的平值隐含波动率"],

  // ── Panel C — term structure ───────────────────────────────────────────────
  termTitle:         ["Term structure", "期限结构"],
  termEmptyTitle:    ["No term structure for this name yet", "该品种暂无期限结构数据"],
  termEmptyWhy: [
    "The nightly build publishes per-expiration ATM IV only for covered names.",
    "夜间构建仅为已覆盖品种发布按到期日的平值IV。",
  ],
  termXAxis:         ["DTE", "到期天数"],
  termContango:      ["Contango", "正向期限结构"],
  termInverted:      ["Inverted", "期限结构倒挂"],
  // Chip disclosure — states WHAT is compared, so the label can't read as a signal.
  termChipAria: [
    "Front expiration ATM IV {front}% vs nearest-to-90d ATM IV {far}% — a term-structure shape, not a forecast.",
    "最近到期平值IV {front}% 对比最接近90日的平值IV {far}% — 仅为期限结构形态，并非预测。",
  ],

  // ── Panel D — smile / skew ─────────────────────────────────────────────────
  skewTitle:         ["Smile / skew", "微笑 / 偏斜"],
  skewEmptyTitle:    ["No smile data for this name yet", "该品种暂无微笑曲线数据"],
  skewEmptyWhy: [
    "The nightly build publishes per-strike IV only for the nearest expirations of covered names.",
    "夜间构建仅为已覆盖品种的近月到期发布按行权价的IV。",
  ],
  skewExpAria:       ["Smile expiration", "微笑曲线到期日"],
  skewCallLeg:       ["Call IV", "认购IV"],
  skewPutLeg:        ["Put IV", "认沽IV"],
  skewFullChain:     ["Full chain", "完整链"],
  skewTrimmedChip:   ["wings trimmed ±20%", "翼部已截取 ±20%"],
  // Disclosure for the trim chip — deep-ITM wings carry garbage IV prints.
  skewTrimTip: [
    "Strikes beyond ±20% of the at-the-money strike are hidden by default — deep-ITM quotes carry unreliable implied vols. Toggle Full chain to see everything.",
    "默认隐藏偏离平值行权价 ±20% 以外的行权价 — 深度实值报价的隐含波动率不可靠。切换到完整链可查看全部。",
  ],
  skewStrikeAxis:    ["Strike", "行权价"],
} as const;

type VolDeskKey = keyof typeof VOL_LEX;

export function getVolStr(lang: Lang, key: VolDeskKey): string {
  const entry = VOL_LEX[key as keyof typeof VOL_LEX];
  if (!entry) return "";
  return lang === "zh" ? entry[1] : entry[0];
}

export function makeVolT(lang: Lang): (key: VolDeskKey) => string {
  return (key: VolDeskKey) => getVolStr(lang, key);
}

export type { VolDeskKey };
