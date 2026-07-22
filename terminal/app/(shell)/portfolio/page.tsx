import { createClient } from "@/lib/supabase/server";
import PortfolioView from "@/components/PortfolioView";

// URL stays /portfolio (route groups don't affect the path). Chrome comes from
// app/(shell)/layout.tsx — PortfolioView renders content-only. This page keeps its
// own user + watchlist read (data, not chrome).
//
// Loads ALL of the user's watchlists (not just the first) + their symbols so
// PortfolioView can offer a switcher — some people keep multiple lists. Symbols are
// pulled in one query keyed by list id and grouped in memory, then handed down as
// { id, name, symbols }[]. Guests (login disabled in prod) get an empty array and
// PortfolioView falls back to the client-side mm.wls lists.
//
// dynamic='auto': supabase reads cookies → Next auto-detects dynamic.

type WList = { id: string; name: string; symbols: string[] };

export default async function PortfolioPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: lists } = await supabase.from("watchlists").select("id,name").order("position");
  let serverLists: WList[] = [];
  if (lists?.length) {
    const ids = lists.map((l: any) => l.id);
    const { data: syms } = await supabase
      .from("watchlist_symbols")
      .select("watchlist_id,symbol")
      .in("watchlist_id", ids)
      .order("position");
    const byList: Record<string, string[]> = {};
    (syms || []).forEach((s: any) => { (byList[s.watchlist_id] ||= []).push(s.symbol); });
    serverLists = lists.map((l: any) => ({ id: String(l.id), name: l.name || "Watchlist", symbols: byList[l.id] || [] }));
  }
  return <PortfolioView lists={serverLists} email={user?.email || ""} />;
}
