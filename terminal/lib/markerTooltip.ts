/** SIGNAL-MARKER TOOLTIP GEOMETRY — hit-testing and placement, kept pure.
 *
 *  ── WHY THIS EXISTS AS A JS HIT TEST AND NOT `pointer-events` ──────────────────────────────
 *
 *  Every `<title>` in the signal layer had never rendered for anyone. The layer is built
 *  `pointer-events:none` (ChartPanel's `sigSvg`), so no descendant is hit-testable and the
 *  browser never surfaces a native SVG tooltip. Five shipped tooltip copies — the blocked ⊘
 *  "not an entry" line, the washout-override candidate line, the two waived-entry lines, and
 *  the retro re-mark line — were written, reviewed, tested for CONTENT, and displayed to nobody.
 *
 *  The obvious repair is to set `pointer-events:auto` on each marker group and let the native
 *  tooltip come back. THAT REPAIR IS A REGRESSION, and the reason is structural rather than a
 *  matter of tuning: lightweight-charts owns pan, crosshair, wheel-zoom and pinch on ITS OWN
 *  canvas, which lives inside the chart container element. The overlay layers are appended to
 *  the container's PARENT (`wrap = el.parentElement`), so the canvas is a SIBLING SUBTREE, not
 *  an ancestor. An event that lands on a hit-testable marker bubbles to `wrap` and stops — it
 *  never reaches the canvas, and there is no propagation path that would take it there. A
 *  hit-testable marker therefore does not merely "risk" swallowing a drag; it removes the
 *  chart's entire gesture surface over its own footprint. A pan that starts on a marker does
 *  not pan, a wheel over a marker does not zoom, and the crosshair drops out while the cursor
 *  crosses it because the canvas stops receiving moves.
 *
 *  (The same pattern already ships one layer down: `indicator-canvas/render.bindTooltip` sets
 *  `pointer-events:auto` on premium-suite prims inside the equally `pointer-events:none`
 *  indicator layer. Those prims carry the same gesture hole. It is out of scope here and
 *  reported rather than fixed, but it is the reason this file does not follow that precedent.)
 *
 *  So the layer stays `pointer-events:none` and NOTHING about the chart's hit-testing changes —
 *  drag, crosshair, wheel and pinch are byte-identical because not one pixel of the app's
 *  hit-test geometry moved. The tooltip is driven instead from listeners on `wrap`, which
 *  already receives the canvas's bubbled pointer events (the pane-hover and double-tap handlers
 *  have relied on exactly that for as long as they have existed). This module owns the two pure
 *  pieces of that path so they can be tested without a browser.
 *
 *  The COPY is never re-authored here. Callers read each marker's own `<title>` text and hand it
 *  over verbatim, so the tooltip and the SVG title cannot drift apart: there is exactly one
 *  string per marker class and it is the one already in the DOM. */

/** One hoverable marker. Coordinates are whatever space the caller measures in — the hit test
 *  is space-agnostic on purpose, and ChartPanel measures in viewport (client) coordinates so it
 *  never has to reason about the overlay's user space versus the wrapper's border box. */
export type MarkerHit = {
  x: number;
  y: number;
  w: number;
  h: number;
  /** The marker's `<title>` text, verbatim. The tooltip's entire content. */
  title: string;
  /** Bar date — every title is emitted as `${m.t} · …`, so the prefix identifies the marker. */
  t: string;
};

/** Mouse forgiveness, px. Markers are 11–20px tall; a couple of pixels of slack makes the ring
 *  and the pill's pointer tip hoverable without reaching into a neighbour. */
export const MARKER_HOVER_SLACK = 3;

/** Touch forgiveness, px. A ⊘ ring is ~11px across, far under any usable touch target, so the
 *  tap box is grown to roughly 32–40px. Deliberately larger than the hover slack: a fingertip
 *  has no hover state to correct an aim with. */
export const MARKER_TAP_SLACK = 10;

/** The marker under (px, py), or null.
 *
 *  Overlapping markers resolve by CENTRE DISTANCE rather than paint order. Two fires on adjacent
 *  bars can have overlapping slack boxes, and "whichever was appended last" would make the
 *  tooltip depend on emitter ordering — the nearest centre is what the reader is pointing at. */
export function hitTestMarkers(
  boxes: readonly MarkerHit[],
  px: number,
  py: number,
  slack = 0,
): MarkerHit | null {
  let best: MarkerHit | null = null;
  let bestD = Infinity;
  for (const b of boxes) {
    if (px < b.x - slack || px > b.x + b.w + slack) continue;
    if (py < b.y - slack || py > b.y + b.h + slack) continue;
    const dx = px - (b.x + b.w / 2);
    const dy = py - (b.y + b.h / 2);
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = b; }
  }
  return best;
}

/** Where to put the tooltip box, in coordinates relative to the chart wrapper.
 *
 *  Mirrors `indicator-canvas/render.placeTip`'s behaviour so the two floating surfaces on this
 *  chart move the same way: offset below-right of the anchor, flipped to the other side when it
 *  would overflow, then clamped inside the wrapper so a marker at the very edge of the pane
 *  still shows its whole tooltip instead of a sliver. */
export function placeMarkerTip(
  anchor: { x: number; y: number },
  tip: { w: number; h: number },
  wrap: { w: number; h: number },
  opts: { pad?: number; offX?: number; offY?: number } = {},
): { left: number; top: number } {
  const pad = opts.pad ?? 4;
  const offX = opts.offX ?? 12;
  const offY = opts.offY ?? 14;
  let x = anchor.x + offX;
  let y = anchor.y + offY;
  if (x + tip.w > wrap.w - pad) x = anchor.x - tip.w - offX;
  if (y + tip.h > wrap.h - pad) y = anchor.y - tip.h - (offY - 4);
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, hi));
  return {
    left: clamp(x, pad, Math.max(pad, wrap.w - tip.w - pad)),
    top: clamp(y, pad, Math.max(pad, wrap.h - tip.h - pad)),
  };
}

/** Did this pointer gesture stay still and short enough to read as a TAP rather than a pan?
 *  Same thresholds as ChartPanel's existing double-tap detector, so one gesture cannot be a tap
 *  for the tooltip and a drag for the chart. */
export function isTapGesture(
  down: { x: number; y: number; t: number },
  up: { x: number; y: number; t: number },
): boolean {
  if (up.t - down.t > 300) return false;
  return Math.hypot(up.x - down.x, up.y - down.y) <= 12;
}
