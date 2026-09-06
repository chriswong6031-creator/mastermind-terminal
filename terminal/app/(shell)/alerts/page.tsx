import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import AlertsCockpitMount from "@/components/alerts/AlertsCockpitMount";
import SignupGate from "@/components/gates/SignupGate";

// Alerts (Wave-3 IA) — split back out of the former Automate page into its own
// /alerts route. Shared chrome from app/(shell)/layout.tsx. AlertsCockpit is a
// client component that brings its own <main className="main2">; the page only
// resolves the signed-in email (auth reads cookies → auto-dynamic).
//
// Member surface: an alert is a row on the user's account that the 5-min VPS cron
// evaluates, so there is nothing a guest can create here — signed-out visitors get
// the sign-up gate. The chart (/terminal) is what stays open to guests.
//
// B-F08-3: swapped AlertsViewMount -> AlertsCockpitMount (monitor/delivery cockpit).
// Both existing branches (E2E fixture, SignupGate) are kept verbatim.

export const metadata: Metadata = { title: "Alerts · Mastermind Terminal" };

export default async function AlertsPage() {
  if (process.env.TERMINAL_E2E_FIXTURE === "1") {
    return <AlertsCockpitMount email={process.env.TERMINAL_E2E_EMAIL || "responsive@example.com"} />;
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return <SignupGate surface="alerts" />;
  return <AlertsCockpitMount email={user.email || ""} />;
}
