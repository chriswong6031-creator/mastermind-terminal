import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Keep interactive mutations bounded without regressing the existing bulk
// move/remove contract. Visual row order remains the established local
// watchlist preference until the backend has an atomic ordered-list RPC.
const MAX_BATCH = 500;

function cleanSymbols(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  const symbols = [...new Set(raw
    .filter((symbol): symbol is string => typeof symbol === "string")
    .map((symbol) => symbol.trim().toUpperCase())
    .filter((symbol) => !!symbol && symbol.length <= 128 && !/[\u0000-\u001f\u007f]/.test(symbol)))];
  return symbols.length <= MAX_BATCH ? symbols : [];
}

// Add/remove/move symbols on the user's first watchlist (RLS-scoped to the owner).
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  const action = body.action;
  const symbols = cleanSymbols(body.symbols ?? body.symbol);
  // Empty is intentional: it is the unsectioned run before the first divider.
  // Missing still keeps the legacy add contract's "Watchlist" fallback.
  const section = typeof body.section === "string" ? body.section.trim() : "Watchlist";
  if (!symbols.length) return NextResponse.json({ error: "symbol required or batch too large" }, { status: 400 });
  if (section.length > 80 || /[\u0000-\u001f\u007f]/.test(section)) {
    return NextResponse.json({ error: "invalid section" }, { status: 400 });
  }

  const { data: wl } = await supabase.from("watchlists").select("id").eq("user_id", user.id).order("position").limit(1).single();
  if (!wl) return NextResponse.json({ error: "no watchlist" }, { status: 400 });

  if (action === "remove") {
    let q = supabase.from("watchlist_symbols").delete().eq("watchlist_id", wl.id);
    q = symbols.length === 1 ? q.eq("symbol", symbols[0]) : q.in("symbol", symbols);
    const { error } = await q;
    if (error) return NextResponse.json({ error: "watchlist update failed" }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  if (action === "move") {
    let q = supabase.from("watchlist_symbols").update({ section }).eq("watchlist_id", wl.id);
    q = symbols.length === 1 ? q.eq("symbol", symbols[0]) : q.in("symbol", symbols);
    const { error } = await q;
    if (error) return NextResponse.json({ error: "watchlist update failed" }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  if (action !== "add") return NextResponse.json({ error: "unsupported action" }, { status: 400 });
  if (symbols.length !== 1) return NextResponse.json({ error: "add accepts one symbol" }, { status: 400 });
  const symbol = symbols[0];
  // add (dedupe)
  const { data: ex } = await supabase.from("watchlist_symbols").select("id").eq("watchlist_id", wl.id).eq("symbol", symbol).maybeSingle();
  if (!ex) {
    const { count } = await supabase.from("watchlist_symbols").select("id", { count: "exact", head: true }).eq("watchlist_id", wl.id);
    await supabase.from("watchlist_symbols").insert({ watchlist_id: wl.id, symbol, section, position: count || 0 });
  }
  return NextResponse.json({ ok: true });
}
