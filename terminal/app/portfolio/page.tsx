import { createClient } from "@/lib/supabase/server";
import PortfolioView from "@/components/PortfolioView";

export const dynamic = "force-dynamic";

export default async function PortfolioPage() {
  const supabase = await createClient();
  // getSession() is local (no Supabase round-trip); the watchlist queries below are
  // already RLS-scoped to the cookie's token, and email is display-only.
  const { data: { session } } = await supabase.auth.getSession();
  const { data: lists } = await supabase.from("watchlists").select("id").order("position").limit(1);
  let symbols: string[] = [];
  if (lists?.[0]) {
    const { data: syms } = await supabase.from("watchlist_symbols").select("symbol").eq("watchlist_id", lists[0].id).order("position");
    symbols = (syms || []).map((s: any) => s.symbol);
  }
  return <PortfolioView symbols={symbols} email={session?.user?.email || ""} />;
}
