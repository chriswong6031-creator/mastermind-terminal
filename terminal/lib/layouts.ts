// ── Saved-layout storage service ────────────────────────────────────────────────────────────────
// The authoritative read/write path for `chart_layouts` (S6: per-user persisted chart workspaces),
// split out of `app/api/layouts/route.ts` so the route is a thin HTTP shell and the rules below are
// unit-testable against a stand-in transport — the same shape `lib/watchlists.ts` uses.
//
// The one law this module exists to enforce: **unavailable is not empty, and a failed mutation is
// not success.** The previous implementation read `data` and dropped `error` on the floor in three
// places, so a Supabase outage rendered as `200 {layouts: []}` ("you have no saved layouts") and a
// failed UPDATE/DELETE rendered as `{ok:true}`. Every function here returns a discriminated result
// and never collapses a transport failure into an empty collection.
//
// ── Name identity and the (user_id, name) invariant ──
// A layout is identified to the user by its NAME: saving over an existing name is an intentional
// overwrite. The route comment has claimed "one named layout per user" since 0001, but the schema
// never enforced it and the write path was a read-then-insert pseudo-upsert — two tabs (or one
// double-click) could both miss the SELECT and both INSERT. `supabase/migrations/
// 0008_chart_layouts_unique_name.sql` adds the real invariant, `unique (user_id, name)`.
//
// That DDL is an operator action (the estate has no DDL credential path — see the migration
// header), so this module is written to be correct in BOTH states:
//   * constraint applied  -> `upsert(..., {onConflict:"user_id,name"})` is a single atomic
//     statement, and a concurrent create race surfaces as 23505 rather than a duplicate row;
//   * constraint absent   -> PostgREST answers 42P10 ("no unique or exclusion constraint matching
//     the ON CONFLICT specification") and we fall back to the legacy select-then-write. The
//     fallback is NOT cached: layout saves are rare, and re-probing every time means the atomic
//     path starts working the moment the DDL lands, with no restart and no stale capability flag.
// Exactness is deliberate: lookups have always been exact-name, so the constraint is exact-name
// too. Case-folding would be a separate product ruling and would silently merge existing names.

export type LayoutRow = Record<string, unknown>;
export type LayoutDbError = { code?: string; message?: string } | null;
export type LayoutDbResult = { data?: LayoutRow[] | LayoutRow | null; error?: LayoutDbError };

/** Structural view of the Supabase query builder — only the subset this service calls, so the e2e
 *  fixture transport and unit tests can supply a stand-in that satisfies the same shape. */
export type LayoutQuery = PromiseLike<LayoutDbResult> & {
  select: (fields?: string) => LayoutQuery;
  eq: (column: string, value: unknown) => LayoutQuery;
  order: (column: string, options?: { ascending?: boolean }) => LayoutQuery;
  insert: (values: LayoutRow) => LayoutQuery;
  update: (values: LayoutRow) => LayoutQuery;
  upsert: (values: LayoutRow, options?: { onConflict?: string }) => LayoutQuery;
  delete: () => LayoutQuery;
  maybeSingle: () => Promise<LayoutDbResult>;
};

export type LayoutDb = { from: (table: string) => LayoutQuery };

export const LAYOUTS_TABLE = "chart_layouts";
export const LAYOUT_NAME_MAX = 80;
/** The prefix auto-generated names use. Exported so the client and its tests agree on one string. */
export const AUTO_LAYOUT_PREFIX = "Layout";

/** PostgREST/Postgres codes this module reasons about. */
const CODE_UNIQUE_VIOLATION = "23505";
const CODE_NO_CONFLICT_TARGET = "42P10";

export type SavedLayout = { id: string; name: string; config: unknown; updated_at: string | null };

export type ListLayoutsResult =
  | { ok: true; layouts: SavedLayout[] }
  | { ok: false; reason: "unavailable" };

export type SaveLayoutResult =
  | { ok: true; id: string; created: boolean }
  | { ok: false; reason: "unavailable" | "name_taken" | "invalid_name" };

export type DeleteLayoutResult =
  | { ok: true }
  | { ok: false; reason: "unavailable" | "not_found" };

/** "create" refuses to touch an existing name (used by blank-name auto-save, which must never
 *  overwrite an unrelated layout); "overwrite" is the user explicitly typing an existing name. */
export type SaveMode = "create" | "overwrite";

const errOf = (result: LayoutDbResult): LayoutDbError => result?.error ?? null;
const rowsOf = (result: LayoutDbResult): LayoutRow[] =>
  Array.isArray(result?.data) ? result.data : result?.data ? [result.data as LayoutRow] : [];
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/** Trim + length-cap a user-supplied layout name; `null` when it is not a usable name at all. */
export function normalizeLayoutName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().slice(0, LAYOUT_NAME_MAX);
  return trimmed ? trimmed : null;
}

/**
 * First UNUSED `Layout N`, scanning upward from 1.
 *
 * The bug this replaces: the shell auto-named a blank save `Layout ${layouts.length + 1}`, and the
 * server treats name as update identity. With Layouts 1/2/3 saved, deleting Layout 2 leaves length
 * 2 -> the next blank save generated "Layout 3" and OVERWROTE the surviving Layout 3. Counting is
 * not naming: the only safe generator is one that inspects the taken names.
 */
export function nextLayoutName(existing: Iterable<unknown>): string {
  const taken = new Set<string>();
  for (const n of existing) { const s = str(n); if (s) taken.add(s); }
  // Guaranteed to terminate: at most `taken.size` candidates can collide, so index size+1 is free.
  for (let i = 1; i <= taken.size + 1; i++) {
    const candidate = `${AUTO_LAYOUT_PREFIX} ${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  /* c8 ignore next */
  return `${AUTO_LAYOUT_PREFIX} ${taken.size + 1}`;
}

const toSavedLayout = (row: LayoutRow): SavedLayout | null => {
  const id = str(row.id);
  const name = str(row.name);
  if (!id || name === null) return null;
  return { id, name, config: row.config ?? {}, updated_at: str(row.updated_at) };
};

/** Owner-scoped read. A transport error is `unavailable` — never an empty library. */
export async function listLayouts(db: LayoutDb, userId: string): Promise<ListLayoutsResult> {
  const result = await db
    .from(LAYOUTS_TABLE)
    .select("id,name,config,updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  if (errOf(result)) return { ok: false, reason: "unavailable" };
  const layouts = rowsOf(result).map(toSavedLayout).filter((l): l is SavedLayout => l !== null);
  return { ok: true, layouts };
}

/** Insert-only write. Used by blank-name auto-save so a stale client list can never overwrite. */
async function createLayout(db: LayoutDb, userId: string, name: string, config: unknown): Promise<SaveLayoutResult> {
  // Best-effort pre-check. With the unique index applied this is belt-and-braces (the INSERT's
  // 23505 is what actually closes the race); without it, this is the only guard there is.
  const existing = await db.from(LAYOUTS_TABLE).select("id").eq("user_id", userId).eq("name", name).maybeSingle();
  if (errOf(existing)) return { ok: false, reason: "unavailable" };
  if (rowsOf(existing).length) return { ok: false, reason: "name_taken" };

  const inserted = await db
    .from(LAYOUTS_TABLE)
    .insert({ user_id: userId, name, config, updated_at: new Date().toISOString() })
    .select("id");
  const error = errOf(inserted);
  if (error) return { ok: false, reason: error.code === CODE_UNIQUE_VIOLATION ? "name_taken" : "unavailable" };
  const id = str(rowsOf(inserted)[0]?.id);
  return id ? { ok: true, id, created: true } : { ok: false, reason: "unavailable" };
}

/** Legacy select-then-write, used only while `unique (user_id, name)` is unapplied. */
async function overwriteWithoutConstraint(db: LayoutDb, userId: string, name: string, config: unknown): Promise<SaveLayoutResult> {
  const existing = await db.from(LAYOUTS_TABLE).select("id").eq("user_id", userId).eq("name", name).maybeSingle();
  if (errOf(existing)) return { ok: false, reason: "unavailable" };
  const existingId = str(rowsOf(existing)[0]?.id);
  if (existingId) {
    const updated = await db
      .from(LAYOUTS_TABLE)
      .update({ config, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("id", existingId)
      .select("id");
    if (errOf(updated)) return { ok: false, reason: "unavailable" };
    // A row that vanished between the SELECT and the UPDATE wrote nothing — reporting ok:true here
    // is exactly the "failed mutation reported as success" this module exists to stop.
    return rowsOf(updated).length ? { ok: true, id: existingId, created: false } : { ok: false, reason: "unavailable" };
  }
  return createLayout(db, userId, name, config);
}

/**
 * Authoritative save. `overwrite` mode is a single atomic upsert on (user_id, name) whenever the
 * constraint exists; `create` mode refuses an existing name outright.
 */
export async function saveLayout(
  db: LayoutDb,
  userId: string,
  input: { name: unknown; config: unknown; mode?: SaveMode },
): Promise<SaveLayoutResult> {
  const name = normalizeLayoutName(input.name);
  if (!name) return { ok: false, reason: "invalid_name" };
  const config = input.config ?? {};
  if (input.mode === "create") return createLayout(db, userId, name, config);

  const upserted = await db
    .from(LAYOUTS_TABLE)
    .upsert({ user_id: userId, name, config, updated_at: new Date().toISOString() }, { onConflict: "user_id,name" })
    .select("id");
  const error = errOf(upserted);
  if (error) {
    // 42P10 means only that the DDL has not been applied yet — degrade, don't fail the user's save.
    if (error.code === CODE_NO_CONFLICT_TARGET) return overwriteWithoutConstraint(db, userId, name, config);
    return { ok: false, reason: "unavailable" };
  }
  const id = str(rowsOf(upserted)[0]?.id);
  // `created` is not knowable from an upsert's returning clause; the client only needs "it is saved
  // under this name", and reports it as such.
  return id ? { ok: true, id, created: false } : { ok: false, reason: "unavailable" };
}

/**
 * Owner-scoped delete. Returns `not_found` when the statement matched no row, so the client can
 * tell "already gone" from "the store refused" instead of optimistically dropping it either way.
 */
export async function deleteLayout(db: LayoutDb, userId: string, id: unknown): Promise<DeleteLayoutResult> {
  const layoutId = str(id);
  if (!layoutId) return { ok: false, reason: "not_found" };
  const deleted = await db.from(LAYOUTS_TABLE).delete().eq("user_id", userId).eq("id", layoutId).select("id");
  if (errOf(deleted)) return { ok: false, reason: "unavailable" };
  return rowsOf(deleted).length ? { ok: true } : { ok: false, reason: "not_found" };
}
