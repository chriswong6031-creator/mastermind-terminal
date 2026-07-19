import { createClient } from "@/lib/supabase/server";
import PortfolioView from "@/components/PortfolioView";

// Moved under the (shell) route group in Wave-2; URL stays /portfolio (route
// groups don't affect the path). Chrome now comes from app/(shell)/layout.tsx —
// PortfolioView renders content-only. This page keeps its own user + watchlist
// read (data, not chrome).
//
// dynamic='auto': supabase reads cookies → Next auto-detects dynamic.

export default async function PortfolioPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: lists } = await supabase.from("watchlists").select("id").order("position").limit(1);
  let symbols: string[] = [];
  if (lists?.[0]) {
    const { data: syms } = await supabase.from("watchlist_symbols").select("symbol").eq("watchlist_id", lists[0].id).order("position");
    symbols = (syms || []).map((s: any) => s.symbol);
  }
  return <PortfolioView symbols={symbols} email={user?.email || ""} />;
}
