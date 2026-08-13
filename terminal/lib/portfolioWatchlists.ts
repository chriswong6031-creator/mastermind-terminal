// UNWIRED SINCE W5 — read this before treating anything here as live behaviour.
//
// This module was the read model for `/portfolio`'s watchlist switcher: it reconciled the server's
// lists with local `mm.wls` so the page could show watchlist symbols as a "Conviction Book". W5
// removed that switcher — `/portfolio` renders `portfolio_positions` and no watchlist at all — so
// NO page, component or route imports this file any more. Its only remaining consumer is
// `lib/__tests__/portfolioWatchlists.test.ts`.
//
// It is left in place rather than deleted because its local-wins merge semantics are the recorded
// reference W1b's order-semantics ruling generalised (quoted at `lib/watchlists.ts#adoptServerSymbols`),
// and deleting a module the commissioning session reviewed is not a build wave's call. Flagged to
// the commissioning session as a deletion candidate: if the ruling's reference copy is kept in
// `watchlists.ts` (it is), this file and its test can go.

import { DEFAULT_LIST } from "@/lib/watchlists";

export type PortfolioWatchlist = {
  id: string;
  name: string;
  symbols: string[];
};

type ServerListRow = {
  id?: unknown;
  name?: unknown;
  position?: unknown;
};

type ServerSymbolRow = {
  watchlist_id?: unknown;
  symbol?: unknown;
  position?: unknown;
};

type LocalWatchlists = {
  lists: { name: string; symbols: string[] }[];
  activeName: string | null;
};

export type ResolvedPortfolioWatchlists = {
  lists: PortfolioWatchlist[];
  preferredActiveId: string;
};

const EMPTY_DEFAULT: PortfolioWatchlist = {
  id: "local:Default",
  name: DEFAULT_LIST,
  symbols: [],
};

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text || null;
}

function position(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : Number.MAX_SAFE_INTEGER;
}

function uniqueSymbols(values: readonly unknown[]): string[] {
  const seen = new Set<string>();
  const symbols: string[] = [];
  for (const value of values) {
    const symbol = cleanText(value);
    if (!symbol || seen.has(symbol)) continue;
    seen.add(symbol);
    symbols.push(symbol);
  }
  return symbols;
}

function localId(name: string): string {
  return `local:${encodeURIComponent(name)}`;
}

/**
 * Turn the two existing Supabase watchlist reads into a serializable client prop.
 * Invalid/cross-list symbol rows are ignored, empty lists are retained, and list
 * plus symbol ordering follows the existing `position` columns.
 */
export function buildServerPortfolioWatchlists(
  listRows: readonly ServerListRow[] | null | undefined,
  symbolRows: readonly ServerSymbolRow[] | null | undefined,
): PortfolioWatchlist[] {
  const ids = new Set<string>();
  const names = new Set<string>();
  const lists = (listRows ?? [])
    .map((row, sourceIndex) => ({
      id: cleanText(row.id),
      name: cleanText(row.name),
      position: position(row.position),
      sourceIndex,
    }))
    .filter((row): row is { id: string; name: string; position: number; sourceIndex: number } => {
      if (!row.id || !row.name || ids.has(row.id) || names.has(row.name)) return false;
      ids.add(row.id);
      names.add(row.name);
      return true;
    })
    .sort((a, b) => a.position - b.position || a.sourceIndex - b.sourceIndex);

  const allowedIds = new Set(lists.map((list) => list.id));
  const grouped = new Map<string, { symbol: string; position: number; sourceIndex: number }[]>();
  for (const [sourceIndex, row] of (symbolRows ?? []).entries()) {
    const watchlistId = cleanText(row.watchlist_id);
    const symbol = cleanText(row.symbol);
    if (!watchlistId || !symbol || !allowedIds.has(watchlistId)) continue;
    const bucket = grouped.get(watchlistId) ?? [];
    bucket.push({ symbol, position: position(row.position), sourceIndex });
    grouped.set(watchlistId, bucket);
  }

  return lists.map((list) => ({
    id: list.id,
    name: list.name,
    symbols: uniqueSymbols(
      (grouped.get(list.id) ?? [])
        .sort((a, b) => a.position - b.position || a.sourceIndex - b.sourceIndex)
        .map((row) => row.symbol),
    ),
  }));
}

function parseLocalWatchlists(raw: string | null): LocalWatchlists | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    const rawLists = record.lists;
    if (!rawLists || typeof rawLists !== "object" || Array.isArray(rawLists)) return null;

    const seen = new Set<string>();
    const lists: LocalWatchlists["lists"] = [];
    for (const [rawName, value] of Object.entries(rawLists as Record<string, unknown>)) {
      const name = cleanText(rawName);
      if (!name || seen.has(name) || !Array.isArray(value)) continue;
      seen.add(name);
      const symbols = uniqueSymbols(value.map((row) => {
        if (!row || typeof row !== "object" || Array.isArray(row)) return null;
        return (row as Record<string, unknown>).symbol;
      }));
      // Empty named lists are real user state and remain switchable.
      lists.push({ name, symbols });
    }
    if (!lists.length) return null;
    return {
      lists,
      activeName: cleanText(record.active),
    };
  } catch {
    return null;
  }
}

/**
 * Additive local/server reconciliation, writing neither source.
 *
 * ORDER-SEMANTICS RULING (commissioning session, W1b round 2): named lists mirror `Default`'s
 * proven local-wins semantics. Membership and section are server-synced write-through; ORDER is
 * local-wins everywhere in the Terminal until a position-write path ships (a W5 line item). So
 * every name-matched list reconciles the SAME way here — local order and local rows first, server
 * -only rows appended — and there is no per-list special case to get wrong. `lib/watchlists.ts
 * #adoptServerSymbols` is the live-state twin of this read-side rule.
 *
 * The reason is the one this file already recorded for Default: the server row knows MEMBERSHIP,
 * not ORDER. `position` exists but nothing in the Terminal writes it after the initial insert.
 *
 *   local-only  — still rendered exactly as before. A list that has not migrated yet (or whose
 *                 migration failed and will retry) is real user state, never hidden.
 *   server-only — kept and appended, as before.
 *
 * The surface stops rendering watchlists at all in W5, at which point the guest-shell path is all
 * that is left.
 */
export function resolvePortfolioWatchlists(
  serverLists: readonly PortfolioWatchlist[],
  localStorageValue: string | null,
): ResolvedPortfolioWatchlists {
  const cleanServer = buildServerPortfolioWatchlists(
    serverLists.map((list, index) => ({ id: list.id, name: list.name, position: index })),
    serverLists.flatMap((list) => list.symbols.map((symbol, positionValue) => ({
      watchlist_id: list.id,
      symbol,
      position: positionValue,
    }))),
  );
  const local = parseLocalWatchlists(localStorageValue);
  if (!local) {
    const lists = cleanServer.length ? cleanServer : [{ ...EMPTY_DEFAULT }];
    return { lists, preferredActiveId: lists[0].id };
  }

  const serverByName = new Map(cleanServer.map((list) => [list.name, list]));
  const usedServerIds = new Set<string>();
  const lists: PortfolioWatchlist[] = local.lists.map((list) => {
    const server = serverByName.get(list.name);
    if (!server) return { id: localId(list.name), name: list.name, symbols: list.symbols };
    usedServerIds.add(server.id);
    // ONE rule for every list, Default and named alike (see the ruling in the doc comment above):
    // local order wins, server-only rows append. No per-list special case.
    return {
      id: server.id,
      name: server.name,
      symbols: uniqueSymbols([...list.symbols, ...server.symbols]),
    };
  });
  for (const server of cleanServer) {
    if (!usedServerIds.has(server.id)) lists.push(server);
  }

  const safeLists = lists.length ? lists : [{ ...EMPTY_DEFAULT }];
  const storedActive = local.activeName
    ? safeLists.find((list) => list.name === local.activeName)
    : null;
  // Portfolio is an authenticated surface. Match TerminalShell's signed-in
  // fallback exactly: a stale/deleted saved active name returns to Default,
  // regardless of serialized custom-list order, then to the first survivor.
  const preferred = storedActive ?? safeLists.find((list) => list.name === DEFAULT_LIST);
  return {
    lists: safeLists,
    preferredActiveId: preferred?.id ?? safeLists[0].id,
  };
}

/** Keep a current selection only while its exact list still exists. */
export function resolveActivePortfolioWatchlist(
  lists: readonly PortfolioWatchlist[],
  currentId: string | null,
  preferredId: string | null,
): string | null {
  if (currentId && lists.some((list) => list.id === currentId)) return currentId;
  if (preferredId && lists.some((list) => list.id === preferredId)) return preferredId;
  return lists[0]?.id ?? null;
}
