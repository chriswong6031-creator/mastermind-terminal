import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Save a Pine script — Pro-gated SERVER-SIDE (not just hidden in the UI).
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { data: prof } = await supabase.from("profiles").select("is_pro").eq("id", user.id).single();
  if (!prof?.is_pro) return NextResponse.json({ error: "pro_required" }, { status: 403 });

  const { id, name, source, lang = "pine", params = {} } = await req.json();
  const res = id
    ? await supabase.from("saved_scripts").update({ name, source, params, updated_at: new Date().toISOString() }).eq("id", id).select("id").single()
    : await supabase.from("saved_scripts").insert({ user_id: user.id, name, source, lang, params }).select("id").single();
  if (res.error) return NextResponse.json({ error: res.error.message }, { status: 400 });
  return NextResponse.json({ ok: true, id: res.data.id });
}
