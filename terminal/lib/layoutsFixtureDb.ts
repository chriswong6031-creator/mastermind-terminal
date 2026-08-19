// Deterministic in-memory stand-in for `chart_layouts`, used ONLY when `TERMINAL_E2E_FIXTURE=1`
// (the Playwright dev server). It implements the structural `LayoutDb` surface `lib/layouts.ts`
// calls, so the browser suite exercises the REAL service and route logic — the fixture replaces the
// transport, never the behaviour under test. Same construction as `lib/watchlistsFixtureDb.ts`.
//
// Two things it models that a naive stub would not, because the packet's proofs depend on them:
//
//  1. THE DATABASE INVARIANT. The store enforces `unique (user_id, name)` itself — an INSERT onto a
//     taken name answers `{code:"23505"}` and `upsert(onConflict:"user_id,name")` updates in place.
//     So "two concurrent saves leave exactly one row" is proved against a store that behaves like
//     the post-`0008` schema, not against UI debouncing. (The fixture therefore always models the
//     APPLIED world; the unapplied-DDL fallback path in lib/layouts.ts is covered by unit tests,
//     which can return 42P10 on demand.)
//
//  2. FAULT INJECTION. Production Supabase must never be broken to prove an error state, so the
//     store fails on request instead: the `mm_e2e_layout_fault` cookie makes the matching operation
//     class answer a transport error, exactly as an outage would.
//
// Never reachable in production: `app/api/layouts/route.ts` reads the env flag once and otherwise
// falls through to the RLS'd Supabase server client.

import type { LayoutDb, LayoutDbResult, LayoutQuery, LayoutRow } from "@/lib/layouts";

/** Per-test store key, so the three parallel viewport projects cannot see each other's writes. */
export const LAYOUT_STORE_COOKIE = "mm_e2e_layouts";
/** Operation class that should fail: `list` | `save` | `delete` | `all`. */
export const LAYOUT_FAULT_COOKIE = "mm_e2e_layout_fault";
/** Renders the workspace as a signed-out visitor (page prop + API auth), for the guest-gate spec. */
export const GUEST_COOKIE = "mm_e2e_guest";

export type LayoutFault = "list" | "save" | "delete" | "all" | "";

type Store = { rows: LayoutRow[]; seq: number };

// PROCESS-global for the reason spelled out in watchlistsFixtureDb: Next compiles Route Handlers
// and Server Components into different bundles, so a module-level Map would be instantiated once
// per bundle and the two would silently disagree about the same account's rows.
const GLOBAL_KEY = Symbol.for("mm.e2e.layoutFixtureStores");
type FixtureGlobal = typeof globalThis & { [GLOBAL_KEY]?: Map<string, Store> };
const stores: Map<string, Store> = ((globalThis as FixtureGlobal)[GLOBAL_KEY] ??= new Map<string, Store>());

/** Stable synthetic owner id per store key — the service still filters on it everywhere. */
export function fixtureLayoutUserId(key: string): string {
  return `e2e-layout-user-${key}`;
}

function storeFor(key: string): Store {
  let store = stores.get(key);
  if (!store) { store = { rows: [], seq: 0 }; stores.set(key, store); }
  return store;
}

const transportFault = (): LayoutDbResult => ({ error: { code: "XX000", message: "fixture transport fault" } });

type Op =
  | { kind: "select" }
  | { kind: "insert"; values: LayoutRow }
  | { kind: "update"; values: LayoutRow }
  | { kind: "upsert"; values: LayoutRow }
  | { kind: "delete" };

/** Which fault class an operation belongs to, so one cookie can target reads or writes. */
const faultClassOf = (op: Op): LayoutFault => (op.kind === "select" ? "list" : op.kind === "delete" ? "delete" : "save");

export function createLayoutFixtureDb(key: string, fault: LayoutFault = ""): LayoutDb {
  const store = storeFor(key);

  const build = (): LayoutQuery => {
    let op: Op = { kind: "select" };
    const filters: [string, unknown][] = [];
    let sort: { column: string; ascending: boolean } | null = null;

    const matches = (row: LayoutRow) => filters.every(([column, value]) => row[column] === value);

    const run = (): LayoutDbResult => {
      if (fault === "all" || (fault && fault === faultClassOf(op))) return transportFault();
      switch (op.kind) {
        case "select": {
          let rows = store.rows.filter(matches);
          if (sort) {
            const { column, ascending } = sort;
            rows = [...rows].sort((a, b) => String(a[column] ?? "").localeCompare(String(b[column] ?? "")) * (ascending ? 1 : -1));
          }
          return { data: rows.map((r) => ({ ...r })) };
        }
        case "insert": {
          const values = op.values;
          if (store.rows.some((r) => r.user_id === values.user_id && r.name === values.name)) {
            return { error: { code: "23505", message: "duplicate key value violates unique constraint chart_layouts_user_name" } };
          }
          const row: LayoutRow = { id: `layout-${key}-${++store.seq}`, created_at: new Date().toISOString(), ...values };
          store.rows.push(row);
          return { data: [{ ...row }] };
        }
        case "update": {
          const hit = store.rows.filter(matches);
          for (const row of hit) Object.assign(row, op.values);
          return { data: hit.map((r) => ({ ...r })) };
        }
        case "upsert": {
          const values = op.values;
          const existing = store.rows.find((r) => r.user_id === values.user_id && r.name === values.name);
          if (existing) { Object.assign(existing, values); return { data: [{ ...existing }] }; }
          const row: LayoutRow = { id: `layout-${key}-${++store.seq}`, created_at: new Date().toISOString(), ...values };
          store.rows.push(row);
          return { data: [{ ...row }] };
        }
        case "delete": {
          const hit = store.rows.filter(matches);
          store.rows = store.rows.filter((r) => !matches(r));
          return { data: hit.map((r) => ({ ...r })) };
        }
      }
    };

    const query = {
      select: () => query,
      eq: (column: string, value: unknown) => { filters.push([column, value]); return query; },
      order: (column: string, options?: { ascending?: boolean }) => { sort = { column, ascending: options?.ascending !== false }; return query; },
      insert: (values: LayoutRow) => { op = { kind: "insert", values }; return query; },
      update: (values: LayoutRow) => { op = { kind: "update", values }; return query; },
      upsert: (values: LayoutRow) => { op = { kind: "upsert", values }; return query; },
      delete: () => { op = { kind: "delete" }; return query; },
      maybeSingle: async () => { const r = run(); return r.error ? r : { data: (r.data as LayoutRow[])[0] ?? null }; },
      then: (resolve: (value: LayoutDbResult) => unknown) => Promise.resolve(run()).then(resolve),
    } as unknown as LayoutQuery;
    return query;
  };

  return { from: () => build() };
}
