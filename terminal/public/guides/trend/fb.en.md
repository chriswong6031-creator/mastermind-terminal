# Flow Band

A smooth trend cloud that turns rarely, and grades every pullback into it from 0 to 100.

## What you see

One heavily smoothed midline runs through the chart with a volatility cloud hanging off its trend side — below price while the trend is up, above while it is down. The smoothing lags far less than an ordinary moving average of the same length, which is why the line can be this slow and still turn near the pivot.

Turns are hard events, not blends: the old cloud stops dead, the new one starts on the opposite side of price, and a small triangle prints at the join with the flip price beside it.

Circles mark retests — bars where price came back into the cloud and left it on the trend side. Each carries a quality chip, a **0–100** score built from four things:

- **Depth (up to 50)** — how far into the cloud price dipped, as a fraction of the band's half-width. A pullback that reaches the far edge scores the lot.
- **Participation (up to 25)** — the retest bar's volume percentile against recent bars.
- **Momentum agreement (15, all or nothing)** — whether RSI sits on the trend's side of 50 at that bar.
- **Close position (up to 10)** — how close the bar finished to its trend-side extreme. A bar that dipped and slammed shut scores full marks.

Closing back on the trend side is not scored — it is the precondition. A bar that dips into the cloud and closes through it is not a retest at all and prints nothing.

Roughly: **70+** is a clean, well-supported pullback; **40–70** is workable but wants confirmation; below 40 the module is telling you this is not the one.

## How to trade it

A trend-following tool with a built-in entry filter: turns set direction, retests are the trades.

Take the turn triangle as bias, not as your fill — the flip bar is where the cloud is widest and the stop furthest away. Wait for the first or second retest and let the chip decide. A 78 with the cloud still steep is the setup this module exists to find; a 31 into a flattening cloud is the market saying the trend has stopped pulling back and started reversing.

Stops belong on the far side of the cloud, not at the midline — cloud width is the module's own estimate of normal noise. Targets come from previous swings or your structure modules.

Turns against your position are exits, late by design. For earlier warning, run Trend Engine alongside: it flips first, this confirms.

## Settings

**Length (20–100, default 50)** — midline period. Shorter turns more often and gives more retests; longer holds through deeper corrections.

**Band Width (ATR) (1–4, step 0.1, default 1.8)** — cloud thickness in volatility units. Wider clouds mean fewer, deeper retests and wider stops.

**Source Timeframe (Chart / 2× bars / 4× bars, default Chart)** — computes on a coarser resample. Smoother trend, fewer and later turns; the cloud edge renders stepped on purpose, so you can see it is not native to your chart.

**Turn Signals, Retest Signals, Cloud** — display toggles.

**Quality Chips** — the 0–100 score beside each retest. Only offered while Retest Signals is on, and the chips hide themselves when bars get too narrow to read.

**Show Last (2–16, default 8)** — how many recent retest marks stay drawn.

## Signals & alerts

Two events: **fb_turn** (bull or bear, at the flip bar, with the flip price, its strength set by how steep the midline was at the turn) and **fb_retest**, which carries its 0–100 quality as strength so you can alert on high-grade pullbacks only — say, retests scoring 70 or better with the trend. Confirmed turns and retests are permanent; loading more history never rewrites them.
