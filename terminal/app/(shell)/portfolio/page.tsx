import { createClient } from "@/lib/supabase/server";
import PortfolioView from "@/components/PortfolioView";
import SignupGate from "@/components/gates/SignupGate";

// Moved under the (shell) route group in Wave-2; URL stays /portfolio (route
// groups don't affect the path). Chrome now comes from app/(shell)/layout.tsx —
// PortfolioView renders content-only. This page keeps its own user + watchlist
// read (data, not chrome).
//
// Member surface: a book with nothing in it is the whole page for a guest (the
// watchlist rows are RLS-scoped to the user), so signed-out visitors get the
// sign-up gate instead. The chart (/terminal) is what stays open to guests.
//
// dynamic='auto': supabase reads cookies → Next auto-detects dynamic.

export default async function PortfolioPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return <SignupGate surface="portfolio" />;

  const { data: lists } = await supabase.from("watchlists").select("id").order("position").limit(1);
  let symbols: string[] = [];
  if (lists?.[0]) {
    const { data: syms } = await supabase.from("watchlist_symbols").select("symbol").eq("watchlist_id", lists[0].id).order("position");
    symbols = (syms || []).map((s: any) => s.symbol);
  }
  return <PortfolioView symbols={symbols} email={user.email || ""} />;
}
