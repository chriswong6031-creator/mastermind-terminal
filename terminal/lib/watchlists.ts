// Canonical registered-watchlist service (W1b).
//
// Before this module the only server-side watchlist path in the product was
// `POST /api/watchlist`, which resolved `.limit(1).single()` — the user's FIRST list — and
// accepted exactly one symbol per `add`. Named lists existed in the schema (`watchlists` has a
// unique `(user_id,name)`) but had NO create/rename/delete path anywhere in either product, so
// every list a Terminal user made lived and died in `mm.wls` localStorage.
//
// Everything a registered user's lists need now lives here: list CRUD, symbol ops targeted by
// list id, and a batched add. The module is deliberately I/O-thin and takes the Supabase client
// as a parameter (the same RLS'd server client `app/api/watchlist/route.ts` already builds via
// `@/lib/supabase/server`), so the planning logic stays pure and unit-testable.
//
// OWNER SCOPING: RLS is the authority — `watchlists_owner` (user_id = auth.uid()) and
// `wls_via_parent` (symbol rows reachable only through an owned list), both in
// `supabase/migrations/0001_init.sql`. Every list query here ALSO carries an explicit
// `.eq("user_id", userId)`, and every symbol op resolves its list through `getOwnedList` first.
// That belt-and-braces matches macro `watchstore.js`'s double `user_id` filter: a policy
// regression must not silently become a cross-tenant read.

/** A row as it comes back over PostgREST: keys are known, value types are not, so every read
 *  below narrows explicitly rather than trusting the wire. */
export type DbRow = Record<string, unknown>;
export type DbResult = { data?: DbRow[] | DbRow | null; error?: { message?: string } | null };

/** Structural view of the Supabase query builder — the subset this service actually calls. Keeps
 *  the module free of the SDK's generics and lets both the e2e fixture transport and unit tests
 *  supply a stand-in that satisfies the same shape. */
export type WatchlistQuery = PromiseLike<DbResult> & {
  select: (fields?: string) => WatchlistQuery;
  eq: (column: string, value: unknown) => WatchlistQuery;
  in: (column: string, values: readonly unknown[]) => WatchlistQuery;
  order: (column: string, options?: { ascending?: boolean }) => WatchlistQuery;
  limit: (count: number) => WatchlistQuery;
  insert: (values: DbRow | DbRow[]) => WatchlistQuery;
  update: (values: DbRow) => WatchlistQuery;
  delete: () => WatchlistQuery;
  maybeSingle: () => Promise<DbResult>;
};

export type WatchlistDb = { from: (table: string) => WatchlistQuery };

const rows = (result: DbResult): DbRow[] => (Array.isArray(result?.data) ? result.data : []);
const one = (result: DbResult): DbRow | null => {
  const data = result?.data;
  if (Array.isArray(data)) return data[0] ?? null;
  return data && typeof data === "object" ? data : null;
};
const text = (value: unknown): string | null => (typeof value === "string" && value ? value : null);
const num = (value: unknown, fallback: number): number =>
  (typeof value === "number" && Number.isFinite(value) ? value : fallback);

export type WatchlistSymbol = { symbol: string; section: string; position: number };
export type ServerWatchlist = { id: string; name: string; position: number; symbols: WatchlistSymbol[] };

/** A local (`mm.wls`) list as the shell holds it. */
export type LocalWatchlist = { name: string; rows: { symbol: string; section: string }[] };

export const MAX_BATCH = 500;
export const MAX_SYMBOL_LEN = 128;
export const MAX_NAME_LEN = 80;
export const DEFAULT_SECTION = "Watchlist";
/** The one list TRAP-1 owns: `/terminal/page.tsx` seeds it, TerminalShell reconciles it against
 *  the `symbols` prop on mount. The migration never touches it. */
export const DEFAULT_LIST = "Default";

// Same guard the pre-W1b route carried: reject C0 control characters and DEL in any
// user-supplied label or symbol.
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/** Normalize, upper-case and de-duplicate a symbol batch. Returns [] when the batch is empty or
 *  larger than MAX_BATCH so a caller can refuse it whole rather than partially mutating. */
export function normalizeSymbols(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  const symbols = [...new Set(raw
    .filter((symbol): symbol is string => typeof symbol === "string")
    .map((symbol) => symbol.trim().toUpperCase())
    .filter((symbol) => !!symbol && symbol.length <= MAX_SYMBOL_LEN && !CONTROL_CHARS.test(symbol)))];
  return symbols.length <= MAX_BATCH ? symbols : [];
}

/** Section label; `null` means the caller sent something unusable. */
export function normalizeSection(value: unknown, fallback = DEFAULT_SECTION): string | null {
  const section = typeof value === "string" ? value.trim() : fallback;
  if (!section || section.length > MAX_NAME_LEN || CONTROL_CHARS.test(section)) return null;
  return section;
}

/** List name; `null` means unusable. Comparison is EXACT everywhere — the schema's unique
 *  `(user_id,name)` is case-sensitive, so "AI" and "ai" are two different lists and no fuzzy
 *  matching may be introduced (packet section 4 collision rules). */
export function normalizeListName(value: unknown): string | null {
  const name = typeof value === "string" ? value.trim() : "";
  if (!name || name.length > MAX_NAME_LEN || CONTROL_CHARS.test(name)) return null;
  return name;
}

// ───────────────────────────── reads ─────────────────────────────

/** Full owner-scoped inventory: every list with its symbols, both ordered by `position`. */
export async function listWatchlists(db: WatchlistDb, userId: string): Promise<ServerWatchlist[]> {
  const listResult = await db.from("watchlists")
    .select("id,name,position").eq("user_id", userId).order("position");
  const lists: ServerWatchlist[] = [];
  for (const [index, row] of rows(listResult).entries()) {
    const id = text(row.id);
    const name = text(row.name);
    if (!id || !name) continue;
    lists.push({ id, name, position: num(row.position, index), symbols: [] });
  }
  if (!lists.length) return lists;

  const byId = new Map(lists.map((list) => [list.id, list]));
  const symbolResult = await db.from("watchlist_symbols")
    .select("watchlist_id,symbol,section,position")
    .in("watchlist_id", [...byId.keys()])
    .order("position");
  for (const row of rows(symbolResult)) {
    const listId = text(row.watchlist_id);
    const list = listId ? byId.get(listId) : undefined;
    const symbol = text(row.symbol);
    if (!list || !symbol || list.symbols.some((existing) => existing.symbol === symbol)) continue;
    list.symbols.push({
      symbol,
      section: text(row.section)?.trim() || DEFAULT_SECTION,
      position: num(row.position, list.symbols.length),
    });
  }
  return lists;
}

/** Resolve one owned list. `null` when it does not exist or is not this user's. */
export async function getOwnedList(
  db: WatchlistDb,
  userId: string,
  listId: string,
): Promise<{ id: string; name: string } | null> {
  const row = one(await db.from("watchlists")
    .select("id,name").eq("user_id", userId).eq("id", listId).maybeSingle());
  const id = row ? text(row.id) : null;
  return id ? { id, name: text(row?.name) ?? "" } : null;
}

/** Resolve by exact name (the migration's merge key). */
export async function getOwnedListByName(
  db: WatchlistDb,
  userId: string,
  name: string,
): Promise<{ id: string; name: string } | null> {
  const row = one(await db.from("watchlists")
    .select("id,name").eq("user_id", userId).eq("name", name).maybeSingle());
  const id = row ? text(row.id) : null;
  return id ? { id, name: text(row?.name) ?? name } : null;
}

/**
 * The list a request targets: explicit id, else exact name, else — for the pre-W1b call shape
 * that sent neither — the first list by position. The fallback is what keeps every already-
 * deployed client (and the Default fire-and-forget syncs) working unchanged while list-targeted
 * callers stop being silently redirected onto list #1.
 */
export async function resolveTargetList(
  db: WatchlistDb,
  userId: string,
  input: { listId?: unknown; listName?: unknown },
): Promise<{ id: string; name: string } | null> {
  if (typeof input.listId === "string" && input.listId.trim()) {
    return getOwnedList(db, userId, input.listId.trim());
  }
  const name = input.listName === undefined || input.listName === null ? null : normalizeListName(input.listName);
  if (name) return getOwnedListByName(db, userId, name);
  const row = one(await db.from("watchlists")
    .select("id,name").eq("user_id", userId).order("position").limit(1).maybeSingle());
  const id = row ? text(row.id) : null;
  return id ? { id, name: text(row?.name) ?? "" } : null;
}

// ───────────────────────────── list CRUD ─────────────────────────────

/**
 * Create a list, or return the existing one with that exact name. Idempotent by construction —
 * `(user_id,name)` is unique, so a concurrent creator (or a re-run migration) converges instead
 * of erroring. New lists land at max(position)+1 so ordering is stable and append-only.
 */
export async function createList(
  db: WatchlistDb,
  userId: string,
  rawName: string,
): Promise<{ list: { id: string; name: string } | null; created: boolean; error?: string }> {
  const name = normalizeListName(rawName);
  if (!name) return { list: null, created: false, error: "invalid name" };

  const existing = await getOwnedListByName(db, userId, name);
  if (existing) return { list: existing, created: false };

  const tail = one(await db.from("watchlists")
    .select("position").eq("user_id", userId).order("position", { ascending: false }).limit(1).maybeSingle());
  const nextPosition = num(tail?.position, -1) + 1;

  const inserted = await db.from("watchlists")
    .insert({ user_id: userId, name, position: nextPosition })
    .select("id,name").maybeSingle();
  const created = one(inserted);
  const createdId = created ? text(created.id) : null;
  if (inserted.error || !createdId) {
    // Lost a create race against another tab/device: the unique index did its job, so read the
    // winner back rather than surfacing a failure for state that now exists.
    const raced = await getOwnedListByName(db, userId, name);
    if (raced) return { list: raced, created: false };
    return { list: null, created: false, error: "create failed" };
  }
  return { list: { id: createdId, name: text(created?.name) ?? name }, created: true };
}

export async function renameList(
  db: WatchlistDb,
  userId: string,
  listId: string,
  rawName: string,
): Promise<{ ok: boolean; error?: string; status?: number }> {
  const name = normalizeListName(rawName);
  if (!name) return { ok: false, error: "invalid name", status: 400 };
  const owned = await getOwnedList(db, userId, listId);
  if (!owned) return { ok: false, error: "list not found", status: 404 };
  if (owned.name === name) return { ok: true };
  const clash = await getOwnedListByName(db, userId, name);
  if (clash) return { ok: false, error: "name already used", status: 409 };
  const { error } = await db.from("watchlists").update({ name }).eq("user_id", userId).eq("id", listId);
  if (error) return { ok: false, error: "watchlist update failed", status: 500 };
  return { ok: true };
}

/** Delete a list. `watchlist_symbols.watchlist_id` cascades (0001_init.sql), so the rows go with it. */
export async function deleteList(
  db: WatchlistDb,
  userId: string,
  listId: string,
): Promise<{ ok: boolean; error?: string; status?: number }> {
  const owned = await getOwnedList(db, userId, listId);
  if (!owned) return { ok: false, error: "list not found", status: 404 };
  const { error } = await db.from("watchlists").delete().eq("user_id", userId).eq("id", listId);
  if (error) return { ok: false, error: "watchlist update failed", status: 500 };
  return { ok: true };
}

// ───────────────────────────── symbol ops (list-targeted) ─────────────────────────────

/**
 * Add a batch to one list. Dedupes against what is already there, appends in the order given,
 * and continues numbering from the list's current tail so `position` never collides.
 * A batch whose symbols all exist is a successful no-op — this is what makes the migration
 * safe to re-run.
 */
export async function addSymbols(
  db: WatchlistDb,
  listId: string,
  symbols: readonly string[],
  section: string,
  sectionBySymbol?: Readonly<Record<string, string>>,
): Promise<{ ok: boolean; added: string[]; error?: string }> {
  if (!symbols.length) return { ok: true, added: [] };
  const existing = await db.from("watchlist_symbols")
    .select("symbol,position").eq("watchlist_id", listId);
  const present = new Set<string>();
  let tail = -1;
  for (const row of rows(existing)) {
    const symbol = text(row.symbol);
    if (symbol) present.add(symbol);
    tail = Math.max(tail, num(row.position, -1));
  }
  const missing = symbols.filter((symbol) => !present.has(symbol));
  if (!missing.length) return { ok: true, added: [] };
  const inserts = missing.map((symbol, index) => ({
    watchlist_id: listId,
    symbol,
    section: sectionBySymbol?.[symbol] ?? section,
    position: tail + 1 + index,
  }));
  const { error } = await db.from("watchlist_symbols").insert(inserts);
  if (error) return { ok: false, added: [], error: "watchlist update failed" };
  return { ok: true, added: missing };
}

export async function removeSymbols(
  db: WatchlistDb,
  listId: string,
  symbols: readonly string[],
): Promise<{ ok: boolean; error?: string }> {
  if (!symbols.length) return { ok: true };
  let query = db.from("watchlist_symbols").delete().eq("watchlist_id", listId);
  query = symbols.length === 1 ? query.eq("symbol", symbols[0]) : query.in("symbol", symbols);
  const { error } = await query;
  if (error) return { ok: false, error: "watchlist update failed" };
  return { ok: true };
}

export async function moveSymbols(
  db: WatchlistDb,
  listId: string,
  symbols: readonly string[],
  section: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!symbols.length) return { ok: true };
  let query = db.from("watchlist_symbols").update({ section }).eq("watchlist_id", listId);
  query = symbols.length === 1 ? query.eq("symbol", symbols[0]) : query.in("symbol", symbols);
  const { error } = await query;
  if (error) return { ok: false, error: "watchlist update failed" };
  return { ok: true };
}

// ───────────────────────────── migration planning (pure) ─────────────────────────────

export type MigrationListPlan = {
  name: string;
  /** Absent on the server — create it at this position first. `null` once it exists. */
  createAtPosition: number | null;
  serverListId: string | null;
  /** Local rows the server list does not carry yet, in local order. */
  insert: { symbol: string; section: string }[];
};

export type MigrationPlan = {
  lists: MigrationListPlan[];
  /** Names skipped because the marker already records them, or because they are `Default`. */
  skipped: string[];
};

/**
 * `mm.wls` -> server plan (packet section 4, exactly):
 *   for each non-`Default` local list -> find the server list by EXACT name -> create if absent
 *   (position = max+1) -> insert the symbols the server list is missing, in local order,
 *   carrying each row's local `section`; dedupe by symbol.
 *
 * ADDITIVE ONLY. Nothing in the plan can delete or rename a server row, and a server-only list
 * simply never appears in it, so it is kept untouched. `Default` is excluded outright: TRAP-1's
 * mount-side reconcile and guest->signed-in overwrite own that list and must not be duplicated
 * by a second writer.
 *
 * Idempotent by construction — after a successful run every local symbol exists on the server,
 * so a second call over the SAME inputs plans zero creates and zero inserts even with an empty
 * marker (proved in lib/__tests__/watchlists.test.ts, and end-to-end in
 * e2e/watchlist-server-migration.spec.ts).
 */
export function planWatchlistMigration(
  local: readonly LocalWatchlist[],
  server: readonly ServerWatchlist[],
  done: Readonly<Record<string, boolean>> = {},
): MigrationPlan {
  const serverByName = new Map(server.map((list) => [list.name, list]));
  let nextPosition = server.reduce((max, list) => Math.max(max, list.position), -1) + 1;

  const lists: MigrationListPlan[] = [];
  const skipped: string[] = [];
  const seen = new Set<string>();

  for (const list of local) {
    const name = normalizeListName(list.name);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    if (name === DEFAULT_LIST || done[name] === true) {
      skipped.push(name);
      continue;
    }
    const serverList = serverByName.get(name);
    const present = new Set(serverList?.symbols.map((row) => row.symbol) ?? []);
    const insert: { symbol: string; section: string }[] = [];
    const queued = new Set<string>();
    for (const row of list.rows) {
      const symbol = typeof row?.symbol === "string" ? row.symbol.trim().toUpperCase() : "";
      if (!symbol || present.has(symbol) || queued.has(symbol)) continue;
      queued.add(symbol);
      insert.push({ symbol, section: normalizeSection(row?.section) ?? DEFAULT_SECTION });
    }
    if (serverList && !insert.length) {
      // Already fully represented on the server — nothing to do, but it IS migrated, so the
      // caller records the marker and stops re-planning it.
      lists.push({ name, createAtPosition: null, serverListId: serverList.id, insert: [] });
      continue;
    }
    lists.push({
      name,
      createAtPosition: serverList ? null : nextPosition++,
      serverListId: serverList?.id ?? null,
      insert,
    });
  }
  return { lists, skipped };
}

/**
 * Read model for a signed-in named list (packet section 4 collision rules): the server row order
 * is canonical for symbols that exist on both sides, and local-only rows append afterwards in
 * local order. Sections follow the same rule — server wins where the row exists on the server.
 */
export function mergeListSymbols(
  server: readonly { symbol: string; section: string }[],
  local: readonly { symbol: string; section: string }[],
): { symbol: string; section: string }[] {
  const merged: { symbol: string; section: string }[] = [];
  const seen = new Set<string>();
  for (const row of server) {
    if (!row?.symbol || seen.has(row.symbol)) continue;
    seen.add(row.symbol);
    merged.push({ symbol: row.symbol, section: row.section || DEFAULT_SECTION });
  }
  for (const row of local) {
    if (!row?.symbol || seen.has(row.symbol)) continue;
    seen.add(row.symbol);
    merged.push({ symbol: row.symbol, section: row.section || DEFAULT_SECTION });
  }
  return merged;
}
