# Liquidity

Liquidity maps the price levels where a crowd of stop orders is likely parked — matching highs and lows — and marks the moment price spikes through one and immediately comes back.

## What you see

- **Horizontal line drawn through two or more matching highs (or lows)** — an equal-level cluster. The more touches it has, the brighter and thicker the line; four touches or more draws it at double weight. Lines above price are stops from short sellers; lines below are stops from buyers.
- **Chip at the right end, reading "EQH ×3" or "EQL ×2"** — which side the pool sits on (equal highs = buyside, equal lows = sellside) and how many pivots stack into it.
- **Triangle on a candle with a long wick through a level** — a liquidity grab: price poked beyond the level far enough to trip the stops, without closing through it. That is often the real turning point. The line then turns dashed, stops at the sweeping bar, and is dropped a few bars later.
- **Age tint on the lines** — with Heat Coloring on, a fresh level is drawn in the accent colour and an older one shifts to the warn colour. It is a three-step age tint, not a strength gradient, and it never interpolates.
- **Translucent circles on swing highs and lows** — bubbles sized by the volume percentile of the pivot bar; hover one for that percentile.

Bubble size is an **estimate** of participation from bar volume, not order-book or trade-tape data. Line weight comes from touch count and age only — no volume goes into it.

## How to trade it

1. Mark the nearest untouched level to price. That is the market's most likely next magnet.
2. Do not fade the level in advance. Wait for price to actually sweep it and for the sweep candle to close back on the other side.
3. Take the trade against the sweep — a grab below a low is a long, a grab above a high is a short — but only if it agrees with the trend from Market Structure.
4. Stop goes beyond the wick of the sweep candle. If price closes past the level instead, it was crossed rather than grabbed, and nobody was trapped.
5. Target the opposite liquidity line — the nearest cluster on the other side, where the next crowd of stops sits. Take part off there.
6. If price grinds through a level over several bars instead of spiking through it, no one got trapped. Skip it.

**When not to use this:** during scheduled news, when levels get taken out for reasons that have nothing to do with resting orders.

## Settings

**Level detection**
- *Level Tolerance (ATR)* — how close two highs (or lows) must be, as a fraction of ATR, to count as the same level.
- *Min Touches* — how many pivots must stack before a line is drawn.
- *Max Lines* — how many levels may be tracked at once. Over the cap, the weakest (fewest touches, then oldest) are dropped.
- *Show Last* — how many lines stay on the chart. Detection is unaffected.

**Sweeps**
- *Liquidity Grabs* — mark the bar whose wick pierces a level without closing through it.
- *Grab Sensitivity (ATR)* — how far beyond the level the wick must go, as an ATR multiple.

**Appearance**
- *Heat Coloring* — age-tint the lines: fresh levels accent, ageing levels warn. Off leaves them structural grey.
- *Volume Bubbles* — circles on confirmed pivots, sized by that bar's volume percentile.
- *Bubble Volume Floor (%ile)* — skip pivots whose volume percentile is under this floor.

## Signals & alerts

- **liq_created** — enough matching highs or lows now stack up to publish a level. Strength scales with the touch count.
- **liq_grab** — a wick swept through the level by at least the grab sensitivity without closing through; the trap signal. Strength scales with how far past the level the wick reached, in ATR.
- **liq_cross** — price *closed* through the level, so the pool was taken outright and the line is removed. This is the opposite of a grab, not a stronger version of one.
