import { createClient } from "@/lib/supabase/server";
import TerminalShell from "@/components/TerminalShell";

export const dynamic = "force-dynamic";

export default async function Terminal() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // load or seed the user's first watchlist (idempotent via unique (user_id,name))
  const { data: lists0 } = await supabase.from("watchlists").select("id,name").order("position");
  let lists = lists0;
  if (!lists || lists.length === 0) {
    const { data: wl } = await supabase
      .from("watchlists").insert({ user_id: user!.id, name: "Default", position: 0 }).select("id").single();
    if (wl) {
      const seed = [["Crypto", "BTC-USD"], ["Crypto", "ETH-USD"], ["Equities", "NVDA"], ["Equities", "AAPL"], ["Equities", "MSFT"], ["Equities", "QQQ"]];
      await supabase.from("watchlist_symbols").insert(seed.map(([section, symbol], i) => ({ watchlist_id: wl.id, section, symbol, position: i })));
    }
    ({ data: lists } = await supabase.from("watchlists").select("id,name").order("position"));
  }
  const active = lists?.[0];
  if (!active) {
    return <main className="center"><div className="hero"><h1 style={{ fontSize: 20 }}>Setting up your workspace…</h1><p className="tag">One moment — provisioning your default watchlist.</p></div></main>;
  }
  const { data: syms } = await supabase
    .from("watchlist_symbols").select("symbol,section").eq("watchlist_id", active.id).order("position");

  return <TerminalShell symbols={(syms as any) || []} email={user?.email || ""} />;
}
