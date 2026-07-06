import { createClient } from "@/lib/supabase/server";
import PortfolioView from "@/components/PortfolioView";

// dynamic='auto': supabase reads cookies → Next auto-detects dynamic; no need to force it.

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
