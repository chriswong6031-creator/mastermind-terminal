/**
 * surfaceStrings.ts — bilingual EN/ZH strings for the Surface + Session panes.
 * Pattern matches gexStrings.ts (each key → [English, 中文]; makeSurfaceT(lang)).
 *
 * HONESTY DOCTRINE (display-tier wording only):
 *   - The surface is a PREMIUM-FLOW field materialized from OPRA per-strike flow.
 *     Cadence is shown verbatim from the snapshot store — never claim 1-min if it's 10-min.
 *   - Greek surfaces (gamma/vanna/charm) are NOT built yet → shown disabled-with-tooltip
 *     ("accruing — ships with the greeks snapshotter"), never faked.
 *   - No "validated" / "predictive" / directional-signal language.
 *   - translated strings MUST NOT appear in HTML title= attributes (CI-guarded) — use
 *     aria-label / visible spans.
 */

import type { Lang } from "@/lib/i18n";

const SURFACE_LEX = {
  // ── Tab / pane header ───────────────────────────────────────────────────────
  surfaceTab: ["Surface", "曲面"],
  surfaceTitle: ["Flow Surface", "资金流曲面"],
  surfaceSubtitle: ["Premium flow painted by strike & time", "按行权价与时间绘制的权利金资金流"],

  // ── Metric tabs (Net Prem live; greeks accruing) ────────────────────────────
  metricNetPrem: ["Net Prem", "净权利金"],
  metricGamma: ["Gamma", "伽马"],
  metricVanna: ["Vanna", "Vanna"],
  metricCharm: ["Charm", "Charm"],
  metricAccruing: [
    "accruing — ships with the greeks snapshotter",
    "累积中 — 将随希腊值快照器上线",
  ],
  metricLensAria: ["Surface metric", "曲面指标"],

  // ── Aggregation ─────────────────────────────────────────────────────────────
  aggAria: ["Aggregation", "聚合"],
  agg1m: ["1m", "1分"],
  agg5m: ["5m", "5分"],
  agg15m: ["15m", "15分"],
  agg30m: ["30m", "30分"],

  // ── Controls ────────────────────────────────────────────────────────────────
  opacity: ["Opacity", "不透明度"],
  range: ["Range", "范围"],
  rangeAll: ["All", "全部"],
  strikeRangeAria: ["Strike range", "行权价范围"],
  opacityAria: ["Field opacity", "曲面不透明度"],

  // ── Crosshair readout pill ──────────────────────────────────────────────────
  strike: ["Strike", "行权价"],

  // ── Legend / stamps ─────────────────────────────────────────────────────────
  legendPos: ["inflow", "流入"],
  legendNeg: ["outflow", "流出"],
  asOf: ["as of", "更新于"],
  cadenceLabel: ["cadence", "频率"],
  sessionLabel: ["session", "交易日"],

  // ── Empty / loading ─────────────────────────────────────────────────────────
  surfaceEmpty: ["No surface data yet — accruing.", "暂无曲面数据 — 累积中。"],
  surfaceLoading: ["Loading surface…", "加载曲面中…"],
  noFrame: ["No frame for this time.", "该时间点暂无数据。"],

  // ── Replay bar ──────────────────────────────────────────────────────────────
  replayFirst: ["First frame", "首帧"],
  replayPrev: ["Previous frame", "上一帧"],
  replayPlay: ["Play", "播放"],
  replayPause: ["Pause", "暂停"],
  replayNext: ["Next frame", "下一帧"],
  replayLast: ["Latest frame", "最新帧"],
  replaySpeedAria: ["Playback speed", "播放速度"],
  replayScrubAria: ["Scrub to frame", "拖动到指定帧"],
  replayLive: ["LIVE", "实时"],
  replayFrameOf: ["frame", "帧"],
  replayNoFrames: ["No frames — accruing.", "暂无帧 — 累积中。"],

  // ── Data honesty note ───────────────────────────────────────────────────────
  surfaceNote: [
    "Premium-flow field from OPRA per-strike flow. Display-only; cadence is the store's true cadence — the field is not resampled finer than the data.",
    "基于 OPRA 逐行权价资金流的权利金场。仅供展示；显示频率为存储的真实频率——不会对数据进行更细粒度的重采样。",
  ],

  // ── Session Flow pane ───────────────────────────────────────────────────────
  sessionTab: ["Session", "盘中"],
  sessionTitle: ["Session Flow", "盘中资金流"],
  sessionCP: ["C+P", "认购+认沽"],
  sessionCalls: ["Calls", "认购"],
  sessionPuts: ["Puts", "认沽"],
  sessionCumulative: ["cumulative", "累计"],
  sessionPerMin: ["per-min", "每分钟"],
  sessionOffOpen: ["off open", "自开盘"],
  sessionFill: ["Fill", "填充"],
  sessionAbsolute: ["absolute", "绝对值"],
  sessionModeAria: ["Series mode", "序列模式"],
  sessionSideAria: ["Side", "方向"],
  sessionCallsChip: ["CALLS", "认购"],
  sessionPutsChip: ["PUTS", "认沽"],
  sessionFootnote: ["RTH premium since 9:30 ET", "自美东9:30起的常规时段权利金"],
  sessionPts: ["pts", "点"],
  sessionEmpty: ["No session flow yet — accruing.", "暂无盘中资金流 — 累积中。"],
  sessionOffOpenNote: ["Δ since 9:30 ET open", "自美东9:30开盘以来的变化"],

  // ── Strike hover popover + Intraday-Evolution modal (Wave 2E, RECON §4.2) ────
  popFromSpot: ["from spot", "距现价"],
  popClickHint: ["Click for evolution", "点击查看盘中演变"],
  evoTitle: ["Intraday Evolution", "盘中演变"],
  evoStrike: ["strike", "行权价"],
  evoClose: ["Close", "关闭"],
  evoCloseAria: ["Close (Esc)", "关闭（Esc）"],
  evoEscHint: ["Press Esc to close", "按 Esc 关闭"],
  evoSnapshots: ["snapshots", "快照"],
  evoSpot: ["Spot", "现价"],
  evoNow: ["NOW", "当前"],
  evoExpiryBreakdown: ["Expiry breakdown at NOW", "当前各到期日拆解"],
  evoNoSeries: ["No evolution for this strike yet.", "该行权价暂无演变数据。"],
  evoMetricAt: ["at this strike", "在该行权价"],

  // ── B4: point-in-time honesty for the expiry breakdown ──────────────────────
  // The per-expiry matrix is a single head-of-day fetch, so it describes the PRESENT,
  // not the scrubbed moment. Replayed → say so instead of mislabelling it "at NOW".
  evoExpiryReplayTitle: ["Expiry breakdown", "各到期日拆解"],
  evoExpiryReplayNote: [
    "Only available live — the per-expiry split is not stored for past moments in this session.",
    "仅在实时状态下可用 — 本交易日的历史时点未保存各到期日拆解数据。",
  ],
  evoReplayBadge: ["replay", "回放"],
  evoLiveBadge: ["live", "实时"],

  // ── Send-to-chart: pin a strike as a price level ────────────────────────────
  pinToChart: ["Pin to chart", "钉在图上"],
  pinnedUnpin: ["Unpin", "取消固定"],
  pinnedLabel: ["Pinned", "已固定"],
  pinnedClearAll: ["Clear all", "全部清除"],
  pinnedAria: ["Pinned strike levels", "已固定的行权价水平"],
  pinnedRemoveAria: ["Remove pinned level", "移除已固定水平"],
  pinnedSessionNote: ["Pins last for this session only", "固定项仅在本次会话内保留"],

  // ── Quad view ───────────────────────────────────────────────────────────────
  viewSingle: ["Single", "单图"],
  viewQuad: ["Quad", "四宫格"],
  viewAria: ["Field layout", "视图布局"],
  quadAria: ["Four synchronised metric fields", "四个同步指标曲面"],
  quadAccruing: ["accruing", "累积中"],
  quadSharedReplay: ["All four share one replay stamp", "四格共用同一回放时点"],

  // ── Style (theme) popover ───────────────────────────────────────────────────
  styleBtn: ["Style", "配色"],
  styleAria: ["Field colours", "曲面配色"],
  styleTitle: ["Field colours", "曲面配色"],
  stylePresets: ["Preset", "预设"],
  stylePerMetric: ["Per metric", "按指标"],
  stylePos: ["Inflow", "流入"],
  styleNeg: ["Outflow", "流出"],
  styleReset: ["Reset to theme", "恢复主题默认"],
  styleClose: ["Done", "完成"],
  presetDefault: ["Theme default", "主题默认"],
  presetColorblind: ["Colourblind-safe", "色盲友好"],
  presetMono: ["Monochrome heat", "单色热度"],
  presetClassic: ["Classic", "经典"],
  styleDefaultNote: [
    "Theme default follows the up/down colours, so it flips with the language convention.",
    "主题默认跟随涨跌色，因此会随语言习惯自动切换。",
  ],

  // ── Alert from the drill modal ──────────────────────────────────────────────
  alertAtStrike: ["Alert me at this strike", "在该行权价提醒我"],
  alertCreating: ["Creating…", "创建中…"],
  alertCreated: ["Alert created", "提醒已创建"],
  alertFailed: ["Could not create the alert", "无法创建提醒"],
  alertCrossesAbove: ["when price crosses above", "当价格上穿"],
  alertCrossesBelow: ["when price crosses below", "当价格下穿"],
  alertSignIn: ["Sign in to set alerts", "登录后可设置提醒"],
  alertSignInCta: ["Sign in", "登录"],
  alertManage: ["Manage alerts", "管理提醒"],

  // ── Root picker honesty ─────────────────────────────────────────────────────
  rootPickerAria: ["Surface root", "曲面标的"],
  rootAvailable: ["Available", "可用"],
  rootNoSurface: ["No surface for {sym} yet", "{sym} 暂无曲面数据"],
  rootNoSurfaceHint: [
    "The field is materialised for these roots only. Others are not built yet — nothing is hidden.",
    "目前仅为以下标的生成曲面数据，其余尚未构建 — 并非隐藏内容。",
  ],
} as const;

type SurfaceKey = keyof typeof SURFACE_LEX;

export function getSurfaceStr(lang: Lang, key: SurfaceKey): string {
  const entry = SURFACE_LEX[key];
  if (!entry) return "";
  return lang === "zh" ? entry[1] : entry[0];
}

export function makeSurfaceT(lang: Lang): (key: SurfaceKey) => string {
  return (key: SurfaceKey) => getSurfaceStr(lang, key);
}

export type { SurfaceKey };
