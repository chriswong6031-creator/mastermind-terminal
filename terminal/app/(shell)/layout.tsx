import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/chrome/AppShell";

/**
 * Route-group layout for every non-chart workspace (Discover / Research /
 * Automate / Portfolio / Admin). The route group `(shell)` does NOT affect the
 * URL — `app/(shell)/portfolio/page.tsx` still serves `/portfolio`.
 *
 * Auth is resolved ONCE here (the same supabase getUser() pattern the old
 * per-page routes used) and the email is handed to the shared AppShell, which
 * forwards it to MobileNav / SettingsMenu and exposes it to client children via
 * useShellEmail(). Pages that need the user for data (portfolio watchlists,
 * scripts seeding, admin gate) still resolve it themselves — this read is for
 * the chrome only and is cheap/deduped by supabase's per-request client.
 *
 * supabase reads cookies → Next auto-detects this layout as dynamic; the child
 * pages keep their own revalidate/dynamic behavior.
 */
export default async function ShellLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return <AppShell email={user?.email || ""}>{children}</AppShell>;
}
