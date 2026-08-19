import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import PortfolioViewMount from "@/components/mounts/PortfolioViewMount";
import SignupGate from "@/components/gates/SignupGate";
import { listPositions, type Position } from "@/lib/portfolio";
import { createFixtureDb, fixtureUserId, FIXTURE_STORE_COOKIE } from "@/lib/watchlistsFixtureDb";

// W5: this page is the user's REAL portfolio.
//
// Until this wave it rendered WATCHLIST symbols under the name "Conviction Book" — a different
// population wearing the portfolio's name, which is the mismatch the commissioning packet exists
// to close (section 1d). `portfolio_positions` has been live in the shared Supabase project since
// <= 2026-07-18 with ZERO Terminal references; it is now the only thing this page reads.
//
// Watchlists are NOT here any more. Watchlist selection lives in the charting rail, where the job
// is "monitor names"; this page's job is "see what I hold" (packet section 6). A user with ten
// watchlists and no positions correctly sees an empty book — not ten tabs of somebody else's idea
// of their portfolio.
//
// Member surface: a book is per-user data (RLS-scoped), so signed-out visitors get the sign-up gate
// instead. The chart (/terminal) is what stays open to guests.
//
// Chrome comes from app/(shell)/layout.tsx — PortfolioView renders content-only.
// dynamic='auto': supabase reads cookies → Next auto-detects dynamic.

export default async function PortfolioPage() {
  // Deterministic responsive proof only. Production still fails closed through Supabase auth
  // below; this env flag exists solely in the Playwright dev server. The fixture path reads the
  // SAME service against the SAME account-shaped store `POST /api/portfolio` writes, so what a
  // spec creates is what this page renders — there is no parallel fixture truth to drift from.
  if (process.env.TERMINAL_E2E_FIXTURE === "1") {
    const key = (await cookies()).get(FIXTURE_STORE_COOKIE)?.value || "default";
    const positions = await listPositions(createFixtureDb(key), fixtureUserId(key));
    return (
      <PortfolioViewMount
        positions={positions}
        email={process.env.TERMINAL_E2E_EMAIL || "responsive@example.com"}
      />
    );
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return <SignupGate surface="portfolio" />;

  // RLS (`portfolio_select_own`) is the authority; the explicit `user_id` filter inside
  // `listPositions` is the same belt-and-braces the watchlist reads carry.
  let positions: Position[] = [];
  try {
    positions = await listPositions(supabase as never, user.id);
  } catch {
    // UWP-R6: the page never breaks because the store is unreachable. An unreadable book renders
    // its honest empty state rather than a 500 — and the client re-reads through /api/portfolio on
    // its first mutation, so a transient failure heals without a reload.
    positions = [];
  }
  return <PortfolioViewMount positions={positions} email={user.email || ""} />;
}
