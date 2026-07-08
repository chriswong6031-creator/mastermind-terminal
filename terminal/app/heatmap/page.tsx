/**
 * app/heatmap/page.tsx — Heatmap page wrapped in the same app2 shell as /flow.
 *
 * P0 FIX: the previous version rendered HeatmapView standalone — no AppNav,
 * no topbar — so the user could not navigate away. Now uses the identical
 * app2 shell that OptionsHubView uses, giving left AppNav + top bar.
 */

import HeatmapPageRoot from "@/components/heatmap/HeatmapPageRoot";

export default function HeatmapPage() {
  return <HeatmapPageRoot />;
}
