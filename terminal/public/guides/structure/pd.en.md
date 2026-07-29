# Premium & Discount

This module measures the current swing range and tells you whether price is expensive (premium), cheap (discount), or in the middle — so you buy the lower half of a rally and sell the upper half of a decline instead of the other way round.

## What you see

- **Two horizontal stripes** — the upper one tints the top 30% of the range, captioned "Premium" at its left edge; the lower one tints the bottom 30%, captioned "Discount". In an uptrend you want to buy in the lower stripe; in a downtrend you want to sell in the upper one.
- **Dashed line across the middle, labelled "EQ" with its price** — the exact 50% level of the range. It is the line that splits expensive from cheap.
- **Two retracement hairlines, labelled "0.618" and "0.786" with the price beside each** — how far price has pulled back through the range. The retracement is measured back from the trend-side extreme: 0 sits at the end of the move, 1.0 at its start.
- **Shaded gold band with hairline edges** — the "golden pocket" between 0.618 and 0.650, the tightest slice of the deep-retracement area. The 0.786 line marks the far (OTE) bound; the space between the two is not shaded.
- **Hover any of the price labels** — the range high and low, equilibrium, where in the range price currently sits, the trend side, the golden pocket and the OTE bound.

Only the newest range carries labels and captions. Older ranges keep their stripes and lines, dimmed, and drop every piece of text so the chart doesn't fill up.

## How to trade it

1. Decide the trend first, using structure. This module tells you *where* to act, never *whether* to.
2. In an uptrend, only look for longs while price sits below the Equilibrium line, in the discount stripe. In a downtrend, only look for shorts above it.
3. Wait for price to reach the deep-retracement area between 0.618 and 0.786, ideally the gold band, and to stop going your opponent's way — a rejection candle, or a small structure break in your direction.
4. Enter there. Stop just beyond the far end of the range — the extreme the move started from. Past it the range is broken and the measurement is void.
5. First target is Equilibrium. Bank part of the position there and move the stop to entry.
6. Second target is the other end of the range: the extreme the retracement was measured back from.

**When not to use this:** in a strong, one-way trend that never returns to the discount half. Waiting for a "cheap" price in that market means never being in the trade.

## Settings

**Range**
- *Range Length* — how many swing pairs define the active range. Larger values track bigger, slower ranges.
- *Ranges Kept* — how many ranges stay on the chart (1 to 3, default 1), newest first.

**Levels**
- *Fib Levels* — draw the 0.618 and 0.786 retracement lines across the range.
- *Golden Pocket* — shade the 0.618–0.650 band. Only offered while Fib Levels is on.
- *Premium / Discount* — the two stripes at the top and bottom of the range.
- *Equilibrium* — the dashed 50% line.
- *Labels* — print the level name and price at each line, plus the Premium and Discount captions.

## Signals & alerts

- **pd_enter_premium** — price closed into the top 30% of the range. Strength is where in the range it closed.
- **pd_enter_discount** — price closed into the bottom 30% of the range.
- **pd_golden_touch** — the bar traded into the 0.618–0.650 golden pocket. A setup zone, not a signal by itself.

Entering a zone only fires again after price has left it, and each type waits 5 bars between fires. Anchoring a new range is not an event — the levels simply move.
