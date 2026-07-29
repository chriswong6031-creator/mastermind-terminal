# Volt Bands

A volatility envelope that expands instantly and deflates slowly — so you can see when a move has gone too far, and when it comes back.

## What you see

Two broad ribbons frame price, with the candles trading between them. Each is a moving average plus or minus a multiple of recent volatility, so the envelope breathes with the instrument instead of sitting at fixed percentages.

The asymmetry is deliberate. When volatility jumps, the bands widen on the same bar. When it calms, they contract slowly — the envelope keeps a memory of the last expansion, which stops it snapping shut around a quiet pullback and calling the next ordinary bar an extreme.

A dotted midline runs through the price area, colored by its own slope. With both ribbons hidden you can still read direction from the dots alone.

When price trades beyond a band, the ribbon behind those bars lights up column by column. The glow is an intensity scale — the further past the band price closes and the longer it stays out, the hotter the columns get. One warm column is stretch; a run of hot columns is a market that has spent its move.

Small triangles print when price closes back **inside** the envelope after being outside, pointing toward the middle: up-triangles below price recovering from under the lower band, down-triangles above price dropping back in from over the upper band.

## How to trade it

Read the bands as context, not as a signal generator. Price outside a band is not a reversal — in a real trend it is the most normal thing a chart does, which is why the glow measures degree instead of printing an entry.

The tradeable moment is the re-entry triangle, and only in the right setting. In a range, a triangle after a hot glow is a mean-reversion trade back to the midline, stop beyond the extreme that made the glow. In a trend, take only triangles pointing with the trend — a recovery from below the lower band in an uptrend is a pullback ending, and the midline is the first target.

The other high-value use is exit timing. Already long and the upper band starts glowing hot? That is where you tighten, trim, or move a stop — not where you add. Bands that squeeze in and flatten mean the envelope has fully deflated: expect expansion, not direction.

## Settings

**Length (10–60, default 20)** — bars feeding the midline and the volatility estimate. Shorter reacts faster and touches the bands more often; longer gives fewer, more meaningful excursions.

**Width (× ATR) (1–4, step 0.1, default 2.2)** — how many volatility units out each band sits. Raise it until only genuine extremes get outside.

**Midline (on)** — the slope-colored dotted line.

**Reversal Signals (on)** — the re-entry triangles.

**Overextension Glow (on)** — per-bar heat behind outside-band bars. Turn it off when stacking this with other chrome.

**Show Last (2–20, default 10)** — how many recent re-entry marks stay drawn.

## Signals & alerts

Two events are available: **vb_break** (the first close outside the upper or lower band in an excursion) and **vb_retest** (the close back inside — the triangle). Each carries its direction and, as strength, how far the excursion reached in ATR, so you can filter for deep stretches only. A move that flips straight from above the upper band to below the lower one in a single bar never closed inside, so it fires no re-entry. The event tape is independent of the display toggles: turning the triangles off silences the chart, not the alert. Confirmed marks never move when more bars load.
