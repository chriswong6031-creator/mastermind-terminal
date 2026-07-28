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

export const metadata: Metadata = { title: "Discover · Mastermind Terminal" };

export default function DiscoverPage() {
  return <DiscoverWorkspace />;
}
