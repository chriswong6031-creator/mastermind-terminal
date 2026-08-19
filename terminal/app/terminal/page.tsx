import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { GUEST_COOKIE } from "@/lib/layoutsFixtureDb";
import TerminalShell from "@/components/TerminalShell";
import { criticalTerminalDataUrls } from "@/lib/terminalBoot";
import { preload } from "react-dom";

// dynamic='auto': supabase reads cookies → Next auto-detects dynamic; no need to force it.

export default async function Terminal({ searchParams }: { searchParams: Promise<{ sym?: string; symbol?: string; shell?: string; tray?: string; dossier?: string }> }) {
  const sp = await searchParams;
  const initialSymbol = sp?.symbol ?? sp?.sym;
  // ?shell=app — the installable apps' WebView mode: chart-only chrome + window.__mmShell bridge.
  const shellMode = sp?.shell === "app";
  // ?tray=1 (shell mode only) — keeps the TF quick tray visible; the symbol-preview sheet
  // embeds the full chart and has no native roller to own the interval.
  const shellTray = shellMode && sp?.tray === "1";
  // ?dossier=1 (shell mode only) — the detail rail becomes the ONLY content and the chart
  // workspace is not rendered at all; the native symbol sheet draws its own chart above it.
  const shellDossier = shellMode && sp?.dossier === "1";
  // Start the two chart-blocking JSON requests while the browser is still
  // downloading/hydrating the Terminal JavaScript. getSliceAndOhlc() reuses
  // these same-origin preloads when ChartPanel mounts.
  //
  // ⚠️ crossOrigin MUST stay "anonymous" so the preload is actually reused. The browser
  // matches a preload against a later fetch by request mode + credentials mode, not by
  // effective behavior. dataCache's `fetch(url)` is mode "cors" / credentials "same-origin";
  // "anonymous" is the only crossOrigin value that produces that same pair. Both alternatives
  // silently MISS and download the payload a second time — verified in-browser: "use-credentials"
  // (mode cors / credentials include) and omitting crossOrigin entirely (mode no-cors /
  // credentials include) each cost a full extra fetch of both files, ~141 KB on production's
  // critical path, delaying first chart paint by exactly what the preload was meant to save.
  for (const href of criticalTerminalDataUrls(initialSymbol)) {
    preload(href, {
      as: "fetch",
      crossOrigin: "anonymous",
      fetchPriority: "high",
    });
  }
  // Browser smoke tests exercise the real responsive shell with checked-in market fixtures. They
  // deliberately skip remote auth so CI remains deterministic and never depends on Supabase.
  // The second-resolution band is real-time-derived, so it rides the same operator lever as
  // the real-time quote leg (HUB_REALTIME_QUOTES). Read HERE, on the server, and handed down
  // as a prop: a NEXT_PUBLIC_ twin would put a second switch in play and let the two drift.
  // Default OFF — /api/intraday refuses the band unless this is set, so the picker must agree.
  const secondBarsEnabled = process.env.HUB_REALTIME_QUOTES === "1";
  const e2eFixture = process.env.TERMINAL_E2E_FIXTURE === "1";
  const guestSymbols: [string, string][] = [["Crypto", "BTC-USD"], ["Crypto", "ETH-USD"], ["Equities", "NVDA"], ["Equities", "AAPL"], ["Equities", "MSFT"], ["Equities", "QQQ"]];
  if (e2eFixture) {
    // The fixture server signs every session in (TERMINAL_E2E_EMAIL), which leaves the signed-OUT
    // workspace — the one that carried a Save button wired to a guaranteed 401 — untestable. One
    // cookie renders a genuine guest, and `/api/layouts` honours the same cookie, so the page and
    // the API agree about who is asking. Fixture branch only: unreachable in production.
    const guest = (await cookies()).get(GUEST_COOKIE)?.value === "1";
    return <TerminalShell symbols={guestSymbols.map(([section, symbol]) => ({ symbol, section }))} email={guest ? "" : (process.env.TERMINAL_E2E_EMAIL || "")} initialSymbol={initialSymbol} shellMode={shellMode} shellTray={shellTray} shellDossier={shellDossier} secondBarsEnabled={secondBarsEnabled} />;
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // login disabled for now — render an open guest workspace (no server-side persistence)
  if (!user) {
    return <TerminalShell symbols={guestSymbols.map(([section, symbol]) => ({ symbol, section }))} email="" initialSymbol={initialSymbol} shellMode={shellMode} shellTray={shellTray} shellDossier={shellDossier} secondBarsEnabled={secondBarsEnabled} />;
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
    const { T } = await import("@/components/LocalizedCopy");
    return <main className="center"><div className="hero"><T as="h1" k="provSettingUp" style={{ fontSize: 20 }} /><T as="p" k="provOneMoment" className="tag" /><ProvisioningRetry /></div></main>;
  }
  const { data: syms } = await supabase
    .from("watchlist_symbols").select("symbol,section").eq("watchlist_id", active.id).order("position");

  return <TerminalShell symbols={(syms as any) || []} email={user?.email || ""} initialSymbol={initialSymbol} shellMode={shellMode} shellTray={shellTray} shellDossier={shellDossier} secondBarsEnabled={secondBarsEnabled} />;
}
