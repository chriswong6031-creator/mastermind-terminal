// Premium suite registry — parallel to lib/indicators.ts IND_DEFS (which stays untouched for the
// classic built-ins). A suite is ONE picker entry whose modules toggle inside Settings.
// Contract: lib/indicator-canvas/types.ts. Program docs: docs/PREMIUM_INDICATOR_SUITE_MASTERPLAN_*.
//
// mm.inds carries suite keys alongside classic IndKeys (TerminalShell's Set<string> is already
// generic); per-suite params live in indParams[suiteKey] as flat "<moduleKey>.<field>" entries
// plus "<moduleKey>.on" master toggles (see indicator-canvas/host.ts).

import type { SuiteDef } from "@/lib/indicator-canvas/types";
import { MARKET_STRUCTURE_MODULE } from "./structure/marketStructure";
import { ORDER_BLOCKS_MODULE } from "./structure/orderBlocks";
import { FVG_MODULE } from "./structure/fvg";

export const STRUCTURE_SUITE: SuiteDef = {
  key: "structure",
  label: "Structure Core",
  tag: "SC",
  tkey: "suiteStructure",
  kind: "overlay",
  modules: [MARKET_STRUCTURE_MODULE, ORDER_BLOCKS_MODULE, FVG_MODULE],
};

export const SUITE_DEFS: Record<string, SuiteDef> = {
  structure: STRUCTURE_SUITE,
};

export const SUITE_ORDER = ["structure"] as const;

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
