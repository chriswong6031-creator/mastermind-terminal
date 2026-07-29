// Premium suite registry — parallel to lib/indicators.ts IND_DEFS (which stays untouched for the
// classic built-ins). A suite is ONE picker entry whose modules toggle inside Settings.
// Contract: lib/indicator-canvas/types.ts. Program docs: docs/PREMIUM_INDICATOR_SUITE_MASTERPLAN_*.
//
// mm.inds carries suite keys alongside classic IndKeys (TerminalShell's Set<string> is already
// generic); per-suite params live in indParams[suiteKey] as flat "<moduleKey>.<field>" entries
// plus "<moduleKey>.on" master toggles (see indicator-canvas/host.ts).
//
// Guides: every module has bilingual docs at public/guides/<suiteKey>/<moduleKey>.<lang>.md,
// rendered by components/GuidePanel.tsx via the "?" button in the module's Settings header.

import type { SuiteDef } from "@/lib/indicator-canvas/types";
import { MARKET_STRUCTURE_MODULE } from "./structure/marketStructure";
import { ORDER_BLOCKS_MODULE } from "./structure/orderBlocks";
import { FVG_MODULE } from "./structure/fvg";
import { PREMIUM_DISCOUNT_MODULE } from "./structure/premiumDiscount";
import { LIQUIDITY_MODULE } from "./structure/liquidity";
import { SFP_MODULE } from "./structure/sfp";
import { TREND_ENGINE_MODULE } from "./trend/trendEngine";
import { VOLT_BANDS_MODULE } from "./trend/voltixBands";
import { CANDLE_PAINTER_MODULE } from "./trend/candlePainter";
import { FLOW_BAND_MODULE } from "./trend/flowBand";

export const STRUCTURE_SUITE: SuiteDef = {
  key: "structure",
  label: "Structure Core",
  tag: "SC",
  tkey: "suiteStructure",
  kind: "overlay",
  modules: [
    MARKET_STRUCTURE_MODULE,
    ORDER_BLOCKS_MODULE,
    FVG_MODULE,
    PREMIUM_DISCOUNT_MODULE,
    LIQUIDITY_MODULE,
    SFP_MODULE,
  ],
};

export const TREND_SUITE: SuiteDef = {
  key: "trend",
  label: "Trend Waves",
  tag: "TW",
  tkey: "suiteTrend",
  kind: "overlay",
  modules: [
    TREND_ENGINE_MODULE,
    FLOW_BAND_MODULE,
    VOLT_BANDS_MODULE,
    CANDLE_PAINTER_MODULE,
  ],
};

export const SUITE_DEFS: Record<string, SuiteDef> = {
  structure: STRUCTURE_SUITE,
  trend: TREND_SUITE,
};

export const SUITE_ORDER = ["structure", "trend"] as const;

export function isSuiteKey(k: string): boolean {
  return Object.prototype.hasOwnProperty.call(SUITE_DEFS, k);
}
export function getSuiteDef(k: string): SuiteDef | null {
  return SUITE_DEFS[k] ?? null;
}

/** Flat defaults blob for a suite (module-prefixed), used to seed/backfill indParams[suiteKey]. */
export function suiteDefaults(k: string): Record<string, any> {
  const def = SUITE_DEFS[k];
  if (!def) return {};
  const out: Record<string, any> = {};
  for (const m of def.modules) {
    out[`${m.key}.on`] = m.defaultOn;
    for (const [fk, fv] of Object.entries(m.defaults)) out[`${m.key}.${fk}`] = fv;
  }
  return out;
}
