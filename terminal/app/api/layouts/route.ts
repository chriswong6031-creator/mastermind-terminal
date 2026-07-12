import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function ctx() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function GET() {
  const { supabase, user } = await ctx();
  if (!user) return NextResponse.json({ layouts: [] });
  const { data } = await supabase.from("chart_layouts").select("id,name,config,updated_at").eq("user_id", user.id).order("updated_at", { ascending: false });
  return NextResponse.json({ layouts: data || [] });
}

// Upsert by name (one named layout per user).
export async function POST(req: Request) {
  const { supabase, user } = await ctx();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const { name, config } = await req.json();
  if (!name) return NextResponse.json({ ok: false }, { status: 400 });
  const { data: existing } = await supabase.from("chart_layouts").select("id").eq("user_id", user.id).eq("name", name).maybeSingle();
  if (existing) {
    await supabase.from("chart_layouts").update({ config, updated_at: new Date().toISOString() }).eq("id", existing.id);
    return NextResponse.json({ ok: true, id: existing.id });
  }
  const { data, error } = await supabase.from("chart_layouts").insert({ user_id: user.id, name, config }).select("id").single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, id: data.id });
}

export async function DELETE(req: Request) {
  const { supabase, user } = await ctx();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (id) await supabase.from("chart_layouts").delete().eq("user_id", user.id).eq("id", id);
  return NextResponse.json({ ok: true });
}
