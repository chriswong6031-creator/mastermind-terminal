# Trend Engine

One band decides the trend, prints the entry, and manages the trade to the last target.

## What you see

A trailing band rides the safe side of price — under it in an uptrend, over it in a downtrend. It only ratchets toward price and never gives ground back until the trend flips, so the gap between price and band is your live risk.

Each flip prints an entry pill: **BUY** under the swing low, **SELL** above the swing high. Three tiers, same signal at different grades:

- **BUY** / **SELL** — a flip.
- **BUY +** / **SELL +** — a flip arriving with momentum in the top of its own recent range.
- **POWER BOTTOM** / **POWER TOP** — a flip straight after an exhaustion extreme. The rarest print on the chart.

Circles on the band mark retests — bars where price tagged the band without breaking it. A faint background tint colors each column by trend side, so you can read the regime without studying the band. After a signal, a ladder extends right — **TP1** upward, three rungs by default and up to six, each gaining a **✓** when price trades through it — plus a stop chip stepping along behind price. An optional second band, one ATR further from price, can trail the first as a soft cloud.

## How to trade it

The flip is the thesis; the retest is usually the entry. Buying the pill bar catches the whole move but needs the widest stop. Waiting for the first band retest gives a tight stop just beyond the band and an unambiguous exit — close through it and you were wrong cheaply.

Use two charts: direction from the higher timeframe, signal from the lower one. A BUY on the hourly while the daily band is still bearish is a countertrend trade — size it like one.

Let the ladder manage. TP1 pays for the trade, TP2–TP3 carry the expectancy, the trailing stop decides the tail. Most traders move to breakeven once **TP1 ✓** prints. Treat **+** and **POWER** as sizing information, not permission to change the rules.

## Settings

**Sensitivity (1–10, default 5)** — 1 = fastest flips, 10 = strongest trends only. The dial that defines the module's personality: lower it intraday, raise it on daily.

**Auto-Optimize (off)** — searches recent history for the best-scoring sensitivity and applies it. The tradeoff is real: it re-tunes as new bars arrive, so the setting drifts under you and past signals can restyle — a **+** you noted last month may render plain next week. Use it once to scout a starting number, set that number by hand, then leave it off for stable history.

**Trend Band, Background Tint, BUY/SELL Pills, Signal Tiers, Retest Dots** — chrome toggles, all on by default.

**Shadow Band (off)** — a second band one ATR further from price than the first, filled as a soft cloud. Off by default; turn it on when you want the wider "give it room" line visible next to the working one.

**Take Profit** — *Dynamic (ATR ladder)* places targets at volatility multiples, so they scale with the instrument; **TP Levels** sets how many, 1 to 6, default 3. *Fixed %* uses your own three percentages — **TP1 %**, **TP2 %** and **TP3 %**, default 2 / 4 / 8. *Off* hides the ladder.

**Stop Loss** — *Trailing (band)* rides the band, *Fixed %* holds the set **SL %** (default 3), *Off* leaves risk to you.

**Show Last (default 2)** — how many recent episodes keep full TP/SL chrome. Older signals keep their pill and lose their ladder, which is what keeps the chart readable.

## Signals & alerts

Every tradeable state change fires an event you can alert on. Five types: **te_flip** (the flip itself, either direction, carrying the momentum percentile as its strength — the **+** tier is a grade on this event, not a separate one, so filter on strength), **te_power** (fired alongside a flip that follows an exhaustion extreme — power bottom or power top), **te_retest** (a band touch that held, either side), **te_tp_hit** (a target filled, strength telling you how far up the ladder) and **te_sl_hit**. TP and SL are evaluated on every episode, including ones scrolled past Show Last. Confirmed events are final — recomputing with newer bars never rewrites a past flip. The one exception is Auto-Optimize, which changes the inputs themselves.
