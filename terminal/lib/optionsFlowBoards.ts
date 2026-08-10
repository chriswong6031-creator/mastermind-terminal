/**
 * Pure selectors for the R5 0DTE and largest-event Flow boards.
 *
 * `live_flow.feed/v1` rows are contract-level aggregates from one poll batch,
 * not guaranteed individual trades. These transforms therefore preserve the
 * publisher's event vocabulary and order only by fields already on the immutable
 * display feed. They do not infer NBBO tiers, P&L, opening/closing intent, scores,
 * execution authority, or trade recommendations.
 */

export type OptionsFlowBoardMode = "zero_dte" | "largest";
export type OptionsFlowBoardRight = "" | "C" | "P";
export type OptionsFlowBoardSide = "" | "~buy" | "~sell" | "mixed";

export interface OptionsFlowBoardSource {
  id: string;
  ts: string;
  root: string;
  right: "C" | "P";
  premium: number;
  size: number;
  n_prints: number;
  side: "~buy" | "~sell" | "mixed";
  zerodte: boolean;
}

export interface OptionsFlowBoardFilter {
  rootQuery: string;
  right: OptionsFlowBoardRight;
  side: OptionsFlowBoardSide;
}

export interface OptionsFlowBoardSummary {
  eventCount: number;
  printCount: number;
  contractCount: number;
  rootCount: number;
  grossPremium: number;
  callPremium: number;
  putPremium: number;
  callPremiumShare: number | null;
}

function eventTimestamp(event: OptionsFlowBoardSource): number {
  const parsed = Date.parse(event.ts);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Select the complete matching collection and order it by event premium.
 * The returned array is new; the publisher-owned input remains untouched.
 */
export function selectOptionsFlowBoardRows<T extends OptionsFlowBoardSource>(
  events: readonly T[],
  mode: OptionsFlowBoardMode,
  filter: OptionsFlowBoardFilter,
): T[] {
  const rootQuery = filter.rootQuery.trim().toUpperCase();

  return events
    .filter((event) => {
      if (mode === "zero_dte" && !event.zerodte) return false;
      if (rootQuery && !event.root.toUpperCase().includes(rootQuery)) return false;
      if (filter.right && event.right !== filter.right) return false;
      if (filter.side && event.side !== filter.side) return false;
      return true;
    })
    .sort((a, b) => {
      const byPremium = b.premium - a.premium;
      if (byPremium !== 0) return byPremium;
      const byTime = eventTimestamp(b) - eventTimestamp(a);
      if (byTime !== 0) return byTime;
      return a.id.localeCompare(b.id);
    });
}

/** Exact additive receipts for the currently selected event collection. */
export function summarizeOptionsFlowBoard(
  events: readonly OptionsFlowBoardSource[],
): OptionsFlowBoardSummary {
  const roots = new Set<string>();
  let printCount = 0;
  let contractCount = 0;
  let grossPremium = 0;
  let callPremium = 0;
  let putPremium = 0;

  for (const event of events) {
    roots.add(event.root);
    printCount += event.n_prints;
    contractCount += event.size;
    grossPremium += event.premium;
    if (event.right === "C") callPremium += event.premium;
    else putPremium += event.premium;
  }

  return {
    eventCount: events.length,
    printCount,
    contractCount,
    rootCount: roots.size,
    grossPremium,
    callPremium,
    putPremium,
    callPremiumShare: grossPremium > 0 ? callPremium / grossPremium : null,
  };
}
