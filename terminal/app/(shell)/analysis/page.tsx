import type { Metadata } from "next";
import AnalysisWorkspace from "@/components/workspaces/AnalysisWorkspace";

// Analysis workspace (Wave-2 IA) — the in-chart Fundamentals dashboard (MegaPane)
// promoted to its own route at /analysis, under the (shell) route group (route
// groups don't affect the path; shared chrome comes from app/(shell)/layout.tsx).
//
// All data is fetched CLIENT-side by AnalysisWorkspace (intel/fund/bars/quote per
// symbol), so there is no server payload to cache — this is a thin server shell.
// The (shell) layout reads auth cookies (auto-dynamic); this page adds nothing
// server-side.
//
// Mirrors app/(shell)/options/page.tsx: the revalidate export documents the 5min
// edge-cache cap (belt-and-suspenders vs the EdgeOne year-long s-maxage pin) and
// keeps it if the layout's dynamic cookie read or next.config headers ever change.
export const revalidate = 300;

export const metadata: Metadata = { title: "Analysis · Mastermind Terminal" };

export default function AnalysisPage() {
  return <AnalysisWorkspace />;
}
