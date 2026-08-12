// Deterministic in-memory stand-in for the two watchlist tables, used ONLY when
// `TERMINAL_E2E_FIXTURE=1` (the Playwright dev server). It implements the same structural
// `WatchlistDb` surface `lib/watchlists.ts` calls, so the e2e suite exercises the REAL service
// and route logic — the fixture replaces the transport, never the behaviour under test.
//
// Never reachable in production: `app/api/watchlist/route.ts` reads the env flag once and falls
// through to the RLS'd Supabase server client otherwise.
//
// The three responsive browser projects share ONE dev server, so the store is keyed by the
// `mm_e2e_wl` cookie: a spec that wants isolation sets its own key and gets its own account-shaped
// world. Absent cookie -> the shared "default" store, seeded to match `app/terminal/page.tsx`'s
// guest/e2e symbols so specs that never opt in see exactly today's Default list.

import type { DbResult, DbRow, WatchlistDb, WatchlistQuery } from "@/lib/watchlists";

export const FIXTURE_STORE_COOKIE = "mm_e2e_wl";

type Store = { lists: DbRow[]; symbols: DbRow[]; seq: number };

const SEED_SYMBOLS: [string, string][] = [
  ["Crypto", "BTC-USD"], ["Crypto", "ETH-USD"], ["Equities", "NVDA"],
  ["Equities", "AAPL"], ["Equities", "MSFT"], ["Equities", "QQQ"],
];

const stores = new Map<string, Store>();

/** Stable synthetic owner id per store key — the service still filters on it everywhere. */
export function fixtureUserId(key: string): string {
  return `e2e-user-${key}`;
}

function seedStore(key: string): Store {
  const listId = `${key}-wl-default`;
  return {
    lists: [{ id: listId, user_id: fixtureUserId(key), name: "Default", position: 0 }],
    symbols: SEED_SYMBOLS.map(([section, symbol], index) => ({
      id: `${listId}-s${index}`,
      watchlist_id: listId,
      symbol,
      section,
      position: index,
    })),
    seq: 0,
  };
}

export function fixtureStore(key: string): Store {
  let store = stores.get(key);
  if (!store) {
    store = seedStore(key);
    stores.set(key, store);
  }
  return store;
}

/** Only for tests of the fixture transport itself. */
export function resetFixtureStores(): void {
  stores.clear();
}

type Table = "watchlists" | "watchlist_symbols";

class FixtureQuery implements WatchlistQuery {
  private predicates: ((row: DbRow) => boolean)[] = [];
  private orderKey: string | null = null;
  private orderAsc = true;
  private limitTo: number | null = null;
  private projection: string[] | null = null;
  private mode: "read" | "insert" | "update" | "delete" = "read";
  private payload: DbRow[] = [];

  constructor(private store: Store, private table: Table) {}

  private get rows(): DbRow[] {
    return this.table === "watchlists" ? this.store.lists : this.store.symbols;
  }

  private matched(): DbRow[] {
    let matched = this.rows.filter((row) => this.predicates.every((predicate) => predicate(row)));
    const key = this.orderKey;
    if (key) {
      const direction = this.orderAsc ? 1 : -1;
      matched = [...matched].sort((a, b) => {
        const left = a[key] as string | number;
        const right = b[key] as string | number;
        return (left > right ? 1 : left < right ? -1 : 0) * direction;
      });
    }
    if (this.limitTo !== null) matched = matched.slice(0, this.limitTo);
    return matched;
  }

  private project(matched: DbRow[]): DbRow[] {
    const fields = this.projection;
    if (!fields) return matched.map((row) => ({ ...row }));
    return matched.map((row) => Object.fromEntries(fields.map((field) => [field, row[field]])));
  }

  select(fields?: string): WatchlistQuery {
    this.projection = fields && fields !== "*" ? fields.split(",").map((field) => field.trim()) : null;
    return this;
  }

  eq(column: string, value: unknown): WatchlistQuery {
    this.predicates.push((row) => row[column] === value);
    return this;
  }

  in(column: string, values: readonly unknown[]): WatchlistQuery {
    const set = new Set(values);
    this.predicates.push((row) => set.has(row[column]));
    return this;
  }

  order(column: string, options?: { ascending?: boolean }): WatchlistQuery {
    this.orderKey = column;
    this.orderAsc = options?.ascending !== false;
    return this;
  }

  limit(count: number): WatchlistQuery {
    this.limitTo = count;
    return this;
  }

  insert(values: DbRow | DbRow[]): WatchlistQuery {
    this.mode = "insert";
    this.payload = Array.isArray(values) ? values : [values];
    return this;
  }

  update(values: DbRow): WatchlistQuery {
    this.mode = "update";
    this.payload = [values];
    return this;
  }

  delete(): WatchlistQuery {
    this.mode = "delete";
    return this;
  }

  private run(): DbResult {
    if (this.mode === "insert") {
      const incoming: DbRow[] = this.payload.map((row) => ({ id: `${this.table}-${++this.store.seq}`, ...row }));
      // The live schema's unique (user_id,name) is what makes the migration converge under a
      // race instead of duplicating a list — model it rather than accepting anything.
      if (this.table === "watchlists") {
        for (const row of incoming) {
          if (this.store.lists.some((list) => list.user_id === row.user_id && list.name === row.name)) {
            return { data: null, error: { message: "duplicate key value violates unique constraint" } };
          }
        }
      }
      this.rows.push(...incoming);
      return { data: this.project(incoming), error: null };
    }
    if (this.mode === "update") {
      const targets = this.matched();
      for (const row of targets) Object.assign(row, this.payload[0] ?? {});
      return { data: this.project(targets), error: null };
    }
    if (this.mode === "delete") {
      const targets = new Set(this.matched());
      const kept = this.rows.filter((row) => !targets.has(row));
      if (this.table === "watchlists") {
        const removed = new Set([...targets].map((row) => row.id));
        this.store.lists = kept;
        // FK `on delete cascade` (0001_init.sql) — the symbol rows go with the list.
        this.store.symbols = this.store.symbols.filter((row) => !removed.has(row.watchlist_id));
      } else {
        this.store.symbols = kept;
      }
      return { data: null, error: null };
    }
    return { data: this.project(this.matched()), error: null };
  }

  async maybeSingle(): Promise<DbResult> {
    const result = this.run();
    const data = Array.isArray(result.data) ? result.data[0] ?? null : result.data ?? null;
    return { data, error: result.error ?? null };
  }

  then<TResult1 = DbResult, TResult2 = never>(
    onfulfilled?: ((value: DbResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.run()).then(onfulfilled, onrejected);
  }
}

export function createFixtureDb(key: string): WatchlistDb {
  const store = fixtureStore(key);
  return { from: (table: string) => new FixtureQuery(store, table as Table) };
}
