// CMX W3 — active-pane coordinate bridge.
//
// The ghost cursor in ChartConductor needs an op's first anchor (epoch-seconds time + price) in PANE
// PIXELS, using the SAME transform the DrawLayer uses (lib/drawings anchors → xOf/yOf in ChartPanel).
// Those live inside ChartPanel's render closure; the conductor is a sibling overlay that can't reach
// them by prop. Rather than thread IChartApi up through the pass-through ChartPane wrapper + shell,
// ChartPanel registers a tiny resolver here whenever it is the ACTIVE pane, and the conductor reads it.
//
// This mirrors the repo's existing decoupling idiom (window CustomEvents / <html data-*> attributes for
// cross-cutting chart signals) but stays typed + tree-local. Registration is last-writer-wins keyed on
// nothing — only the active pane registers, and it clears on deactivate/unmount, so at most one entry
// is live. A miss (no active resolver, or the point is off-screen) → the conductor simply skips the
// glide for that op; the stroke animation (the real signature) is unaffected.

export type PaneCoordResolver = {
  // anchor time is contract epoch-SECONDS (as the bus stores it); price is a chart price.
  // Returns pane-local pixel coords, or null when the point isn't currently on screen.
  toPx: (tSec: number, price: number) => { x: number; y: number } | null;
  // the pane's bounding rect in viewport coords, so the overlay can map into its own box.
  rect: () => DOMRect | null;
};

let active: PaneCoordResolver | null = null;

export function setActivePaneCoords(r: PaneCoordResolver | null): void {
  active = r;
}

export function getActivePaneCoords(): PaneCoordResolver | null {
  return active;
}
