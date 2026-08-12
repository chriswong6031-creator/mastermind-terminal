import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createFixtureDb, fixtureUserId, FIXTURE_STORE_COOKIE } from "@/lib/watchlistsFixtureDb";
import {
  addSymbols,
  createList,
  deleteList,
  listWatchlists,
  moveSymbols,
  normalizeListName,
  normalizeSection,
  normalizeSymbols,
  removeSymbols,
  renameList,
  resolveTargetList,
  type WatchlistDb,
} from "@/lib/watchlists";

// Owner-scoped watchlist API (RLS does the enforcing; every query is user-filtered as well).
//
// W1b changed three things and kept everything else:
//   * actions target a LIST (`listId`, or exact `listName`) instead of always resolving the
//     user's first row — the old `.limit(1).single()` meant a user with three lists could only
//     ever write to one of them;
//   * `add` takes a batch, matching `remove`/`move` (previously plural adds were rejected 400);
//   * list CRUD exists at all — `createList` / `renameList` / `deleteList`. Until now no server
//     path in EITHER product could create, rename or delete a watchlist row, so every named list
//     a Terminal user made was localStorage-only.
// A request that names no list still falls back to the first list, so pre-W1b clients and the
// Default fire-and-forget syncs behave exactly as before.

const isE2eFixture = () => process.env.TERMINAL_E2E_FIXTURE === "1";

/** Fixture transport for the Playwright dev server; the real RLS'd client everywhere else. */
async function resolveDb(): Promise<{ db: WatchlistDb; userId: string } | null> {
  if (isE2eFixture()) {
    const key = (await cookies()).get(FIXTURE_STORE_COOKIE)?.value || "default";
    return { db: createFixtureDb(key), userId: fixtureUserId(key) };
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  return { db: supabase as unknown as WatchlistDb, userId: user.id };
}

const unauthenticated = () => NextResponse.json({ error: "unauthenticated" }, { status: 401 });
const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

/** The signed-in user's complete list inventory — what TerminalShell reads to become server-backed. */
export async function GET() {
  const session = await resolveDb();
  if (!session) return unauthenticated();
  const lists = await listWatchlists(session.db, session.userId);
  return NextResponse.json({ lists });
}

export async function POST(req: Request) {
  const session = await resolveDb();
  if (!session) return unauthenticated();
  const { db, userId } = session;

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return fail("invalid JSON", 400);
  const action = body.action;

  // ── list CRUD ──────────────────────────────────────────────────────────────
  if (action === "createList") {
    const name = normalizeListName(body.name);
    if (!name) return fail("invalid name", 400);
    const { list, error } = await createList(db, userId, name);
    if (!list) return fail(error || "create failed", 500);
    return NextResponse.json({ ok: true, list });
  }
  if (action === "renameList") {
    const listId = typeof body.listId === "string" ? body.listId.trim() : "";
    if (!listId) return fail("listId required", 400);
    const result = await renameList(db, userId, listId, body.name as string);
    if (!result.ok) return fail(result.error || "watchlist update failed", result.status || 500);
    return NextResponse.json({ ok: true });
  }
  if (action === "deleteList") {
    const listId = typeof body.listId === "string" ? body.listId.trim() : "";
    if (!listId) return fail("listId required", 400);
    const result = await deleteList(db, userId, listId);
    if (!result.ok) return fail(result.error || "watchlist update failed", result.status || 500);
    return NextResponse.json({ ok: true });
  }

  // ── symbol ops ─────────────────────────────────────────────────────────────
  if (action !== "add" && action !== "remove" && action !== "move") return fail("unsupported action", 400);

  const symbols = normalizeSymbols(body.symbols ?? body.symbol);
  const section = normalizeSection(body.section);
  if (!symbols.length) return fail("symbol required or batch too large", 400);
  if (!section) return fail("invalid section", 400);

  const list = await resolveTargetList(db, userId, { listId: body.listId, listName: body.listName });
  if (!list) return fail("no watchlist", 400);

  if (action === "remove") {
    const result = await removeSymbols(db, list.id, symbols);
    if (!result.ok) return fail(result.error || "watchlist update failed", 500);
    return NextResponse.json({ ok: true });
  }
  if (action === "move") {
    const result = await moveSymbols(db, list.id, symbols, section);
    if (!result.ok) return fail(result.error || "watchlist update failed", 500);
    return NextResponse.json({ ok: true });
  }
  // add — batched, deduped against the list, appended after its current tail. The optional
  // `sections` map lets one request carry each symbol's own section, which is what the shell's
  // one-time migration needs to preserve a local list's grouping in a single call.
  const sections = body.sections && typeof body.sections === "object" && !Array.isArray(body.sections)
    ? Object.fromEntries(Object.entries(body.sections as Record<string, unknown>)
      .map(([symbol, value]) => [symbol.trim().toUpperCase(), normalizeSection(value, section) ?? section]))
    : undefined;
  const result = await addSymbols(db, list.id, symbols, section, sections);
  if (!result.ok) return fail(result.error || "watchlist update failed", 500);
  return NextResponse.json({ ok: true, added: result.added });
}
