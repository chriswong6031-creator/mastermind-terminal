# Order Blocks

An order block is the last candle that went *against* the move just before a big push began — the area where buyers or sellers stepped in, and where price often reacts when it returns.

## What you see

- **Tinted band** — the block, drawn from its origin candle to the right edge. Up-coloured bands are bullish (possible support), down-coloured bearish (possible resistance).
- **Thicker edge on one side** — the outer extreme: the bottom of a bullish block, the top of a bearish one. That edge matters most.
- **Dotted midline** — the block's halfway price, a common partial-fill entry.
- **"WEAK", "BALANCED", "HIGH" or "STRONG" on the midline** — how the block ranks against the last 200 bars on volume, one-sidedness and impulse size. STRONG is rare.
- **"▶ 72%" bar** — the same rating as a number and a length.
- **"▲ 87.31%" and "▼ 12.69%" capsules** — the split of buying versus selling volume while the block formed. This is an *estimate* from where each candle closed inside its range, not real order-flow data.
- **Right-edge chips like "954 (54.8%)" and "+588"** — total volume in the block, its share of the blocks currently shown, and buying minus selling.
- **Dashed box labelled "Breaker Block"** — a block price already broke through. Its role flips: broken support becomes resistance.

## How to trade it

1. Use blocks only in the direction of the wider trend — bullish blocks while structure makes higher highs, and the reverse.
2. Prefer HIGH or STRONG blocks that price has not returned to yet. Each touch uses some of it up.
3. Wait for price to trade back into the band and for a candle to close rejecting it. Don't buy the first touch blindly.
4. Enter near the midline or outer edge; stop just beyond that edge with room for a wick.
5. First target is the swing the impulse ran to. Bank part there, move the stop to entry.
6. If price closes through the block it is used up — stop out, and if a Breaker Block appears, watch it from the other side.

**When not to use this:** on thin, low-volume symbols, where the rating and the buy/sell estimate mean little.

## Settings

**Detection**
- *Detection* — Volume (big candle on heavy volume), Price Action (close through the last small pivot), or Peak (exhaustion candle at a volume spike; confirms one bar later).
- *Impulse × ATR* — how big the pushing candle must be relative to normal range.
- *Volume percentile* — for Volume detection, how heavy that volume must be against the last 200 bars.
- *Block type* — show all blocks, or just bullish or bearish.
- *Zone bounds* — use the origin candle's full range, or just its body.
- *Mitigation* — what counts as the block being used up: Touch, Wick, Close or Average (midline).

**Display**
- *Show last* — how many live blocks stay on the chart.
- *Breaker blocks* — keep used-up blocks as role-flipped breakers instead of deleting them.
- *Volume internals* — the buy/sell capsules and the volume and delta chips.
- *Rating bar* — the score bar on the midline.
- *Tier label size* — small and grey, or large and bold.
- *Extend right* — off means the band stops 15 bars after it forms.

## Signals & alerts

- **ob_created** — a new block formed; the alert carries its rating.
- **ob_touch** — price traded back into a live block (at most once every 5 bars per block).
- **ob_break** — price broke through the block; it is used up, and becomes a breaker if enabled.
