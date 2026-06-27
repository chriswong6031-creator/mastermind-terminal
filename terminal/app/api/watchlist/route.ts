import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Add/remove a symbol on the user's first watchlist (RLS-scoped to the owner).
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { action, symbol, section = "Watchlist" } = await req.json();
  if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });

  const { data: wl } = await supabase.from("watchlists").select("id").order("position").limit(1).single();
  if (!wl) return NextResponse.json({ error: "no watchlist" }, { status: 400 });

  if (action === "remove") {
    await supabase.from("watchlist_symbols").delete().eq("watchlist_id", wl.id).eq("symbol", symbol);
    return NextResponse.json({ ok: true });
  }
  // add (dedupe)
  const { data: ex } = await supabase.from("watchlist_symbols").select("id").eq("watchlist_id", wl.id).eq("symbol", symbol).maybeSingle();
  if (!ex) {
    const { count } = await supabase.from("watchlist_symbols").select("id", { count: "exact", head: true }).eq("watchlist_id", wl.id);
    await supabase.from("watchlist_symbols").insert({ watchlist_id: wl.id, symbol, section, position: count || 0 });
  }
  return NextResponse.json({ ok: true });
}
