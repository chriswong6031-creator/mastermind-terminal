import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import AlertsView from "@/components/AlertsView";

// Alerts workspace — set-and-forget price/signal alerts. Serves /alerts under the
// (shell) route group (route groups don't affect the path); shared chrome from
// app/(shell)/layout.tsx. AlertsView renders content-only (<main className="main2">).
//
// AlertsView takes { email } for its own data reads; the (shell) layout resolves auth
// for the chrome, but Alerts keeps its own user read (data, not chrome). auth reads
// cookies → auto-dynamic.

export const metadata: Metadata = { title: "Alerts · Mastermind Terminal" };

export default async function AlertsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return <AlertsView email={user?.email || ""} />;
}
