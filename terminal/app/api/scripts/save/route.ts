import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isPaidTier } from "@/lib/entitlement";

// Save a Pine script — PAID-gated SERVER-SIDE against the macro-api entitlement
// (any paid tier via /api/me), NOT profiles.is_pro (a UI hint; see AGENTS.md).
export async function POST(req: Request) {
  // e2e seam (TERMINAL_E2E_FIXTURE=1 only) — see lib/scriptsFixtureDb.ts. The editor's
  // save-becomes-baseline contract is only meaningful against a store that actually persists, so
  // the spec drives the REAL route and the real component; only the table is a stand-in.
  if (process.env.TERMINAL_E2E_FIXTURE === "1") {
    const { cookies } = await import("next/headers");
    const { saveFixtureScript, SCRIPTS_FIXTURE_COOKIE } = await import("@/lib/scriptsFixtureDb");
    const key = (await cookies()).get(SCRIPTS_FIXTURE_COOKIE)?.value || "default";
    const body = await req.json().catch(() => null);
    if (!body || typeof body.name !== "string" || typeof body.source !== "string") {
      return NextResponse.json({ error: "Could not save script" }, { status: 400 });
    }
    const id = saveFixtureScript(key, body);
    return NextResponse.json({ ok: true, id });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  if (!(await isPaidTier())) return NextResponse.json({ error: "pro_required" }, { status: 403 });

  const { id, name, source, lang = "pine", params = {} } = await req.json();
  const res = id
    ? await supabase.from("saved_scripts").update({ name, source, params, updated_at: new Date().toISOString() }).eq("id", id).select("id").single()
    : await supabase.from("saved_scripts").insert({ user_id: user.id, name, source, lang, params }).select("id").single();
  if (res.error) {
    console.error("scripts/save POST failed:", res.error);
    return NextResponse.json({ error: "Could not save script" }, { status: 400 });
  }
  return NextResponse.json({ ok: true, id: res.data.id });
}
