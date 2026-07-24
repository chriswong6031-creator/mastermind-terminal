import type { Metadata } from "next";
import OptionsWorkspace from "@/components/workspaces/OptionsWorkspace";
import OptionsPaywall from "@/components/OptionsPaywall";
import { hasLiveOptions } from "@/lib/entitlement";

// Options workspace (Wave-3 IA) — the options-intelligence hub, renamed from the
// former Research page. Serves /options under the (shell) route group (route groups
// don't affect the path); the shared chrome comes from app/(shell)/layout.tsx. This
// is the ex-/flow OptionsHubView engine, driven by the page-level WorkspaceTabs
// (see OptionsWorkspace). The old Fundamentals chip has moved to /analysis.
//
// All data is fetched CLIENT-side by the hub (flowGet, ~25s SWR), so there is no
// server payload to cache — the page is a thin server shell. The (shell) layout
// reads auth cookies (auto-dynamic); this page adds nothing server-side.

// Belt-and-suspenders vs the EdgeOne year-long s-maxage pin (the Wave-1 crash class):
// the (shell) layout's cookie read already makes this route dynamic, and next.config
// headers cap the edge cache at 5min — this export documents the cap and keeps it if
// either of those ever changes. (Old /screener|/heatmap|/flow pages carried the same.)
export const revalidate = 300;

export const metadata: Metadata = { title: "Options · Mastermind Terminal" };

export default async function OptionsPage() {
  // Live options is a PAID surface (the `terminal_live_options` entitlement — the
  // same gate as /api/flow). Non-entitled callers get the upgrade paywall instead
  // of a would-be-empty workspace (the data API already 403s). The entitlement
  // read (auth cookies via billingAuth) forces per-request dynamic rendering.
  if (!(await hasLiveOptions())) return <OptionsPaywall />;
  return <OptionsWorkspace />;
}
