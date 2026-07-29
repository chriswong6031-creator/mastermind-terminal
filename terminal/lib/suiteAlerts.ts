// suiteAlerts.ts — canonical PURE evaluator + catalog for the suite-event alert family.
//
// NO I/O. This file is the single source of truth for BOTH the browser (AlertsView
// condition builder / creation preview) AND the Node firing sidecar
// (ingest/suite_alerts.ts, bundled to ingest/dist/suite_alerts.mjs). The sidecar does
// ZERO algorithm duplication: it runs the real suite modules via computeSuite() and
// hands their SuiteEvent stream to evalSuiteEvent() below.
//
// Contract for the evaluator (mirrors ingest/alerts_engine.py one-shot semantics):
//   fired === true  → the condition is met; the engine applies the one-shot disarm
//                     (active=false + condition.triggered stamp).
//   fired === false → armed, not met. There is no null tri-state here — "cannot
//                     evaluate" (missing bars / unknown suite) is the CALLER's skip,
//                     decided before events are ever computed.
//
// Fresh-only law: an alert must never fire off old history on its first evaluation.
// Two gates enforce it, both required:
//   1. the matching event's bar time must be > floorT (caller passes the alert's
//      created_at epoch) and > cond._se.lastFiredT (the per-condition fire stamp);
//   2. the event must sit on one of the last SUITE_EVENT_FRESH_BARS bars of the
//      series — a months-old BOS that happens to postdate creation of a stale-data
//      symbol still cannot fire.
//
// Determinism: pure functions of their inputs — no Date.now(), no randomness.

import type { SuiteEvent } from "./indicator-canvas/types";

// ─────────────────────────────────────────────────────────────────── curated catalog

export interface SuiteAlertEventDef {
  event: string;                      // SuiteEvent.type emitted by the owning module
  suite: string;                      // suite key in lib/suites/registry.ts
  module: string;                     // owning module key within the suite
  tier: "free" | "insider" | "pro";   // the OWNING module's tier (verified vs registry)
  dirs: boolean;                      // event carries a bull/bear direction (dir filter valid)
  strength: boolean;                  // event carries a 0..100 strength (minStrength valid)
  tkey: string;                       // LEX key for the localized event name
  en: string;                         // English event name
}

/**
 * The curated, alertable subset of the suite event stream. NOT every SuiteEvent type
 * is here on purpose — chatty types (ob_created, fvg_created, liq_created, rsi_mid_cross,
 * pulse_dip, macdx_phase, …) stay chart-only. Tiers are copied from each owning module's
 * registry definition; the alerts POST route must vet a condition's event tier against
 * the creating user's entitlement.
 */
export const SUITE_ALERT_EVENTS: SuiteAlertEventDef[] = [
  // Structure Core
  { event: "bos",             suite: "structure", module: "ms",   tier: "insider", dirs: true, strength: false, tkey: "suiteEvBos",           en: "Break of structure (BOS)" },
  { event: "choch",           suite: "structure", module: "ms",   tier: "insider", dirs: true, strength: false, tkey: "suiteEvChoch",         en: "Change of character (CHoCH)" },
  { event: "cisd",            suite: "structure", module: "ms",   tier: "insider", dirs: true, strength: false, tkey: "suiteEvCisd",          en: "CISD (failed delivery)" },
  { event: "ob_touch",        suite: "structure", module: "ob",   tier: "pro",     dirs: true, strength: true,  tkey: "suiteEvObTouch",       en: "Order block touch" },
  { event: "ob_break",        suite: "structure", module: "ob",   tier: "pro",     dirs: true, strength: true,  tkey: "suiteEvObBreak",       en: "Order block break" },
  { event: "fvg_retest",      suite: "structure", module: "fvg",  tier: "insider", dirs: true, strength: true,  tkey: "suiteEvFvgRetest",     en: "Fair value gap retest" },
  { event: "ifvg",            suite: "structure", module: "fvg",  tier: "insider", dirs: true, strength: true,  tkey: "suiteEvIfvg",          en: "Inverted FVG" },
  { event: "liq_grab",        suite: "structure", module: "liq",  tier: "pro",     dirs: true, strength: true,  tkey: "suiteEvLiqGrab",       en: "Liquidity grab" },
  { event: "sfp",             suite: "structure", module: "sfp",  tier: "pro",     dirs: true, strength: true,  tkey: "suiteEvSfp",           en: "Swing failure pattern (SFP)" },
  { event: "pd_golden_touch", suite: "structure", module: "pd",   tier: "insider", dirs: true, strength: true,  tkey: "suiteEvPdGoldenTouch", en: "Golden zone touch" },
  // Trend Waves
  { event: "te_flip",         suite: "trend",     module: "te",   tier: "insider", dirs: true, strength: true,  tkey: "suiteEvTeFlip",        en: "Trend Engine flip" },
  { event: "te_power",        suite: "trend",     module: "te",   tier: "insider", dirs: true, strength: true,  tkey: "suiteEvTePower",       en: "Trend Engine power move" },
  { event: "te_tp_hit",       suite: "trend",     module: "te",   tier: "insider", dirs: true, strength: true,  tkey: "suiteEvTeTpHit",       en: "Trend Engine take-profit hit" },
  { event: "fb_turn",         suite: "trend",     module: "fb",   tier: "insider", dirs: true, strength: true,  tkey: "suiteEvFbTurn",        en: "Flow Band turn" },
  { event: "vb_retest",       suite: "trend",     module: "vb",   tier: "insider", dirs: true, strength: true,  tkey: "suiteEvVbRetest",      en: "Voltix band retest" },
  // Pulse Oscillator
  { event: "pulse_buy",       suite: "pulse",     module: "sig",  tier: "insider", dirs: true, strength: true,  tkey: "suiteEvPulseBuy",      en: "Pulse buy signal" },
  { event: "pulse_sell",      suite: "pulse",     module: "sig",  tier: "insider", dirs: true, strength: true,  tkey: "suiteEvPulseSell",     en: "Pulse sell signal" },
  { event: "pulse_div",       suite: "pulse",     module: "div",  tier: "pro",     dirs: true, strength: true,  tkey: "suiteEvPulseDiv",      en: "Pulse divergence" },
  // RSI Ultimate
  { event: "rsix_reversal",   suite: "rsix",      module: "sig",  tier: "insider", dirs: true, strength: true,  tkey: "suiteEvRsixReversal",  en: "RSI reversal signal" },
  { event: "rsix_div",        suite: "rsix",      module: "div",  tier: "pro",     dirs: true, strength: true,  tkey: "suiteEvRsixDiv",       en: "RSI divergence" },
  { event: "rsix_chan_break", suite: "rsix",      module: "chan", tier: "pro",     dirs: true, strength: true,  tkey: "suiteEvRsixChanBreak", en: "RSI channel break" },
  // MACD Ultimate
  { event: "macdx_signal",    suite: "macdx",     module: "sig",  tier: "insider", dirs: true, strength: true,  tkey: "suiteEvMacdxSignal",   en: "MACD cross signal" },
  { event: "macdx_div",       suite: "macdx",     module: "div",  tier: "pro",     dirs: true, strength: true,  tkey: "suiteEvMacdxDiv",      en: "MACD divergence" },
  { event: "macdx_hist_flip", suite: "macdx",     module: "hist", tier: "insider", dirs: true, strength: true,  tkey: "suiteEvMacdxHistFlip", en: "MACD histogram flip" },
];

/** zh display names for suiteAlertPreview (the catalog stays UI-framework-free; LEX
 *  integration uses tkey — these are the same strings the LEX entries should carry). */
const ZH_EVENT_NAMES: Record<string, string> = {
  bos: "结构突破 (BOS)",
  choch: "结构反转 (CHoCH)",
  cisd: "CISD（失败交付）",
  ob_touch: "订单块触及",
  ob_break: "订单块破位",
  fvg_retest: "公允价值缺口回补",
  ifvg: "反转缺口 (iFVG)",
  liq_grab: "流动性掠夺",
  sfp: "摆动失败形态 (SFP)",
  pd_golden_touch: "黄金区触及",
  te_flip: "趋势引擎翻转",
  te_power: "趋势引擎强动能",
  te_tp_hit: "趋势引擎止盈触达",
  te_sl_hit: "趋势引擎止损触发",
  fb_turn: "流向带转向",
  vb_retest: "波动带回测",
  pulse_buy: "脉冲买入信号",
  pulse_sell: "脉冲卖出信号",
  pulse_div: "脉冲背离",
  rsix_reversal: "RSI 反转信号",
  rsix_div: "RSI 背离",
  rsix_chan_break: "RSI 通道突破",
  macdx_signal: "MACD 交叉信号",
  macdx_div: "MACD 背离",
  macdx_hist_flip: "MACD 柱状图翻转",
};

const EVENT_BY_TYPE: Map<string, SuiteAlertEventDef> = new Map(
  SUITE_ALERT_EVENTS.map((d) => [d.event, d]),
);

export function suiteAlertEventDef(event: string): SuiteAlertEventDef | null {
  return EVENT_BY_TYPE.get(event) ?? null;
}

// ─────────────────────────────────────────────────────────────────────── condition

export type SuiteAlertCondition = {
  type: "suite_event";
  suite: string;
  event: string;
  dir?: "bull" | "bear";
  minStrength?: number;                 // 0..100; only valid for strength-scored events
  _se?: { lastFiredT?: number };        // engine state (epoch secs of the last fire)
};

/** How many trailing bars count as "fresh" — an event older than this never fires. */
export const SUITE_EVENT_FRESH_BARS = 3;

const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

/**
 * Structural + catalog validation. Returns a human-readable reason string when the
 * condition is invalid, or null when it is well-formed. Tier vetting is NOT done here
 * (the catalog exposes each event's tier; the POST route owns the entitlement check).
 */
export function validateSuiteCondition(cond: unknown): string | null {
  if (!cond || typeof cond !== "object") return "condition is not an object";
  const c = cond as Record<string, unknown>;
  if (c.type !== "suite_event") return `condition type is ${JSON.stringify(c.type)}, not "suite_event"`;
  if (typeof c.event !== "string" || !c.event) return "missing event";
  const def = EVENT_BY_TYPE.get(c.event);
  if (!def) return `unknown suite event "${c.event}"`;
  if (typeof c.suite !== "string" || !c.suite) return "missing suite";
  if (c.suite !== def.suite) return `event "${def.event}" belongs to suite "${def.suite}", not "${c.suite}"`;
  if (c.dir !== undefined) {
    if (c.dir !== "bull" && c.dir !== "bear") return `dir must be "bull" or "bear", got ${JSON.stringify(c.dir)}`;
    if (!def.dirs) return `event "${def.event}" carries no direction`;
  }
  if (c.minStrength !== undefined) {
    if (!isNum(c.minStrength) || c.minStrength < 0 || c.minStrength > 100) {
      return `minStrength must be a number in 0..100, got ${JSON.stringify(c.minStrength)}`;
    }
    if (!def.strength) return `event "${def.event}" carries no strength score`;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────── evaluator

export interface SuiteEventEvalResult {
  fired: boolean;
  value?: number;                       // strength for scored events, else the event price
  note?: string;                        // symbol-agnostic one-liner (the cron prefixes the symbol)
  state?: { lastFiredT: number };       // present ONLY on fire — the caller persists it on _se
}

/** "YYYY-MM-DD" (plus " HH:MM" when the epoch has an intraday component), UTC. Pure. */
function stampOf(epochSec: number): string {
  const d = new Date(epochSec * 1000);
  const iso = d.toISOString();
  return epochSec % 86400 === 0 ? iso.slice(0, 10) : `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
}

/**
 * Evaluate a suite_event condition against a module's SuiteEvent stream.
 *
 * @param events the OWNING suite's merged event stream from computeSuite()
 * @param barsT  epoch seconds per bar index — events address bars by index (events[i].i)
 * @param floorT hard time floor in epoch secs (the alert's created_at). Events at or
 *               before max(floorT, cond._se.lastFiredT) never fire — this is what makes
 *               the first evaluation of a new alert silent over old history.
 *
 * Fires on the NEWEST matching event that clears BOTH the floor and the
 * SUITE_EVENT_FRESH_BARS freshness window. false is "armed, not met"; the caller
 * decides "cannot evaluate" (missing bars / broken suite) before calling.
 */
/** Floor an epoch-seconds timestamp to 00:00 UTC of its calendar day, minus 1s — daily bars carry
 *  UTC-midnight keys, so an alert created intraday on day D must still see day-D events (mirrors the
 *  Python engine's created_at[:10] date-granular comparison). */
export function floorToUtcDayStart(epochSec: number): number {
  const d = new Date(epochSec * 1000);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 1000 - 1;
}

export function evalSuiteEvent(
  cond: SuiteAlertCondition,
  events: SuiteEvent[],
  barsT: number[],
  floorT: number,
): SuiteEventEvalResult {
  const def = EVENT_BY_TYPE.get(cond?.event ?? "");
  if (!def || !Array.isArray(events) || !Array.isArray(barsT) || barsT.length === 0) {
    return { fired: false };
  }
  const lastFired = isNum(cond._se?.lastFiredT) ? (cond._se!.lastFiredT as number) : -Infinity;
  const floor = Math.max(isNum(floorT) ? floorT : -Infinity, lastFired);
  const freshFrom = Math.max(0, barsT.length - SUITE_EVENT_FRESH_BARS);

  let best: SuiteEvent | null = null;
  let bestT = -Infinity;
  for (const e of events) {
    if (!e || e.type !== cond.event) continue;
    if (cond.dir !== undefined && e.dir !== cond.dir) continue;
    if (cond.minStrength !== undefined && !(isNum(e.strength) && e.strength >= cond.minStrength)) continue;
    const i = e.i;
    if (!Number.isInteger(i) || i < 0 || i >= barsT.length) continue;
    if (i < freshFrom) continue;                 // fresh-only: last N bars
    const t = barsT[i];
    if (!isNum(t) || t <= floor) continue;       // never re-fire, never fire pre-creation history
    if (t >= bestT) { best = e; bestT = t; }     // >= : same-bar ties → the later-emitted event wins
  }
  if (!best) return { fired: false };

  const value = def.strength && isNum(best.strength) ? Math.round(best.strength) : isNum(best.p) ? best.p : undefined;
  const dirWord = best.dir === "bull" ? " (bullish)" : best.dir === "bear" ? " (bearish)" : "";
  const strWord = def.strength && isNum(best.strength) ? `, strength ${Math.round(best.strength)}` : "";
  const note = `${def.en}${dirWord}${strWord} on ${stampOf(bestT)} — ${def.suite} suite, daily bars, module defaults`;
  return { fired: true, value, note, state: { lastFiredT: bestT } };
}

// ─────────────────────────────────────────────────────────── creation preview (UI)

/**
 * Plain-word "what will fire" line for the creation preview, mirroring
 * optAlertPreview in lib/optionsAlerts.ts. Symbol-agnostic (the alert row carries
 * the symbol); honest about the evaluation basis (daily bars, module defaults).
 */
export function suiteAlertPreview(cond: SuiteAlertCondition, lang: "en" | "zh"): string {
  const def = EVENT_BY_TYPE.get(cond?.event ?? "");
  const zh = lang === "zh";
  if (!def) return zh ? "未知的套件事件" : "Unknown suite event";
  const minS = isNum(cond.minStrength) ? cond.minStrength : undefined;
  if (zh) {
    const name = ZH_EVENT_NAMES[def.event] || def.en;
    const dirTxt = cond.dir === "bull" ? "（看涨）" : cond.dir === "bear" ? "（看跌）" : "";
    const strTxt = minS !== undefined ? `且强度 ≥ ${minS} ` : "";
    return `当日线图出现${name}${dirTxt}${strTxt}时提醒我（按模块默认参数评估）`;
  }
  const dirTxt = cond.dir === "bull" ? " bullish" : cond.dir === "bear" ? " bearish" : "";
  const strTxt = minS !== undefined ? ` at strength ≥ ${minS}` : "";
  return `Alert me on a${dirTxt} ${def.en}${strTxt} on the daily chart (module defaults)`;
}
