# Candle Painter

Recolors the candles themselves, so the bar you are looking at tells you what kind of bar it is.

## What you see

No lines, no bands, no labels — the candles are the indicator. Each bar is repainted according to the mode you pick, and the strength of that paint is itself information.

In the two plain modes the paint is flat: every bar gets body, border and wick in its state color, and the only variable is *which* color — trend up, trend down, weakening, or muted when the state is undecided. Directionless chop reads muted, which is the point: the module makes "nothing is happening here" visible instead of leaving you to infer it.

The intensity encoding belongs to the two **+ Volume** modes, and it is the part worth learning. The hue never changes there; what changes is **how much of the candle it takes over**, keyed on that bar's volume percentile against the trailing 100 bars:

- **High volume** (top third) — body, border and wick all painted. A solid block, the brightest bar on the chart.
- **Normal volume** (middle third) — body and border painted; the wick keeps the chart's default color.
- **Low volume** (bottom third) — border and wick only. The body stays default, so the bar reads as an outline.

So a healthy, well-traded trend is a run of solid blocks. A trend losing participation is the same color draining away bar by bar until you are reading outlines.

## How to trade it

Use it as a filter on decisions you are already making, not as an entry trigger. It has no levels and no targets — it grades bars.

The first read is agreement — the color itself. A breakout bar painting the trend or momentum color has the character you want behind it. A breakout bar that comes through muted, or in the weakening shade, is the market going through the motions, and follow-through is a coin flip.

The second read is fade, and it needs a **+ Volume** mode. Watch a strong leg step down from solid blocks to bodies to outlines; that draining is often visible several bars before a trend module flips, and it is a cue to tighten a stop or take partial profit, not to reverse.

The third read is the climax bar. In a volume mode, the single brightest bar after an extended run frequently marks the end of that run rather than the middle.

Because it repaints candles you already read, it stacks with anything: run it under Trend Engine or Flow Band and take signals that arrive on strong bars.

## Settings

**Mode (default Momentum)** — one choice decides everything:

- **Trend** — the EMA20/EMA50 regime. Up when the fast average leads and price closes above both, down when it trails and price closes below both, muted while price sits inside the cross. The calmest mode; good as a permanent background.
- **Momentum** — RSI(14) bands: up at 60 and above, down at 40 and below. Between the two, a *falling* RSI paints the weakening shade and a flat one stays muted. Default, because that weakening shade is usually where the useful information is.
- **Trend + Volume** — the same trend colors, with quiet bars painting less of the candle. Best for seeing which side is doing the actual trading.
- **Momentum + Volume** — momentum colors on the same volume encoding. The most heat-map-like mode: ranging chop nearly disappears and volume climaxes stand out hard.

## Signals & alerts

None — by design. This module only paints bars; it defines no event, so there is nothing to fire an alert on. If you want alerts on the same ideas, use Trend Engine for flips or Flow Band for turns, and keep Candle Painter running underneath as the confirmation layer.
