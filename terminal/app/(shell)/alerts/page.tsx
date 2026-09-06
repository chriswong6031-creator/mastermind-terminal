import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import AlertsCockpitMount from "@/components/alerts/AlertsCockpitMount";
import AlertsViewMount from "@/components/mounts/AlertsViewMount";
import SignupGate from "@/components/gates/SignupGate";

// Alerts (Wave-3 IA) — split back out of the former Automate page into its own
// /alerts route. Shared chrome from app/(shell)/layout.tsx. Both mounts below are
// client components that bring their own <main className="main2">; the page only
// resolves the signed-in email (auth reads cookies → auto-dynamic).
//
// Member surface: an alert is a row on the user's account that the 5-min VPS cron
// evaluates, so there is nothing a guest can create here — signed-out visitors get
// the sign-up gate. The chart (/terminal) is what stays open to guests.
//
// B-F08-3: the monitor/delivery cockpit (AlertsCockpitMount) composes ABOVE the
// existing create/pause/delete management view — it augments that surface, it does
// not replace it. The cockpit renders its own create form inline (NewAlertPanel,
// id="alerts-manage" — the cockpit's own "Add a watch" empty-state action scrolls
// there); this page mounts ONLY the existing-alerts list (ExistingAlertsPanel via
// `listOnly`) below it, so pause/rearm/delete stay reachable without a second,
// duplicate "New alert" form on the page.

export const metadata: Metadata = { title: "Alerts · Mastermind Terminal" };

function AlertsSurfaces({ email }: { email: string }) {
  return (
    <>
      <AlertsCockpitMount email={email} />
      <AlertsViewMount email={email} listOnly />
    </>
  );
}

export default async function AlertsPage() {
  if (process.env.TERMINAL_E2E_FIXTURE === "1") {
    return <AlertsSurfaces email={process.env.TERMINAL_E2E_EMAIL || "responsive@example.com"} />;
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return <SignupGate surface="alerts" />;
  return <AlertsSurfaces email={user.email || ""} />;
}
