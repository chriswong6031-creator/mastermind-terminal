/**
 * app/heatmap/page.tsx — Heatmap page wrapped in the same app2 shell as /flow.
 *
 * P0 FIX: the previous version rendered HeatmapView standalone — no AppNav,
 * no topbar — so the user could not navigate away. Now uses the identical
 * app2 shell that OptionsHubView uses, giving left AppNav + top bar.
 */

import HeatmapPageRoot from "@/components/heatmap/HeatmapPageRoot";

// This is a static client-shell page. Without this, Next prerenders it fully static and
// emits Cache-Control: s-maxage=31536000 (1 year), so EdgeOne pins the OLD build after a
// deploy until an owner purges the CDN. revalidate=300 caps the CDN cache at 5 minutes so
// deploys go live on their own. (Data is fetched client-side, so this costs nothing.)
export const revalidate = 300;

export default function HeatmapPage() {
  return <HeatmapPageRoot />;
}
