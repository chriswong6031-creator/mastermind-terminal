import { createClient } from "@/lib/supabase/server";
import PortfolioView from "@/components/PortfolioView";
import SignupGate from "@/components/gates/SignupGate";
import {
  buildServerPortfolioWatchlists,
  type PortfolioWatchlist,
} from "@/lib/portfolioWatchlists";

// Moved under the (shell) route group in Wave-2; URL stays /portfolio (route
// groups don't affect the path). Chrome now comes from app/(shell)/layout.tsx —
// PortfolioView renders content-only. This page keeps its own user + watchlist
// reads (data, not chrome).
//
// Member surface: a book with nothing in it is the whole page for a guest (the
// watchlist rows are RLS-scoped to the user), so signed-out visitors get the
// sign-up gate instead. The chart (/terminal) is what stays open to guests.
//
// All owner-scoped lists and their symbols are read through the existing RLS
// tables. There is no new API or persistence path: custom Terminal lists remain
// localStorage-only and PortfolioView reconciles them display-only in the browser.
//
// dynamic='auto': supabase reads cookies → Next auto-detects dynamic.

const E2E_LISTS: PortfolioWatchlist[] = [
  { id: "fixture-default", name: "Default", symbols: ["NVDA", "AAPL"] },
  { id: "fixture-income", name: "Income", symbols: ["QQQ"] },
];

export default async function PortfolioPage() {
  // Deterministic responsive proof only. Production still fails closed through
  // Supabase auth below; this env flag exists solely in the Playwright server.
  if (process.env.TERMINAL_E2E_FIXTURE === "1") {
    return <PortfolioView lists={E2E_LISTS} email={process.env.TERMINAL_E2E_EMAIL || "responsive@example.com"} />;
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return <SignupGate surface="portfolio" />;

  const { data: listRows } = await supabase
    .from("watchlists")
    .select("id,name,position")
    .eq("user_id", user.id)
    .order("position");
  const listIds = (listRows ?? []).map((list) => list.id);
  let symbolRows: { watchlist_id: string; symbol: string; position: number }[] = [];
  if (listIds.length) {
    const { data } = await supabase
      .from("watchlist_symbols")
      .select("watchlist_id,symbol,position")
      .in("watchlist_id", listIds)
      .order("position");
    symbolRows = data ?? [];
  }
  const lists = buildServerPortfolioWatchlists(listRows, symbolRows);
  return <PortfolioView lists={lists} email={user.email || ""} />;
}
