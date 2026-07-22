import type { Metadata } from "next";
import ScreenerWorkspace from "@/components/workspaces/ScreenerWorkspace";

// Screener workspace — find setups. Serves /screener under the (shell) route group
// (route groups don't affect the path); shared chrome from app/(shell)/layout.tsx.
// Composes the Stock Screener + the Heatmap under one WorkspaceTabs sub-nav
// (?tab=, default screener).
//
// email is read client-side from the AppShell context (useShellEmail), which the
// (shell) layout resolves once — no per-page auth read needed here. All view data
// is fetched client-side, so this page is a thin server shell (auto-dynamic via the
// layout's cookie read).

// Belt-and-suspenders vs the EdgeOne year-long s-maxage pin (the Wave-1 crash class):
// the (shell) layout's cookie read already makes this route dynamic, and next.config
// headers cap the edge cache at 5min — this export documents the cap and keeps it if
// either of those ever changes.
export const revalidate = 300;

export const metadata: Metadata = { title: "Screener · Mastermind Terminal" };

export default function ScreenerPage() {
  return <ScreenerWorkspace />;
}
