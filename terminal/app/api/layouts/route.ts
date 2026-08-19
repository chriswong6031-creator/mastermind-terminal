import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { deleteLayout, listLayouts, saveLayout, type LayoutDb, type SaveMode } from "@/lib/layouts";
import { createLayoutFixtureDb, fixtureLayoutUserId, GUEST_COOKIE, LAYOUT_FAULT_COOKIE, LAYOUT_STORE_COOKIE, type LayoutFault } from "@/lib/layoutsFixtureDb";

// Saved chart layouts (S6) — per-user persisted workspaces. Thin HTTP shell; every rule lives in
// `lib/layouts.ts`, which is where the reasoning about names, atomicity and failure states is
// written down.
//
// What changed, and why it matters more than it looks:
//
//   * GET no longer answers `200 {layouts: []}` for a guest OR for a failed query. Those are three
//     different facts — "sign in", "you have none", "the store is down" — and flattening them is
//     what let a Supabase outage read as an empty library and a guest read as a saveable workspace.
//     Guests now get 401; a transport failure gets 503 `layouts_unavailable`.
//   * POST/DELETE only report success when the authoritative write actually succeeded. The previous
//     implementation ignored the UPDATE and DELETE results entirely and returned `{ok:true}`
//     unconditionally, so a failed delete vanished from the UI and reappeared on the next load.
//   * POST takes an explicit `mode`. "create" (used by blank-name auto-save) refuses an existing
//     name with 409 instead of overwriting it; "overwrite" is the user deliberately typing a name
//     they already have. The old single path made every save an overwrite, which is how an
//     auto-generated name could silently destroy an unrelated layout.

const isE2eFixture = () => process.env.TERMINAL_E2E_FIXTURE === "1";

/** Fixture transport for the Playwright dev server; the real RLS'd client everywhere else. */
async function resolveDb(): Promise<{ db: LayoutDb; userId: string } | null> {
  if (isE2eFixture()) {
    const jar = await cookies();
    // The guest spec needs the API to agree with the page: one cookie drives both.
    if (jar.get(GUEST_COOKIE)?.value === "1") return null;
    const key = jar.get(LAYOUT_STORE_COOKIE)?.value || "default";
    const fault = (jar.get(LAYOUT_FAULT_COOKIE)?.value || "") as LayoutFault;
    return { db: createLayoutFixtureDb(key, fault), userId: fixtureLayoutUserId(key) };
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  return { db: supabase as unknown as LayoutDb, userId: user.id };
}

const unauthenticated = () => NextResponse.json({ error: "unauthenticated" }, { status: 401 });
const unavailable = () => NextResponse.json({ error: "layouts_unavailable" }, { status: 503 });

export async function GET() {
  const ctx = await resolveDb();
  if (!ctx) return unauthenticated();
  const result = await listLayouts(ctx.db, ctx.userId);
  if (!result.ok) return unavailable();
  return NextResponse.json({ layouts: result.layouts });
}

export async function POST(req: Request) {
  const ctx = await resolveDb();
  if (!ctx) return unauthenticated();

  let body: { name?: unknown; config?: unknown; mode?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_body" }, { status: 400 }); }

  const mode: SaveMode = body.mode === "create" ? "create" : "overwrite";
  const result = await saveLayout(ctx.db, ctx.userId, { name: body.name, config: body.config, mode });
  if (result.ok) return NextResponse.json({ ok: true, id: result.id });
  if (result.reason === "invalid_name") return NextResponse.json({ error: "invalid_name" }, { status: 400 });
  if (result.reason === "name_taken") return NextResponse.json({ error: "name_taken" }, { status: 409 });
  return unavailable();
}

export async function DELETE(req: Request) {
  const ctx = await resolveDb();
  if (!ctx) return unauthenticated();

  const id = new URL(req.url).searchParams.get("id");
  const result = await deleteLayout(ctx.db, ctx.userId, id);
  if (result.ok) return NextResponse.json({ ok: true });
  // "not_found" is a legitimate end state for the client (the row is gone either way) but it is NOT
  // a successful delete, so it does not get to wear `ok:true`.
  if (result.reason === "not_found") return NextResponse.json({ error: "not_found" }, { status: 404 });
  return unavailable();
}
