import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import AlertsView from "@/components/AlertsView";

// Alerts (Wave-3 IA) — split back out of the former Automate page into its own
// /alerts route. Shared chrome from app/(shell)/layout.tsx. AlertsView is a client
// component that brings its own <main className="main2">; the page only resolves the
// signed-in email (auth reads cookies → auto-dynamic).

export const metadata: Metadata = { title: "Alerts · Mastermind Terminal" };

export default async function AlertsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return <AlertsView email={user?.email || ""} />;
}
