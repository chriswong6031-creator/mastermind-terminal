import type { Metadata } from "next";
import ResearchWorkspace from "@/components/workspaces/ResearchWorkspace";

// Research workspace (Wave-2 IA) — market/options intelligence. Serves /research
// under the (shell) route group (route groups don't affect the path); the shared
// chrome comes from app/(shell)/layout.tsx. This is the ex-/flow OptionsHubView
// engine, now driven by the page-level WorkspaceTabs (see ResearchWorkspace).
//
// All data is fetched CLIENT-side by the hub (flowGet, ~25s SWR), so there is no
// server payload to cache — the page is a thin server shell. The (shell) layout
// reads auth cookies (auto-dynamic); this page adds nothing server-side.

// Belt-and-suspenders vs the EdgeOne year-long s-maxage pin (the Wave-1 crash class):
// the (shell) layout's cookie read already makes this route dynamic, and next.config
// headers cap the edge cache at 5min — this export documents the cap and keeps it if
// either of those ever changes. (Old /screener|/heatmap|/flow pages carried the same.)
export const revalidate = 300;

export const metadata: Metadata = { title: "Research · Mastermind Terminal" };

export default function ResearchPage() {
  return <ResearchWorkspace />;
}
