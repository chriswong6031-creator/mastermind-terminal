export type WatchlistSymbolRow = { symbol: string; section: string };

type SelectionInput = {
  current: ReadonlySet<string>;
  anchor: string | null;
  target: string;
  visualOrder: readonly string[];
  range: boolean;
  toggle: boolean;
};

/**
 * Resolve one pointer/keyboard selection gesture against the order users can see.
 * Plain clicks intentionally clear bulk selection; Terminal uses them for chart navigation.
 */
export function resolveWatchlistSelection({
  current,
  anchor,
  target,
  visualOrder,
  range,
  toggle,
}: SelectionInput): Set<string> {
  if (range) {
    const from = anchor ? visualOrder.indexOf(anchor) : -1;
    const to = visualOrder.indexOf(target);
    const span = from >= 0 && to >= 0
      ? visualOrder.slice(Math.min(from, to), Math.max(from, to) + 1)
      : [target];
    return toggle ? new Set([...current, ...span]) : new Set(span);
  }
  if (toggle) {
    const next = new Set(current);
    if (next.has(target)) next.delete(target);
    else next.add(target);
    return next;
  }
  return new Set();
}

/** Right-click keeps an existing multi-selection, or targets only the clicked row. */
export function resolveWatchlistContextSelection(
  current: ReadonlySet<string>,
  target: string,
): Set<string> {
  return current.has(target) ? new Set(current) : new Set([target]);
}

/** Keep selection state honest after a row mutation or list switch. */
export function pruneWatchlistSelection(
  current: ReadonlySet<string>,
  rows: readonly WatchlistSymbolRow[],
): Set<string> {
  const live = new Set(rows.map((row) => row.symbol));
  return new Set([...current].filter((symbol) => live.has(symbol)));
}

/**
 * Re-file selected symbols and append them to the target section in current visual order.
 * Unselected symbols retain their relative order.
 */
export function moveWatchlistSelection(
  rows: readonly WatchlistSymbolRow[],
  selected: ReadonlySet<string>,
  targetSection: string,
  visualOrder: readonly string[],
): WatchlistSymbolRow[] {
  const bySymbol = new Map(rows.map((row) => [row.symbol, row]));
  const moved = visualOrder
    .filter((symbol) => selected.has(symbol))
    .map((symbol) => bySymbol.get(symbol))
    .filter((row): row is WatchlistSymbolRow => !!row)
    .map((row) => ({ ...row, section: targetSection }));
  if (!moved.length) return [...rows];

  const rest = rows.filter((row) => !selected.has(row.symbol));
  const lastTarget = rest.map((row) => row.section).lastIndexOf(targetSection);
  rest.splice(lastTarget + 1, 0, ...moved);
  return rest;
}

/** Return cloned selected rows in the exact section-grouped order shown on screen. */
export function copyWatchlistSelection(
  rows: readonly WatchlistSymbolRow[],
  selected: ReadonlySet<string>,
  visualOrder: readonly string[],
): WatchlistSymbolRow[] {
  const bySymbol = new Map(rows.map((row) => [row.symbol, row]));
  return visualOrder
    .filter((symbol) => selected.has(symbol))
    .map((symbol) => bySymbol.get(symbol))
    .filter((row): row is WatchlistSymbolRow => !!row)
    .map((row) => ({ ...row }));
}
