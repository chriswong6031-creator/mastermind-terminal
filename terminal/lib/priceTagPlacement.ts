// Where the last-price axis badge sits when the crosshair's own price label is in the way.
//
// The crosshair label is canvas-painted INSIDE the price scale; the badge is a DOM overlay above that
// canvas, so wherever the two met the badge won — hiding the one number the user is reading off the
// axis. When their boxes collide the badge slides clear of the label; the dashed price line still
// marks the true last price, so a displaced badge loses nothing.

/** Vertical half-extents of the badge around its anchor (it is centred on `top` via translateY(-50%)). */
export type TagExtent = { up: number; down: number };

/**
 * Half-height of lightweight-charts' price-axis label box, which is centred on the crosshair
 * coordinate: `fontSize + 2×(3/12·fs)` renderer padding `+ 2×(2/12·fs)` crosshair-only padding,
 * halved → `11/12·fs` (11px at the shipped 12px axis font).
 */
export const crosshairLabelHalf = (fontSize: number): number => (fontSize > 0 ? fontSize : 12) * (11 / 12);

/** Gap left between the crosshair label and the displaced badge. */
export const TAG_DODGE_GAP = 3;

/**
 * Badge anchor (pane-space y) given its natural anchor and the crosshair label's centre.
 * `crossY == null` (no crosshair on this pane) keeps the badge on the price. Otherwise it moves
 * BELOW the label, flipping above only when below would push it past the pane floor and above fits.
 */
export function priceTagTop(
  anchor: number,
  crossY: number | null,
  tag: TagExtent,
  labelHalf: number,
  paneHeight: number,
  gap: number = TAG_DODGE_GAP,
): number {
  if (crossY == null || !Number.isFinite(crossY)) return anchor;
  const clear = labelHalf + gap;
  const collides = anchor - tag.up < crossY + clear && anchor + tag.down > crossY - clear;
  if (!collides) return anchor;
  const below = crossY + clear + tag.up;      // badge top edge just under the label
  const above = crossY - clear - tag.down;    // badge bottom edge just over the label
  return paneHeight > 0 && below + tag.down > paneHeight && above - tag.up >= 0 ? above : below;
}
