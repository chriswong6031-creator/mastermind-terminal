# Market Structure

Market Structure draws the skeleton of the chart: where price turned, which of those turns have broken, and whether the trend is intact or has changed hands.

## What you see

- **Diamond at a swing high or low** — a confirmed turning point. Green = buying dominated that swing, red = selling did, amber = mixed. Hover for volume, net delta and break quality.
- **"BOS" on a dashed line** — price closed through the last swing level in the direction it was already going. The trend continued.
- **"CHoCH" on a solid line** — price closed through a level against the trend. First hint that control changed hands.
- **Thin gray lines** — the same breaks on the fast internal chain. Context only.
- **Dashed ray to the right edge, labelled "BOS" or "CHOCH"** — a level not broken yet, and what breaking it would mean.
- **Shaded box marked "+CISD" or "-CISD"** — a break that failed: the move was fully given back within 10 bars. A trap.
- **"HH" / "HL" / "LH" / "LL"** — higher high, higher low, lower high, lower low. HH with HL is an uptrend; LH with LL a downtrend.
- **"Strong High" / "Weak Low" tags at the right edge** — the newest swing high and low: strong if untouched since, weak if price traded through it.
- **Dotted connector with "DT" / "DB"** — double top or bottom whose neckline broke; "+" means it finished on a strong candle.
- **Zigzag legs** — optional map of confirmed swings; the last dashed leg is still forming.

## How to trade it

1. Trade only the direction of the latest **swing** BOS or CHoCH. Internal breaks are context, not entries.
2. Don't chase the breaking candle. Wait for price to come back to the level it broke — broken resistance often turns into support, and the reverse.
3. Enter only if the pullback holds: a fresh HL above the level in an uptrend, LH below it in a downtrend.
4. Stop goes beyond that swing point, not a fixed distance. If it breaks, the reason for the trade is gone.
5. Take partial profit at the previous opposite swing, then move the stop to entry.
6. If "+CISD" or "-CISD" prints against you, the break that got you in failed. Leave.

**When not to use this:** inside a tight, quiet range, where swing levels break both ways and each signal cancels the last.

## Settings

**Detection**
- *Internal structure length* — bars either side defining a small turn.
- *Swing structure length* — the same for the major turns.
- *Pivot source* — measure turns from wicks or from bodies.
- *Direction filter* — all structure, or one side only.

**On-chart elements**
- *Project pending levels* — extend unbroken swing levels rightwards.
- *CISD (failed delivery)* — flag breaks given back within 10 bars.
- *Delta diamonds* — swing markers plus their hover breakdown.
- *Mapping zigzag* — join confirmed swings; forming leg dashed.
- *Swing labels (HH/HL/LH/LL)* — the four-letter swing tags.
- *Strong / weak high & low* — mark the newest swing high and low.
- *Double tops / bottoms* — draw DT/DB patterns.
- *Double top/bottom tolerance %* — how close the two extremes must be.
- *Structure candles* — recolour candles by internal trend state.
- *Show last N structure events* — how much stays drawn; detection uses full history.

## Signals & alerts

- **bos** — a swing level broke with the trend.
- **choch** — a swing level broke against the trend; structure has flipped.
- **cisd** — a recent break was fully retraced within 10 bars.

Only major swing events fire; internal-chain breaks stay silent, so alerts don't trigger on every wiggle.
