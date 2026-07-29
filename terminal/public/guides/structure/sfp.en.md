# Swing Failure

A swing failure is a single candle that pokes above a previous high (or below a previous low) and then closes back inside — a breakout that failed on the spot, which often marks the turn.

## What you see

- **Thin horizontal line from an old swing to the failing candle** — the level that was swept. A short tick at the left end points back at the swing that created it.
- **Triangle at the tip of the wick** — pointing back at the wick, on the outside of the candle. Below a swept low it points up; above a swept high it points down. Every confirmed pattern gets a triangle, and on an ordinary pattern the triangle is the whole mark.
- **"+SFP" beside the triangle** — the pattern scored 50% Volume Strength or better: heavy volume on the sweep and a fast reclaim. These are the ones worth waiting for. A pattern under 50 prints its triangle with no text.
- **Shaded band between the wick tip and the level** — the deviation zone: the area price traded in while it was outside the level, drawn 12 bars wide with a dashed hairline border. It usually acts as resistance afterwards.
- **Grey dashed line with a dimmed triangle and a plain grey "SFP"** — an invalidated setup: price later *closed beyond the sweep extreme*, so the failure never worked. Its deviation zone is dropped. Only shown while Keep Invalidated is on.
- **Hover a marker** — the direction, the Volume Strength percentage, the swept price, whether the reclaim happened on the sweep bar or the next one, and how long ago it was invalidated.

Volume Strength blends how heavy the sweep candle's volume was against recent bars (70%) with how quickly price reclaimed the level (30%). It is a ranking of the setup's conviction, not a measure of who traded.

## How to trade it

1. Trade swing failures in the direction of the wider trend first. A sweep of a low in an uptrend is the highest-quality version.
2. Wait for the candle to actually close back inside the level. An intrabar poke is not a signal, and the mark is only confirmed on the close.
3. Prefer "+SFP" marks, or raise Min Volume Strength % so weaker ones stop printing at all.
4. Enter on the close of the failing candle, or on a retest of the deviation zone if you want a tighter entry.
5. Stop goes beyond the wick tip. A close past it is exactly what invalidates the pattern, so your stop and the module agree.
6. First target is the opposite side of the range the sweep came from. Take part off there and move the stop to entry.

**When not to use this:** at the start of a strong trending move, when levels get swept and never given back — the first failure of many is usually the losing side.

## Settings

**Detection**
- *Swing Lookback* — how many bars either side define the swing being swept. Larger values find fewer, more meaningful levels.
- *Min Volume Strength %* — the minimum score a pattern needs before it prints at all. Separate from the fixed 50 that earns the "+SFP" tier.
- *Trend Filter* — All, With trend, or Counter-trend. Trend is read from EMA20 vs EMA50 on this timeframe, at the bar the pattern confirms.

**Display**
- *Label Size* — Small, Normal or Large, for the "+SFP" and "SFP" text.
- *Keep Invalidated* — keep dead setups on the chart, greyed out, instead of removing them.
- *Deviation Zone* — draw the shaded band between the wick tip and the swept level.
- *Show Last* — how many patterns stay on the chart. Detection always runs over full history.

## Signals & alerts

- **sfp** — a swing failure confirmed: price swept a level and closed back inside. The event carries the Volume Strength percentage as its strength, plus the direction. The "+SFP" tier is a rendering grade on this same event, not a second event — filter on strength 50 or better to alert on tier prints only.
- **sfp_invalidated** — price later closed beyond the sweep extreme, so the setup is dead. Its direction is the *market implication*: a dead bullish SFP fires bearish.

Events are emitted over full history and are not capped by Show Last.
