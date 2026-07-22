// TV-style "wheel on the price axis squashes/stretches the pane" math — the pure part.
//
// Extracted from ChartPanel's axis-wheel handler so the clamp/step arithmetic is unit-
// testable without a live chart. No "lightweight-charts" import: this is arithmetic on
// scale margins, and the module's boundary law (see api.ts) keeps math renderer-agnostic.
//
// A pane's zoom is a single accumulator added to BOTH margins; `base` is the pane's own
// starting margins (subpanes are created with their own), captured on first interaction.

export type AxisMargins = { top: number; bottom: number };

// zoom accumulator range: down to -base.bottom (bottom margin can reach 0, no further),
// up to 0.4 (past that the range collapses to a sliver).
export function clampAxisZoom(base: AxisMargins, zoom: number): number {
  return Math.max(-base.bottom, Math.min(0.4, zoom));
}

// apply the zoom to both margins; each is independently clamped to [0, 0.49] since LWC
// rejects margins that leave no room for the series.
export function axisZoomMargins(base: AxisMargins, zoom: number): AxisMargins {
  return {
    top: Math.min(0.49, Math.max(0, base.top + zoom)),
    bottom: Math.min(0.49, Math.max(0, base.bottom + zoom)),
  };
}

// one wheel notch → zoom delta. deltaMode 1 (line mode, Firefox) reports lines not pixels,
// so scale up by 16 first; 0.0004 tunes pixels-per-notch to feel.
export function wheelDeltaToZoomStep(deltaY: number, deltaMode: number): number {
  const px = deltaMode === 1 ? deltaY * 16 : deltaY;
  return px * 0.0004;
}
