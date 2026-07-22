import type { Metadata } from "next";
import OptionsWorkspace from "@/components/workspaces/OptionsWorkspace";

// Options Flow workspace — market/options intelligence. Serves /options under the
// (shell) route group (route groups don't affect the path); the shared chrome comes
// from app/(shell)/layout.tsx. This is the OptionsHubView engine (ex-/research,
// ex-Wave-1 /flow), now its own top-level destination, driven by the page-level
// WorkspaceTabs (see OptionsWorkspace).
//
// All data is fetched CLIENT-side by the hub (flowGet, ~25s SWR), so there is no
// server payload to cache — the page is a thin server shell. The (shell) layout
// reads auth cookies (auto-dynamic); this page adds nothing server-side.

// Belt-and-suspenders vs the EdgeOne year-long s-maxage pin (the Wave-1 crash class):
// the (shell) layout's cookie read already makes this route dynamic, and next.config
// headers cap the edge cache at 5min — this export documents the cap and keeps it if
// either of those ever changes.
export const revalidate = 300;

export const metadata: Metadata = { title: "Options Flow · Mastermind Terminal" };

export default function OptionsPage() {
  return <OptionsWorkspace />;
}
