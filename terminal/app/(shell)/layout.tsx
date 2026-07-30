import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/chrome/AppShell";

/**
 * Route-group layout for every non-chart workspace (Discover / Research /
 * Automate / Portfolio / Admin). The route group `(shell)` does NOT affect the
 * URL — `app/(shell)/portfolio/page.tsx` still serves `/portfolio`.
 *
 * Auth is resolved ONCE here (the same supabase getUser() pattern the old
 * per-page routes used) and the email is handed to the shared AppShell, which
 * forwards it to MobileNav / SettingsButton and exposes it to client children via
 * useShellEmail(). Pages that need the user for data (portfolio watchlists,
 * scripts seeding, admin gate) still resolve it themselves — this read is for
 * the chrome only and is cheap/deduped by supabase's per-request client.
 *
 * This shell is explicitly dynamic and private because it contains auth state.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ShellLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const email =
    typeof data?.claims?.email === "string" ? data.claims.email : "";
  return <AppShell email={email}>{children}</AppShell>;
}
