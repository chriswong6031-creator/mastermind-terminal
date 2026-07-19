import type { Metadata } from "next";
import DiscoverWorkspace from "@/components/workspaces/DiscoverWorkspace";

// Discover workspace (Wave-2 IA) — find setups. Serves /discover under the (shell)
// route group; shared chrome from app/(shell)/layout.tsx. Composes the ex-/screener
// Stock Screener, the ex-/heatmap Heatmap, and the two ex-/flow tabs (Leaders,
// Leader Radar) under one WorkspaceTabs sub-nav (?tab=, default screener).
//
// email is read client-side from the AppShell context (useShellEmail), which the
// (shell) layout resolves once — no per-page auth read needed here. All view data
// is fetched client-side, so this page is a thin server shell (auto-dynamic via the
// layout's cookie read).

// Belt-and-suspenders vs the EdgeOne year-long s-maxage pin (the Wave-1 crash class):
// the (shell) layout's cookie read already makes this route dynamic, and next.config
// headers cap the edge cache at 5min — this export documents the cap and keeps it if
// either of those ever changes. (Old /screener|/heatmap|/flow pages carried the same.)
export const revalidate = 300;

export const metadata: Metadata = { title: "Discover · Mastermind Terminal" };

export default function DiscoverPage() {
  return <DiscoverWorkspace />;
}
