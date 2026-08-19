// Deterministic in-memory stand-in for `saved_scripts`, used ONLY when `TERMINAL_E2E_FIXTURE=1`
// (the Playwright dev server). It exists so the Pine editor's STATE contract — a successful save
// becomes the editor's baseline, a dirty buffer is never discarded silently, the visible script and
// the ?id= deep link agree — can be proven in a real browser against the real component and the
// real save route. The fixture replaces the transport, never the behaviour under test.
//
// Never reachable in production: `app/(shell)/scripts/page.tsx` and `app/api/scripts/save/route.ts`
// read the env flag once and fall through to the RLS'd Supabase server client otherwise.
//
// Mirrors lib/watchlistsFixtureDb.ts deliberately, including the globalThis store. Next compiles
// Route Handlers and Server Components into different bundles, so a module-level `new Map()` is
// instantiated once PER BUNDLE — `POST /api/scripts/save` would write into one map while
// `app/(shell)/scripts/page.tsx` read an empty one in the same process and same request. That is
// exactly the false-negative this whole PR is about (a save that landed but does not appear), so
// the fixture must not manufacture one of its own.
//
// Keyed by the `mm_e2e_scripts` cookie so the three parallel viewport projects cannot see each
// other's edits; absent cookie -> a shared "default" store.

export const SCRIPTS_FIXTURE_COOKIE = "mm_e2e_scripts";

export type FixtureScript = {
  id: string;
  name: string;
  source: string;
  lang: string;
  params: Record<string, unknown>;
  updated_at: string;
};

const GLOBAL_KEY = Symbol.for("mm.e2e.scriptsFixtureStores");
type FixtureGlobal = typeof globalThis & { [GLOBAL_KEY]?: Map<string, FixtureScript[]> };
const stores: Map<string, FixtureScript[]> =
  ((globalThis as FixtureGlobal)[GLOBAL_KEY] ??= new Map<string, FixtureScript[]>());

/** Two editable scripts is the minimum that can express the defect: the bug only shows itself when
 *  you leave a script and come back to it. */
function seed(key: string): FixtureScript[] {
  return [
    {
      id: `${key}-script-a`,
      name: "Alpha Study",
      source: "//@version=6\nindicator(\"Alpha Study\")\nplot(close)\n",
      lang: "pine",
      params: { length: 14 },
      updated_at: "2026-08-01T00:00:00.000Z",
    },
    {
      id: `${key}-script-b`,
      name: "Beta Study",
      source: "//@version=6\nindicator(\"Beta Study\")\nplot(open)\n",
      lang: "pine",
      params: { length: 21 },
      updated_at: "2026-08-02T00:00:00.000Z",
    },
  ];
}

export function fixtureScriptsUserId(key: string): string {
  return `e2e-user-${key}`;
}

export function listFixtureScripts(key: string): FixtureScript[] {
  let rows = stores.get(key);
  if (!rows) { rows = seed(key); stores.set(key, rows); }
  // Same ordering the real page asks Supabase for (updated_at desc) — a spec must not accidentally
  // depend on an order the product does not produce.
  return [...rows].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

/** Insert or update, returning the row id — the same contract `/api/scripts/save` answers with. */
export function saveFixtureScript(
  key: string,
  input: { id?: string; name: string; source: string; lang?: string; params?: Record<string, unknown> },
): string {
  const rows = stores.get(key) ?? (() => { const s = seed(key); stores.set(key, s); return s; })();
  const at = new Date().toISOString();
  const existing = input.id ? rows.find((r) => r.id === input.id) : undefined;
  if (existing) {
    existing.name = input.name;
    existing.source = input.source;
    existing.params = input.params ?? {};
    existing.updated_at = at;
    return existing.id;
  }
  const created: FixtureScript = {
    id: `${key}-script-${rows.length + 1}-${at}`,
    name: input.name,
    source: input.source,
    lang: input.lang ?? "pine",
    params: input.params ?? {},
    updated_at: at,
  };
  rows.push(created);
  return created.id;
}
