import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import AnalysisWorkspace from "@/components/workspaces/AnalysisWorkspace";
import SignupGate from "@/components/gates/SignupGate";

// Analysis workspace (Wave-2 IA) — the in-chart Fundamentals dashboard (MegaPane)
// promoted to its own route at /analysis, under the (shell) route group (route
// groups don't affect the path; shared chrome comes from app/(shell)/layout.tsx).
//
// All data is fetched CLIENT-side by AnalysisWorkspace (intel/fund/bars/quote per
// symbol), so there is no server payload to cache — this is a thin server shell.
// The (shell) layout reads auth cookies (auto-dynamic); this page only adds the
// signed-out gate.
//
// Member surface: the chart (/terminal) is open to guests, this desk is not.
// getClaims verifies the JWT locally (the same read the (shell) layout does for
// chrome) — no Auth round-trip unless a refresh is due.

export const metadata: Metadata = { title: "Analysis · Mastermind Terminal" };

export default async function AnalysisPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (typeof data?.claims?.sub !== "string") return <SignupGate surface="analysis" />;
  return <AnalysisWorkspace />;
}
