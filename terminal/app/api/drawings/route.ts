import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function ctx() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function GET(req: Request) {
  const { supabase, user } = await ctx();
  if (!user) return NextResponse.json({ drawings: [] });
  const symbol = new URL(req.url).searchParams.get("symbol");
  // Owner filter in code as well as RLS: never rely on a single boundary for user data.
  let q = supabase.from("drawings").select("*").eq("user_id", user.id);
  if (symbol) q = q.eq("symbol", symbol);
  const { data, error } = await q;
  if (error) {
    console.error("drawings GET failed:", error);
    return NextResponse.json({ drawings: [], error: "Could not load drawings" });
  }
  const drawings = (data || []).map((r: any) => ({ id: r.id, kind: r.kind, ...(r.data || {}) }));
  return NextResponse.json({ drawings });
}

// Replace-all for a symbol (hand-drawn only; auto/detected drawings are never persisted).
export async function PUT(req: Request) {
  const { supabase, user } = await ctx();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const { symbol, drawings } = await req.json();
  if (!symbol) return NextResponse.json({ ok: false }, { status: 400 });
  await supabase.from("drawings").delete().eq("user_id", user.id).eq("symbol", symbol);
  const rows = (drawings || [])
    .filter((d: any) => !d.auto)
    .map((d: any) => ({ user_id: user.id, symbol, kind: d.kind, data: { points: d.points, color: d.color, text: d.text, width: d.width, dash: d.dash, fontSize: d.fontSize, meta: d.meta } }));
  if (rows.length) {
    const { error } = await supabase.from("drawings").insert(rows);
    if (error) {
      console.error("drawings PUT failed:", error);
      return NextResponse.json({ ok: false, error: "Could not save drawings" }, { status: 400 });
    }
  }
  return NextResponse.json({ ok: true });
}
