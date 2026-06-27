import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function uid() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function GET() {
  const { supabase, user } = await uid();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { data } = await supabase.from("alerts").select("*").order("created_at", { ascending: false });
  return NextResponse.json({ alerts: data || [] });
}

export async function POST(req: Request) {
  const { supabase, user } = await uid();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { symbol, condition } = await req.json();
  if (!symbol || !condition) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const { data, error } = await supabase.from("alerts").insert({ user_id: user.id, symbol, condition }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ alert: data });
}

export async function DELETE(req: Request) {
  const { supabase, user } = await uid();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (id) await supabase.from("alerts").delete().eq("id", id);
  return NextResponse.json({ ok: true });
}
