/**
 * structureStrings.ts — bilingual EN/ZH string table for the Structure (OI) tab.
 *
 * Pattern matches volStrings.ts: each key maps to [English, 中文].
 *
 * HONESTY DOCTRINE (enforced here):
 *   - The options_hub OI store is NIGHTLY EOD — no "LIVE" language anywhere;
 *     the asof chip is the only freshness truth.
 *   - OI TIMING LAW: open interest is reported one session in arrears (t-1).
 *     EVERY panel carries that disclosure — it is baked into the shared
 *     provenance footer and the header chip, never optional.
 *   - OI is NON-DIRECTIONAL: no bullish/bearish copy; max pain is a
 *     descriptive minimization, never a price forecast.
 *
 * NOTE: translated strings MUST NOT appear in HTML title= attributes
 * (CI-guarded). Use aria-label or the components/ui/Tip primitive instead.
 */

import type { Lang } from "@/lib/i18n";

const STRUCTURE_LEX = {
  // ── Header / controls ──────────────────────────────────────────────────────
  tickerInputLabel:  ["Ticker", "代码"],
  tickerPlaceholder: ["SPY", "SPY"],
  asofChip:          ["Nightly EOD · as of {date}", "每晚收盘 · 更新于 {date}"],
  asofStaleAge:      ["{n} sessions old", "{n} 个交易日前"],
  // The t-1 law chip — always visible beside the asof chip.
  oiTimingChip:      ["OI = t-1", "OI = t-1"],
  oiTimingTip: [
    "Open interest is reported one session in arrears: the value dated {date} represents positions as of the prior session's close. Intraday open interest does not exist.",
    "未平仓合约数据滞后一个交易日申报：标注 {date} 的数值代表上一交易日收盘时的持仓。不存在盘中未平仓数据。",
  ],
  loading:           ["Loading open-interest data…", "加载未平仓数据中…"],
  errorLoad:         ["Could not load open-interest data", "无法加载未平仓数据"],
  emptyTitle:        ["No open-interest snapshot for this name yet", "该品种暂无未平仓快照"],
  emptyWhy: [
    "{sym} isn't in this nightly build — index anchors and the most liquid single names publish first.",
    "本次夜间构建中没有 {sym} — 指数锚定品种与流动性最高的个股优先发布。",
  ],
  // Shared per-panel provenance footer — the t-1 law rides on EVERY panel.
  provenance: [
    "options_hub · nightly EOD · OI is the prior session's report (t‑1)",
    "options_hub · 每晚收盘数据 · 未平仓为上一交易日申报 (t‑1)",
  ],

  // ── OI by strike ───────────────────────────────────────────────────────────
  ladderTitle:       ["OI by strike", "按行权价未平仓"],
  ladderWindowChip:  ["±20% of spot · top {n} of {full}", "现价±20% · 前 {n} / 共 {full}"],
  ladderEmptyTitle:  ["No strike ladder for this name yet", "该品种暂无行权价分布数据"],
  ladderEmptyWhy: [
    "The nightly build publishes the OI ladder only for covered names.",
    "夜间构建仅为已覆盖品种发布未平仓分布。",
  ],
  ladderAria:        ["Call and put open interest per strike", "各行权价的认购与认沽未平仓"],
  legCalls:          ["Calls", "认购"],
  legPuts:           ["Puts", "认沽"],
  spotLabel:         ["spot", "现价"],

  // ── OI by expiration ───────────────────────────────────────────────────────
  expiryTitle:       ["OI by expiration", "按到期日未平仓"],
  expiryEmptyTitle:  ["No per-expiration OI for this name yet", "该品种暂无按到期日未平仓数据"],
  expiryEmptyWhy: [
    "The nightly build publishes per-expiration OI only for covered names.",
    "夜间构建仅为已覆盖品种发布按到期日的未平仓。",
  ],
  expiryAria:        ["Call and put open interest per expiration", "各到期日的认购与认沽未平仓"],
  expiryCapNote:     ["nearest {n} of {full} expirations", "最近 {n} 个到期日 / 共 {full} 个"],

  // ── OI / Time ──────────────────────────────────────────────────────────────
  timeTitle:         ["OI over time", "未平仓走势"],
  timeEmptyTitle:    ["Not enough OI history to draw yet", "未平仓历史数据不足，暂无法绘制"],
  timeEmptyWhy: [
    "The history line needs at least 10 sessions of total OI.",
    "历史曲线需要至少 10 个交易日的未平仓总量数据。",
  ],
  timeAria:          ["Total call and put open interest across recent sessions", "近期各交易日的认购与认沽未平仓总量"],
  timeWindowCaption: ["{n} sessions · since {date}", "{n} 个交易日 · 自 {date}"],

  // ── Max pain ───────────────────────────────────────────────────────────────
  maxPainTitle:      ["Max pain", "最大痛点"],
  maxPainEmptyTitle: ["No max-pain data for this name yet", "该品种暂无最大痛点数据"],
  maxPainEmptyWhy: [
    "The nightly build publishes the intrinsic-value curve only for the nearest expirations of covered names.",
    "夜间构建仅为已覆盖品种的近月到期发布内在价值曲线。",
  ],
  maxPainAria:       ["Intrinsic value paid out by option writers per candidate settle strike", "各候选结算价下期权卖方需支付的内在价值"],
  maxPainExpAria:    ["Max pain expiration", "最大痛点到期日"],
  maxPainStrike:     ["max pain {k}", "最大痛点 {k}"],
  maxPainVsSpot:     ["max pain {k} · spot {s}", "最大痛点 {k} · 现价 {s}"],
  legTotalValue:     ["Total value", "总价值"],
  legCallValue:      ["Call value", "认购价值"],
  legPutValue:       ["Put value", "认沽价值"],
  valueAxis:         ["$mn", "百万美元"],
  // Descriptive-not-forecast disclosure (aria on the strike chip).
  maxPainNote: [
    "Max pain is the settle strike minimizing writers' intrinsic payout from t-1 open interest — a descriptive minimization, not a price forecast.",
    "最大痛点是使期权卖方内在支付最小化的结算价（基于 t-1 未平仓）— 仅为描述性计算，并非价格预测。",
  ],

  // ── Max pain by expiration ─────────────────────────────────────────────────
  maxPainTimeTitle:  ["Max pain by expiration", "各到期日最大痛点"],
  maxPainTimeEmptyTitle: ["No per-expiration max pain yet", "暂无按到期日的最大痛点数据"],
  maxPainTimeEmptyWhy: [
    "The nightly build computes max pain per upcoming expiration only for covered names.",
    "夜间构建仅为已覆盖品种计算各到期日的最大痛点。",
  ],
  maxPainTimeAria:   ["Max-pain strike per upcoming expiration", "各到期日的最大痛点行权价"],

  // ── OI change ──────────────────────────────────────────────────────────────
  changeTitle:       ["OI change", "未平仓变动"],
  changeScopeRoot:   ["This root", "本标的"],
  changeScopeAll:    ["All roots", "全部标的"],
  changeScopeAria:   ["Open-interest change scope", "未平仓变动范围"],
  changePrevCaption: ["vs {date}", "对比 {date}"],
  changeEmptyTitle:  ["No OI changes to show", "暂无未平仓变动"],
  changeEmptyWhy: [
    "Either this name isn't in the nightly build yet, or the prior session's report is identical (unchanged OPRA vintage).",
    "该品种尚未进入夜间构建，或上一交易日申报数据完全相同（OPRA 数据未更新）。",
  ],
  changeUnchangedNote: [
    "No contract-level OI change vs the previous session — possibly an unchanged OPRA vintage.",
    "与上一交易日相比无合约级未平仓变动 — 可能为 OPRA 数据未更新。",
  ],
  thContract:        ["Contract", "合约"],
  thRoot:            ["Root", "标的"],
  thOi:              ["OI", "未平仓"],
  thPrev:            ["Prev", "前值"],
  thDelta:           ["Δ OI", "Δ 未平仓"],
  thDeltaPct:        ["Δ%", "Δ%"],
  thMid:             ["Mid", "中间价"],
  thDte:             ["DTE", "剩余天数"],
  newContract:       ["new", "新增"],
  sortAria:          ["Sort by {col}", "按{col}排序"],
} as const;

type StructureKey = keyof typeof STRUCTURE_LEX;

export function getStructureStr(lang: Lang, key: StructureKey): string {
  const entry = STRUCTURE_LEX[key as keyof typeof STRUCTURE_LEX];
  if (!entry) return "";
  return lang === "zh" ? entry[1] : entry[0];
}

export function makeStructureT(lang: Lang): (key: StructureKey) => string {
  return (key: StructureKey) => getStructureStr(lang, key);
}

export type { StructureKey };
