// Shared geometry for the persistent price-scale badges.
//
// The primary (regular-session/current) price row is immutable: it is always centred on its real
// price coordinate. A secondary extended-hours row may move only when its projected pixel box would
// cover that primary badge. The price lines themselves never move.

export const PRICE_TAG_ROW_HEIGHT = 17;
export const PRICE_TAG_TIME_HEIGHT = 14;
export const PRICE_TAG_MIN_VALUE_WIDTH = 66;

/**
 * Convert a raw series price into the value painted by Lightweight Charts' public price-scale
 * modes. Percentage/IndexedTo100 use the first visible series value as their base; Normal and
 * Logarithmic continue to display the raw price.
 */
export function priceScaleDisplayValue(price: number, basePrice: number | null, mode: number): number {
  if ((mode !== 2 && mode !== 3) || basePrice == null || !Number.isFinite(basePrice) || basePrice === 0) {
    return price;
  }
  const percentage = 100 * (price - basePrice) / basePrice;
  if (mode === 2) return basePrice < 0 ? -percentage : percentage;
  const indexed = percentage + 100;
  return basePrice < 0 ? -indexed : indexed;
}

/** Integer top edge for a 17px price row centred on a projected price coordinate. */
export function priceTagRowTop(
  anchorY: number,
  rowHeight: number = PRICE_TAG_ROW_HEIGHT,
): number {
  return Math.round(anchorY - (rowHeight - 1) / 2);
}

export type SecondaryTagPlacement = {
  primaryY: number;
  secondaryY: number;
  paneHeight: number;
  primaryHeight?: number;
  rowHeight?: number;
};

/**
 * Place an extended-hours badge around the pinned primary badge.
 *
 * - A secondary price above/equal to the primary docks immediately above its 17px price row.
 * - A secondary price below the primary docks below the primary's complete footprint (including
 *   the countdown row when present).
 * - A naturally separated badge remains at its own projected coordinate.
 * - Near a pane edge, the secondary badge flips to the free side rather than moving the primary.
 */
export function secondaryPriceTagTop({
  primaryY,
  secondaryY,
  paneHeight,
  primaryHeight = PRICE_TAG_ROW_HEIGHT + PRICE_TAG_TIME_HEIGHT,
  rowHeight = PRICE_TAG_ROW_HEIGHT,
}: SecondaryTagPlacement): number {
  const primaryTop = priceTagRowTop(primaryY, rowHeight);
  const naturalTop = priceTagRowTop(secondaryY, rowHeight);
  const maxTop = paneHeight > 0 ? Math.max(0, Math.floor(paneHeight) - rowHeight) : Infinity;
  const clamp = (top: number) => Math.min(maxTop, Math.max(0, top));
  const primaryBottom = primaryTop + primaryHeight;
  const naturalBottom = naturalTop + rowHeight;

  const collides = naturalTop < primaryBottom && naturalBottom > primaryTop;
  if (!collides) return clamp(naturalTop);

  if (secondaryY <= primaryY) {
    const above = primaryTop - rowHeight;
    if (above >= 0) return above;
    const below = primaryBottom;
    return below <= maxTop ? below : clamp(above);
  }

  const below = primaryBottom;
  if (below <= maxTop) return below;
  const above = primaryTop - rowHeight;
  return above >= 0 ? above : clamp(below);
}
