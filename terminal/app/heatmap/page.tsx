/**
 * app/heatmap/page.tsx — thin wrapper for the Heatmap surface.
 *
 * The integrator wires AppNav and any new f-params into the API route
 * (f=manifest, f=flow_idx).  This page only mounts the view component.
 */

import { HeatmapView } from "@/components/heatmap/HeatmapView";

export default function HeatmapPage() {
  return <HeatmapView />;
}
