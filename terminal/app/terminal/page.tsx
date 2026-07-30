import { createClient } from "@/lib/supabase/server";
import TerminalShell from "@/components/TerminalShell";

// dynamic='auto': supabase reads cookies → Next auto-detects dynamic; no need to force it.

export default async function Terminal({ searchParams }: { searchParams: Promise<{ sym?: string; symbol?: string }> }) {
  const sp = await searchParams;
  // Browser smoke tests exercise the real responsive shell with checked-in market fixtures. They
  // deliberately skip remote auth so CI remains deterministic and never depends on Supabase.
  const e2eFixture = process.env.TERMINAL_E2E_FIXTURE === "1";
  const guestSymbols: [string, string][] = [["Crypto", "BTC-USD"], ["Crypto", "ETH-USD"], ["Equities", "NVDA"], ["Equities", "AAPL"], ["Equities", "MSFT"], ["Equities", "QQQ"]];
  if (e2eFixture) {
    return <TerminalShell symbols={guestSymbols.map(([section, symbol]) => ({ symbol, section }))} email="" initialSymbol={sp?.symbol ?? sp?.sym} />;
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // login disabled for now — render an open guest workspace (no server-side persistence)
  if (!user) {
    return <TerminalShell symbols={guestSymbols.map(([section, symbol]) => ({ symbol, section }))} email="" initialSymbol={sp?.symbol ?? sp?.sym} />;
  }

  // load or seed the user's first watchlist (idempotent via unique (user_id,name)).
  // UPSERT, not insert: right after signup the router.refresh and the page load race
  // this block concurrently — a plain insert made the loser error out and fall through
  // with no row visible yet (operator-reported stuck "Setting up your workspace").
  const { data: lists0 } = await supabase.from("watchlists").select("id,name").order("position");
  let lists = lists0;
  if (!lists || lists.length === 0) {
    const { data: wl } = await supabase
      .from("watchlists")
      .upsert({ user_id: user!.id, name: "Default", position: 0 }, { onConflict: "user_id,name" })
      .select("id").single();
    if (wl) {
      const seed = [["Crypto", "BTC-USD"], ["Crypto", "ETH-USD"], ["Equities", "NVDA"], ["Equities", "AAPL"], ["Equities", "MSFT"], ["Equities", "QQQ"]];
      // Seed symbols only when the list is empty (the concurrent winner may have seeded).
      const { count } = await supabase.from("watchlist_symbols")
        .select("watchlist_id", { count: "exact", head: true }).eq("watchlist_id", wl.id);
      if (!count) {
        await supabase.from("watchlist_symbols").insert(seed.map(([section, symbol], i) => ({ watchlist_id: wl.id, section, symbol, position: i })));
      }
    }
    // Re-read with a short backoff — the concurrent request's commit can land a beat later.
    for (let attempt = 0; attempt < 3; attempt++) {
      ({ data: lists } = await supabase.from("watchlists").select("id,name").order("position"));
      if (lists && lists.length > 0) break;
      await new Promise((r) => setTimeout(r, 350));
    }
  }
  const active = lists?.[0];
  if (!active) {
    // Still nothing after the retries — render the honest holding screen, but with
    // AUTO-RECOVERY (bounded refresh loop + manual Retry), never a dead end.
    const { default: ProvisioningRetry } = await import("@/components/ProvisioningRetry");
    return <main className="center"><div className="hero"><h1 style={{ fontSize: 20 }}>Setting up your workspace…</h1><p className="tag">One moment — provisioning your default watchlist.</p><ProvisioningRetry /></div></main>;
  }
  const { data: syms } = await supabase
    .from("watchlist_symbols").select("symbol,section").eq("watchlist_id", active.id).order("position");

  return <TerminalShell symbols={(syms as any) || []} email={user?.email || ""} initialSymbol={sp?.symbol ?? sp?.sym} />;
}
