"use client";
/**
 * HeatmapPageRoot.tsx — content-only body for the Heatmap workspace tab.
 *
 * Wave-2: the app chrome (.app2 grid + topbar + AppNav + MobileNav + lang toggle)
 * is now owned by AppShell (app/(shell)/layout.tsx). This root renders ONLY the
 * .main2 content cell (the HeatmapView). Mounted under Screener › Heatmap; the
 * legacy /heatmap and /discover?tab=heatmap URLs are served by next.config redirects.
 */

import { HeatmapView } from "./HeatmapView";

export default function HeatmapPageRoot() {
  return (
    <main className="main2" style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <HeatmapView />
    </main>
  );
}
