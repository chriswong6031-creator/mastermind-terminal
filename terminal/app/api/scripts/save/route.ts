import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isPaidTier } from "@/lib/entitlement";

// Save a Pine script — PAID-gated SERVER-SIDE against the macro-api entitlement
// (any paid tier via /api/me), NOT profiles.is_pro (a UI hint; see AGENTS.md).
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  if (!(await isPaidTier())) return NextResponse.json({ error: "pro_required" }, { status: 403 });

  const { id, name, source, lang = "pine", params = {} } = await req.json();
  const res = id
    ? await supabase.from("saved_scripts").update({ name, source, params, updated_at: new Date().toISOString() }).eq("id", id).select("id").single()
    : await supabase.from("saved_scripts").insert({ user_id: user.id, name, source, lang, params }).select("id").single();
  if (res.error) return NextResponse.json({ error: res.error.message }, { status: 400 });
  return NextResponse.json({ ok: true, id: res.data.id });
}
